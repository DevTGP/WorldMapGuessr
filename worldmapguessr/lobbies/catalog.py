"""Item-Katalog für Lobby-Runden: {Gruppe: ["kind:id", …]} aus der TopoJSON-Karte.

Die Keys entsprechen den Feature-Keys im Browser (static/js/map/map.js: `${kind}:${id}`), die Gruppen
den Karten im Menü: "continent", "country-eu", "country-na", "country-sa", "country-af", "country-as", "country-oc" (Staaten nach properties.region)."""
from __future__ import annotations

import json
import os

LAYERS = {"continents": "continent", "countries": "country"}


def group_of(kind: str, geometry: dict) -> str:
    if kind == "country":
        return f"country-{(geometry.get('properties') or {}).get('region', 'EU').lower()}"
    return kind


def load_catalog(topojson_path: str | os.PathLike) -> dict[str, list[str]]:
    with open(topojson_path, encoding="utf-8") as fh:
        objects = json.load(fh)["objects"]
    catalog: dict[str, list[str]] = {}
    for obj, kind in LAYERS.items():
        for g in objects.get(obj, {}).get("geometries", []):
            if g.get("id"):
                catalog.setdefault(group_of(kind, g), []).append(f"{kind}:{g['id']}")
    return catalog
