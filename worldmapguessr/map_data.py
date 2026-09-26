"""Kartendaten (static/data/map, gebaut von build/2-tiles.mjs): Index, Startgröße, Auslieferung.

Die Daten liegen unter einem festen Ordner; die Version (Hash der Daten) steckt in der URL
/data/<version>/…, damit Browser sie dauerhaft zwischenspeichern dürfen und nach einem neuen Build
automatisch die neuen Dateien holen."""
from __future__ import annotations

import json
import os

MAP_DIR = os.path.join("data", "map")
CACHE_SECONDS = 365 * 24 * 3600


def map_dir(static_folder: str) -> str:
    return os.path.join(static_folder, MAP_DIR)


def load_index(static_folder: str) -> dict:
    with open(os.path.join(map_dir(static_folder), "index.json"), encoding="utf-8") as fh:
        return json.load(fh)


def start_bytes(static_folder: str, index: dict) -> int:
    """Bytes, die der Browser beim Start lädt: Index, grobe Items, Kacheln der Stufe 0."""
    base = map_dir(static_folder)
    size = os.path.getsize(os.path.join(base, "index.json")) + os.path.getsize(os.path.join(base, "items", "i0.json"))
    for key in index["tiles"]["0"]:
        size += os.path.getsize(os.path.join(base, "tiles", "z0", f"{key}.json"))
    return size


def catalog(index: dict) -> dict[str, list[str]]:
    """{Gruppe: ["kind:id", …]} – alle Items je Menü-Gruppe (für Lobby-Runden)."""
    out: dict[str, list[str]] = {}
    for it in index["items"]:
        out.setdefault(it["group"], []).append(it["key"])
    return out
