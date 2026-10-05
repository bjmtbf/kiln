import csv
from datetime import datetime
from io import StringIO


def number(value):
    try:
        n = float(value.strip().replace(",", "."))
        return int(n) if n.is_integer() else n
    except (ValueError, AttributeError):
        return None


def parse_nabertherm(raw):
    text = encoding = None
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            text = raw.decode(enc)
            encoding = enc
            break
        except UnicodeDecodeError:
            pass
    if text is None:
        raise ValueError("Filen kunde inte avkodas")
    metadata = {"encoding": encoding}
    stages = []
    samples = []
    header = None
    key_map = {
        "charge name": "charge_name",
        "file name": "source_filename",
        "program number": "program_number",
        "comment": "controller_comment",
        "version": "version",
        "controller": "controller",
        "product line": "product_line",
        "result": "result",
        "furnace-sn": "furnace_serial",
    }
    for row in csv.reader(StringIO(text), delimiter=";"):
        if not row:
            continue
        code = row[0].strip()
        if code in {"1", "2", "3", "6", "81", "82", "83", "84", "86"} and len(row) > 1:
            key = row[1].strip().lower()
            mapped = key_map.get(key)
            if mapped:
                metadata[mapped] = row[2].strip() if len(row) > 2 else ""
            if code == "3":
                metadata["program_name"] = row[3].strip() if len(row) > 3 else ""
                metadata["controller_id"] = row[5].strip() if len(row) > 5 else ""
        elif code == "0" and len(row) > 6:
            metadata["export_date"] = row[2].strip()
            metadata["export_time"] = row[6].strip()
        elif code == "4" and len(row) > 2:
            if row[1].strip().upper() == "HE":
                metadata["stage_columns"] = [x.strip() for x in row[1:] if x.strip()]
            else:
                names = [
                    "stage",
                    "temperature_from",
                    "temperature_to",
                    "hold_hours",
                    "hold_minutes",
                    "rate",
                    "hb",
                    "cooling",
                    "x1",
                    "x2",
                    "x3",
                    "x4",
                    "x5",
                    "x6",
                ]
                stages.append(dict(zip(names, [number(x) for x in row[1:15]])))
        elif code == "7":
            header = [x.strip() for x in row[1:]]
        elif code == "9" and header:
            rec = dict(zip(header, row[1:]))
            dt = rec.get("Date/Time", "").strip()
            try:
                timestamp = datetime.strptime(dt, "%d.%m.%Y %H:%M:%S").isoformat()
            except ValueError:
                continue
            samples.append(
                {
                    "timestamp": timestamp,
                    "segment": number(rec.get("Segment", "")),
                    "setpoint": number(rec.get("Data 1", "")),
                    "setpoint_2": number(rec.get("Data 2", "")),
                    "temperature": number(rec.get("Data 3", "")),
                    "output_percent": number(rec.get("Data 4", "")),
                    "status": number(rec.get("Status", "")),
                }
            )
    if not samples:
        raise ValueError("Ingen tidsserie hittades. Förväntade rader som börjar med 9.")
    temps = [
        s["temperature"] for s in samples if isinstance(s["temperature"], (int, float))
    ]
    metadata.update(
        start_time=samples[0]["timestamp"],
        end_time=samples[-1]["timestamp"],
        sample_count=len(samples),
        max_temperature_c=max(temps) if temps else None,
    )
    return {"controller_metadata": metadata, "stages": stages, "samples": samples}
