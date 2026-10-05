import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, Query
from .calculation import (
    aware,
    calculate,
    calculate_candidate_prepared,
    prepare_candidate_context,
    energy_bounds,
)
from .config import AREAS, DEFAULTS, FIRINGS, MODELS, MODEL_MAP
from .parser import parse_nabertherm
from .pricing import get_prices, price_span
from .storage import atomic_json, read_firing

app = FastAPI(
    title="Nabertherm Kiln API",
    version="9.4.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)


def config_for(doc):
    return {**DEFAULTS, **doc.get("user_metadata", {}).get("cost_assumptions", {})}


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "9.4.0"}


@app.get("/api/kilns")
def kilns():
    return MODELS


@app.get("/api/firings")
def listing(
    q: str = Query(""),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
):
    rows = []
    needle = q.casefold().strip()
    for path in FIRINGS.glob("*/firing.json"):
        try:
            doc = __import__("json").loads(path.read_text(encoding="utf-8"))
            user = doc.get("user_metadata", {})
            controller = doc.get("controller_metadata", {})
            row = {
                "id": doc["id"],
                "name": user.get("name"),
                "original_filename": doc.get("original_filename"),
                "start_time": controller.get("start_time"),
                "program_name": controller.get("program_name"),
                "kiln_model": user.get("kiln_model"),
                "comment": user.get("comment", ""),
                "electricity_area": user.get("electricity_area", "SE4"),
                "estimated_total_cost_sek": user.get("estimated_total_cost_sek"),
            }
            hay = " ".join(str(v or "") for v in row.values()).casefold()
            if not needle or needle in hay:
                rows.append(row)
        except (OSError, ValueError, KeyError):
            continue
    rows.sort(key=lambda x: x.get("start_time") or "", reverse=True)
    total = len(rows)
    start = (page - 1) * page_size
    return {
        "items": rows[start : start + page_size],
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@app.get("/api/overview")
def overview():
    return listing("", 1, 10000)["items"]


@app.post("/api/firings", status_code=201)
async def upload(
    file: Annotated[UploadFile, File()],
    name: Annotated[str, Form()],
    kiln_model: Annotated[str, Form()],
    electricity_area: Annotated[str, Form()] = "SE4",
    comment: Annotated[str, Form()] = "",
    energy_tax_sek_kwh: Annotated[float, Form()] = 0.36,
    grid_variable_sek_kwh: Annotated[float, Form()] = 0.30,
    supplier_markup_sek_kwh: Annotated[float, Form()] = 0.05,
    other_variable_sek_kwh: Annotated[float, Form()] = 0.01,
    vat_rate: Annotated[float, Form()] = 0.25,
    fixed_monthly_sek: Annotated[float, Form()] = 150,
    monthly_consumption_kwh: Annotated[float, Form()] = 1000,
    fixed_energy_price_sek_kwh: Annotated[float, Form()] = 1,
    cc0_consent: Annotated[bool, Form()] = False,
):
    model = MODEL_MAP.get(kiln_model)
    area = electricity_area.upper()
    if not name.strip():
        raise HTTPException(422, "Namn måste anges")
    if not cc0_consent:
        raise HTTPException(
            422, "Du måste godkänna CC0-villkoret innan filen kan laddas upp"
        )
    if not model or area not in AREAS:
        raise HTTPException(422, "Ogiltig ugnsmodell eller elområde")
    raw = await file.read(25 * 1024 * 1024 + 1)
    if len(raw) > 25 * 1024 * 1024:
        raise HTTPException(413, "Filen är för stor")
    try:
        parsed = parse_nabertherm(raw)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    values = locals()
    cfg = {key: values[key] for key in DEFAULTS}
    start = datetime.fromisoformat(parsed["controller_metadata"]["start_time"])
    end = datetime.fromisoformat(parsed["controller_metadata"]["end_time"])
    result = calculate(
        parsed["samples"],
        model["power_kw"],
        await price_span(area, start, end),
        cfg,
        area,
        strict=area != "FIXED",
    )
    identifier = str(uuid.uuid4())
    folder = FIRINGS / identifier
    folder.mkdir()
    doc = {
        "schema_version": 9,
        "id": identifier,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "original_filename": Path(file.filename or "upload.csv").name,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "user_metadata": {
            "name": name.strip(),
            "kiln_model": model["model"],
            "kiln_volume_l": model.get("volume_l"),
            "rated_power_kw": model["power_kw"],
            "electricity_area": area,
            "comment": comment.strip(),
            "energy_kwh": result["energy_kwh"],
            "spot_cost_sek": result["spot_cost_sek"],
            "estimated_total_cost_sek": result["total_cost_sek"],
            "cost_breakdown": result["breakdown"],
            "cost_assumptions": cfg,
            "license": {
                "spdx_id": "CC0-1.0",
                "consent": True,
                "accepted_at": datetime.now(timezone.utc).isoformat(),
            },
        },
        "cost_intervals": result["intervals"],
        "active_start_index": result["active_start_index"],
        "active_end_index": result["active_end_index"],
        **parsed,
    }
    try:
        (folder / "original.csv").write_bytes(raw)
        atomic_json(folder / "firing.json", doc)
    except Exception:
        __import__("shutil").rmtree(folder, ignore_errors=True)
        raise
    return {"id": identifier, "firing": doc}


@app.get("/api/firings/{identifier}")
def one(identifier):
    return read_firing(identifier)


@app.post("/api/firings/{identifier}/cost-at")
async def cost_at(
    identifier,
    start_time: datetime,
    area: str | None = None,
    fixed_price: float | None = None,
):
    doc = read_firing(identifier)
    cfg = config_for(doc)
    chosen = (area or doc["user_metadata"].get("electricity_area", "SE4")).upper()
    if chosen not in AREAS:
        raise HTTPException(400, "Ogiltigt elområde")
    if fixed_price is not None:
        cfg["fixed_energy_price_sek_kwh"] = fixed_price
    duration = datetime.fromisoformat(
        doc["controller_metadata"]["end_time"]
    ) - datetime.fromisoformat(doc["controller_metadata"]["start_time"])
    start = aware(start_time)
    result = calculate(
        doc["samples"],
        doc["user_metadata"]["rated_power_kw"],
        await price_span(chosen, start, start + duration),
        cfg,
        chosen,
        start,
        strict=chosen != "FIXED",
    )
    return {"area": chosen, "start_time": start.isoformat(), **result}


@app.get("/api/firings/{identifier}/cheapest")
async def cheapest(identifier, area: str | None = None):
    doc = read_firing(identifier)
    chosen = (area or doc["user_metadata"].get("electricity_area", "SE4")).upper()
    if chosen == "FIXED":
        raise HTTPException(400, "Optimering är inte relevant vid fast elpris")
    now = datetime.now().astimezone()
    price_list = []
    for day in (now.date(), (now + timedelta(days=1)).date()):
        try:
            price_list.extend(await get_prices(chosen, day))
        except HTTPException:
            pass
    if not price_list:
        raise HTTPException(
            404, "Det finns inga publicerade framtida elpriser för valt elområde."
        )
    i0, i1 = energy_bounds(doc["samples"])
    source = datetime.fromisoformat(doc["samples"][0]["timestamp"])
    active_offset = datetime.fromisoformat(doc["samples"][i0]["timestamp"]) - source
    active_end = (
        datetime.fromisoformat(doc["samples"][i1]["timestamp"]) - source
        if i1 < len(doc["samples"])
        else datetime.fromisoformat(doc["samples"][-1]["timestamp"]) - source
    )
    active_duration = active_end - active_offset
    known_end = max(datetime.fromisoformat(p["time_end"]) for p in price_list)
    starts = []
    seen = set()
    for item in price_list:
        price_start = datetime.fromisoformat(item["time_start"])
        candidate = price_start - active_offset
        key = candidate.isoformat()
        if (
            price_start >= now
            and price_start + active_duration <= known_end
            and key not in seen
        ):
            seen.add(key)
            starts.append(candidate)
    configuration = config_for(doc)
    power = doc["user_metadata"]["rated_power_kw"]
    context = prepare_candidate_context(doc["samples"], power, price_list)
    summaries = []
    for candidate in starts:
        summary = calculate_candidate_prepared(context, configuration, candidate)
        if summary:
            summaries.append(
                {
                    "start_time": candidate.isoformat(),
                    "start_ms": int(candidate.timestamp() * 1000),
                    **summary,
                }
            )
    if not summaries:
        raise HTTPException(
            404,
            "Det går inte att beräkna en billigaste framtida start ännu eftersom de publicerade spotpriserna inte täcker hela bränningens energiförbrukande period. Före cirka kl. 13 saknas normalt morgondagens priser. Försök igen senare när nästa dygns spotpriser har publicerats.",
        )
    best_summary = min(summaries, key=lambda x: x["total_cost_sek"])
    best_start = datetime.fromisoformat(best_summary["start_time"])
    full = calculate(
        doc["samples"],
        power,
        price_list,
        configuration,
        chosen,
        best_start,
        strict=True,
    )
    candidates = [
        {
            "start_time": x["start_time"],
            "start_ms": x["start_ms"],
            "total_cost_sek": x["total_cost_sek"],
            "average_energy_price_sek_kwh": x["average_energy_price_sek_kwh"],
            "price_level": x["price_level"],
        }
        for x in summaries
    ]
    spot_prices = [
        {
            "time": p["time_start"],
            "start_ms": int(datetime.fromisoformat(p["time_start"]).timestamp() * 1000),
            "spot_price_sek_kwh": float(p["SEK_per_kWh"]),
        }
        for p in price_list
        if datetime.fromisoformat(p["time_end"]) > now
    ]
    return {
        "area": chosen,
        "spot_prices": spot_prices,
        "price_available_until": known_end.isoformat(),
        "candidates": candidates,
        **full,
        **best_summary,
    }
