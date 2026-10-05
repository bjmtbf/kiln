"""Source-level regression checks for important API contracts.

These checks intentionally ignore formatting so normal refactoring does not break them.
"""

import re
from pathlib import Path


SOURCE = Path("backend/app/main.py").read_text(encoding="utf-8")
COMPACT_SOURCE = re.sub(r"\s+", "", SOURCE).replace('"', "'")


def test_upload_requires_cc0_consent_and_records_license():
    assert "cc0_consent:Annotated[bool,Form()]=False" in COMPACT_SOURCE
    assert "'spdx_id':'CC0-1.0'" in COMPACT_SOURCE


def test_cheapest_returns_actual_spot_series():
    assert "'spot_prices':spot_prices" in COMPACT_SOURCE
    assert "latest_spot_price_sek_kwh" not in SOURCE
