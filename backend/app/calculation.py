from datetime import datetime
from fastapi import HTTPException


def aware(value):
    return value if value.tzinfo else value.astimezone()


def energy_bounds(samples):
    active = [
        i for i, s in enumerate(samples) if float(s.get("output_percent") or 0) > 0
    ]
    return (
        (active[0], min(len(samples) - 1, active[-1] + 1))
        if active
        else (0, max(0, len(samples) - 1))
    )


def price_level(avg):
    return "green" if avg < 0.4 else "yellow" if avg < 1 else "red"


def calculate(samples, kw, price_list, cfg, area, target=None, strict=False):
    if len(samples) < 2:
        return {
            "energy_kwh": 0,
            "spot_cost_sek": 0,
            "total_cost_sek": 0,
            "breakdown": {},
            "intervals": [],
        }
    source = datetime.fromisoformat(samples[0]["timestamp"])
    target = target or source
    points = [
        (
            datetime.fromisoformat(p["time_start"]),
            datetime.fromisoformat(p["time_end"]),
            float(p["SEK_per_kWh"]),
        )
        for p in price_list
    ]
    i0, i1 = energy_bounds(samples)
    energy = base = 0.0
    rows = []
    missing = []
    for index, (a, b) in enumerate(zip(samples, samples[1:])):
        sa = datetime.fromisoformat(a["timestamp"])
        sb = datetime.fromisoformat(b["timestamp"])
        hours = max(0, min(0.25, (sb - sa).total_seconds() / 3600))
        used = kw * max(0, min(100, float(a.get("output_percent") or 0))) / 100 * hours
        moment = aware(target + (sa - source))
        unit = (
            cfg["fixed_energy_price_sek_kwh"]
            if area == "FIXED"
            else next((v for x, y, v in points if x <= moment < y), None)
        )
        if used > 0 and unit is None:
            missing.append(moment)
        energy_cost = used * (unit or 0)
        energy += used
        base += energy_cost
        tax = used * cfg["energy_tax_sek_kwh"]
        grid = used * cfg["grid_variable_sek_kwh"]
        markup = used * cfg["supplier_markup_sek_kwh"]
        other = used * cfg["other_variable_sek_kwh"]
        fixed = (
            cfg["fixed_monthly_sek"] * (used / cfg["monthly_consumption_kwh"])
            if cfg["monthly_consumption_kwh"]
            else 0
        )
        pre = energy_cost + tax + grid + markup + other + fixed
        vat = pre * cfg["vat_rate"]
        rows.append(
            {
                "timestamp": moment.isoformat(),
                "source_index": index,
                "active": i0 <= index < i1,
                "energy_kwh": round(used, 5),
                "energy_price_sek_kwh": unit,
                "base_ore": round(energy_cost * 100, 3),
                "tax_ore": round(tax * 100, 3),
                "grid_ore": round(grid * 100, 3),
                "markup_ore": round(markup * 100, 3),
                "other_ore": round(other * 100, 3),
                "fixed_ore": round(fixed * 100, 3),
                "vat_ore": round(vat * 100, 3),
                "total_ore": round((pre + vat) * 100, 3),
            }
        )
    if strict and missing:
        raise HTTPException(
            422,
            f"Beräkningen kan inte göras eftersom elpris saknas från {missing[0].isoformat()}. Saknade prisintervall: {len(missing)}.",
        )
    sums = {
        key: sum(r[key] for r in rows) / 100
        for key in (
            "base_ore",
            "tax_ore",
            "grid_ore",
            "markup_ore",
            "other_ore",
            "fixed_ore",
            "vat_ore",
            "total_ore",
        )
    }
    breakdown = {
        "energy_price_sek": round(sums["base_ore"], 2),
        "energy_tax_sek": round(sums["tax_ore"], 2),
        "grid_variable_sek": round(sums["grid_ore"], 2),
        "supplier_markup_sek": round(sums["markup_ore"], 2),
        "other_variable_sek": round(sums["other_ore"], 2),
        "fixed_fee_share_sek": round(sums["fixed_ore"], 2),
        "vat_sek": round(sums["vat_ore"], 2),
        "total_sek": round(sums["total_ore"], 2),
    }
    return {
        "energy_kwh": round(energy, 3),
        "spot_cost_sek": round(base, 2),
        "total_cost_sek": breakdown["total_sek"],
        "breakdown": breakdown,
        "intervals": rows,
        "active_start_index": i0,
        "active_end_index": i1,
    }


def calculate_candidate(samples, kw, price_list, cfg, target):
    """Calculate only values needed to rank a candidate, without interval payloads."""
    from bisect import bisect_right

    if len(samples) < 2:
        return None
    source = datetime.fromisoformat(samples[0]["timestamp"])
    starts = []
    ends = []
    values = []
    for item in price_list:
        starts.append(datetime.fromisoformat(item["time_start"]))
        ends.append(datetime.fromisoformat(item["time_end"]))
        values.append(float(item["SEK_per_kWh"]))
    energy = spot = 0.0
    for a, b in zip(samples, samples[1:]):
        output = max(0, min(100, float(a.get("output_percent") or 0)))
        if output <= 0:
            continue
        sa = datetime.fromisoformat(a["timestamp"])
        sb = datetime.fromisoformat(b["timestamp"])
        hours = max(0, min(0.25, (sb - sa).total_seconds() / 3600))
        used = kw * output / 100 * hours
        moment = aware(target + (sa - source))
        index = bisect_right(starts, moment) - 1
        if index < 0 or moment >= ends[index]:
            return None
        energy += used
        spot += used * values[index]
    if energy <= 0:
        return None
    variable = (
        cfg["energy_tax_sek_kwh"]
        + cfg["grid_variable_sek_kwh"]
        + cfg["supplier_markup_sek_kwh"]
        + cfg["other_variable_sek_kwh"]
    )
    fixed = (
        cfg["fixed_monthly_sek"] * (energy / cfg["monthly_consumption_kwh"])
        if cfg["monthly_consumption_kwh"]
        else 0
    )
    total = (spot + energy * variable + fixed) * (1 + cfg["vat_rate"])
    average = spot / energy
    return {
        "energy_kwh": round(energy, 3),
        "spot_cost_sek": round(spot, 2),
        "total_cost_sek": round(total, 2),
        "average_energy_price_sek_kwh": round(average, 4),
        "price_level": price_level(average),
    }


def prepare_candidate_context(samples, kw, price_list):
    """Precompute the energy profile and sorted price intervals once per request."""
    from bisect import bisect_right

    if len(samples) < 2:
        return None
    source = datetime.fromisoformat(samples[0]["timestamp"])
    energy_profile = []
    for a, b in zip(samples, samples[1:]):
        output = max(0, min(100, float(a.get("output_percent") or 0)))
        if output <= 0:
            continue
        sa = datetime.fromisoformat(a["timestamp"])
        sb = datetime.fromisoformat(b["timestamp"])
        hours = max(0, min(0.25, (sb - sa).total_seconds() / 3600))
        used = kw * output / 100 * hours
        if used > 0:
            energy_profile.append(((sa - source).total_seconds(), used))
    prices = sorted(
        (
            (
                datetime.fromisoformat(x["time_start"]),
                datetime.fromisoformat(x["time_end"]),
                float(x["SEK_per_kWh"]),
            )
            for x in price_list
        ),
        key=lambda x: x[0],
    )
    return {
        "profile": energy_profile,
        "starts": [x[0] for x in prices],
        "ends": [x[1] for x in prices],
        "values": [x[2] for x in prices],
        "bisect_right": bisect_right,
    }


def calculate_candidate_prepared(context, cfg, target):
    if not context or not context["profile"]:
        return None
    energy = spot = 0.0
    starts, ends, values = context["starts"], context["ends"], context["values"]
    bisect_right = context["bisect_right"]
    for offset_seconds, used in context["profile"]:
        moment = aware(
            target + __import__("datetime").timedelta(seconds=offset_seconds)
        )
        index = bisect_right(starts, moment) - 1
        if index < 0 or moment >= ends[index]:
            return None
        energy += used
        spot += used * values[index]
    variable = (
        cfg["energy_tax_sek_kwh"]
        + cfg["grid_variable_sek_kwh"]
        + cfg["supplier_markup_sek_kwh"]
        + cfg["other_variable_sek_kwh"]
    )
    fixed = (
        cfg["fixed_monthly_sek"] * (energy / cfg["monthly_consumption_kwh"])
        if cfg["monthly_consumption_kwh"]
        else 0
    )
    total = (spot + energy * variable + fixed) * (1 + cfg["vat_rate"])
    average = spot / energy
    return {
        "energy_kwh": round(energy, 3),
        "spot_cost_sek": round(spot, 2),
        "total_cost_sek": round(total, 2),
        "average_energy_price_sek_kwh": round(average, 4),
        "price_level": price_level(average),
    }
