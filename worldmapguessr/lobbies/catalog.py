"""Teile-Katalog für Lobby-Runden: {kind: ["kind:id", …]} aus der TopoJSON-Karte.

Die Schlüssel entsprechen den Feature-Keys im Browser (static/js/map/map.js: `${kind}:${id}`)."""
from __future__ import annotations

import json
import os

LAYERS = {"continents": "continent", "countries": "country"}


def load_catalog(topojson_path: str | os.PathLike) -> dict[str, list[str]]:
    with open(topojson_path, encoding="utf-8") as fh:
        objects = json.load(fh)["objects"]
    return {
        kind: [f"{kind}:{g['id']}" for g in objects.get(obj, {}).get("geometries", []) if g.get("id")]
        for obj, kind in LAYERS.items()
    }
