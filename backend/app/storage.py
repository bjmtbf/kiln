import json
import os
import tempfile
import uuid
from fastapi import HTTPException
from .config import FIRINGS


def atomic_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def firing_folder(identifier):
    try:
        return FIRINGS / str(uuid.UUID(identifier))
    except ValueError as e:
        raise HTTPException(400, "Ogiltigt GUID") from e


def read_firing(identifier):
    path = firing_folder(identifier) / "firing.json"
    if not path.exists():
        raise HTTPException(404, "Bränningen hittades inte")
    return json.loads(path.read_text(encoding="utf-8"))
