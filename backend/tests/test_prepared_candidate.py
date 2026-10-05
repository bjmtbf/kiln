from datetime import datetime, timedelta, timezone
from app.calculation import (
    calculate_candidate,
    calculate_candidate_prepared,
    prepare_candidate_context,
)


def config():
    return {
        "energy_tax_sek_kwh": 0.36,
        "grid_variable_sek_kwh": 0.30,
        "supplier_markup_sek_kwh": 0.05,
        "other_variable_sek_kwh": 0.01,
        "vat_rate": 0.25,
        "fixed_monthly_sek": 150,
        "monthly_consumption_kwh": 1000,
        "fixed_energy_price_sek_kwh": 1,
    }


def test_prepared_candidate_matches_legacy_calculation():
    base = datetime(2026, 9, 29, 10, tzinfo=timezone.utc)
    samples = [
        {
            "timestamp": (base + timedelta(minutes=15 * i)).isoformat(),
            "output_percent": p,
        }
        for i, p in enumerate((50, 100, 75, 0))
    ]
    prices = [
        {
            "time_start": (base + timedelta(hours=i)).isoformat(),
            "time_end": (base + timedelta(hours=i + 1)).isoformat(),
            "SEK_per_kWh": 0.5 + i * 0.1,
        }
        for i in range(3)
    ]
    expected = calculate_candidate(samples, 4, prices, config(), base)
    context = prepare_candidate_context(samples, 4, prices)
    assert calculate_candidate_prepared(context, config(), base) == expected


def test_prepared_candidate_rejects_missing_price_interval():
    base = datetime(2026, 9, 29, 10, tzinfo=timezone.utc)
    samples = [
        {"timestamp": base.isoformat(), "output_percent": 100},
        {"timestamp": (base + timedelta(minutes=15)).isoformat(), "output_percent": 0},
    ]
    assert (
        calculate_candidate_prepared(
            prepare_candidate_context(samples, 4, []), config(), base
        )
        is None
    )
