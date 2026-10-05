from datetime import datetime, timedelta, timezone
from app.calculation import calculate_candidate


def test_candidate_summary():
    base = datetime(2026, 9, 29, 10, tzinfo=timezone.utc)
    samples = [
        {
            "timestamp": (base + timedelta(minutes=15 * i)).isoformat(),
            "output_percent": p,
        }
        for i, p in enumerate((50, 100, 0))
    ]
    prices = [
        {
            "time_start": base.isoformat(),
            "time_end": (base + timedelta(hours=1)).isoformat(),
            "SEK_per_kWh": 0.5,
        }
    ]
    cfg = {
        "energy_tax_sek_kwh": 0,
        "grid_variable_sek_kwh": 0,
        "supplier_markup_sek_kwh": 0,
        "other_variable_sek_kwh": 0,
        "vat_rate": 0,
        "fixed_monthly_sek": 0,
        "monthly_consumption_kwh": 1000,
        "fixed_energy_price_sek_kwh": 1,
    }
    r = calculate_candidate(samples, 4, prices, cfg, base)
    assert r["total_cost_sek"] == 0.75 and r["price_level"] == "yellow"
