import json
from datetime import timedelta
import httpx
from fastapi import HTTPException
from .config import AREAS, PRICES
from .storage import atomic_json


async def get_prices(area, day):
    if area == "FIXED":
        return []
    area = area.upper()
    if area not in AREAS:
        raise HTTPException(400, "Ogiltigt elområde")
    cache = PRICES / area / str(day.year) / f"{day.month:02d}-{day.day:02d}.json"
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))["prices"]
    url = f"https://www.elprisetjustnu.se/api/v1/prices/{day.year}/{day.month:02d}-{day.day:02d}_{area}.json"
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            response = await client.get(
                url, headers={"User-Agent": "kiln-analyzer/8.0"}
            )
            response.raise_for_status()
            data = response.json()
        if not isinstance(data, list):
            raise ValueError("Oväntat prisformat")
    except (httpx.HTTPError, ValueError) as e:
        raise HTTPException(
            404, f"Inga elpriser finns tillgängliga för {area} den {day.isoformat()}"
        ) from e
    atomic_json(
        cache, {"area": area, "date": day.isoformat(), "source": url, "prices": data}
    )
    return data


async def price_span(area, start, end):
    if area == "FIXED":
        return []
    result = []
    day = start.date()
    while day <= end.date():
        result.extend(await get_prices(area, day))
        day += timedelta(days=1)
    return result
