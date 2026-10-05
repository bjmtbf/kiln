import json
import os
from pathlib import Path

DATA = Path(os.getenv("DATA_DIR", "/data"))
FIRINGS = DATA / "firings"
PRICES = DATA / "electricity"
FIRINGS.mkdir(parents=True, exist_ok=True)
PRICES.mkdir(parents=True, exist_ok=True)
MODELS = json.loads((Path(__file__).parent / "kilns.json").read_text(encoding="utf-8"))[
    "models"
]
MODEL_MAP = {x["model"]: x for x in MODELS}
AREAS = {"SE1", "SE2", "SE3", "SE4", "FIXED"}
DEFAULTS = {
    "energy_tax_sek_kwh": 0.36,
    "grid_variable_sek_kwh": 0.30,
    "supplier_markup_sek_kwh": 0.05,
    "other_variable_sek_kwh": 0.01,
    "vat_rate": 0.25,
    "fixed_monthly_sek": 150.0,
    "monthly_consumption_kwh": 1000.0,
    "fixed_energy_price_sek_kwh": 1.0,
}
