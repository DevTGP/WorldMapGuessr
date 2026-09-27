"""Schritt 3: Flüsse und Seen (Natural Earth 1:10m) als Kacheln – im selben Raster und mit denselben
Detailstufen wie die Landkacheln (Schritt 2, index.json levels).

Quelle: ne_10m_rivers_lake_centerlines und ne_10m_lakes (von GitHub, in tmp/src zwischengespeichert).
Jedes Objekt hat in Natural Earth ein min_zoom (Webkarten-Zoomstufe, ab der es gezeigt wird). Daraus wird die
Kartenskala (Pixel je Bogenmaß), ab der der Browser es zeichnet: s = 256 · 2^min_zoom / 2π. Eine Detailstufe
enthält nur Objekte, die bis zu ihrem sMax auftauchen, vereinfacht auf ~0,6 px bei sMax.

Ausgabe (static/data/map/water/z{z}/{x}_{y}.json):
  {"r": [[sMin, ints], …], "k": [[sMin, ring, hole, …], …]}
  r: Flüsse (Linien), k: Seen (Flächen); ints: Punkte als Differenzen in 1/q der Kachelseite ab der
  Kachelecke (wie die Landkacheln). sMin: ab dieser Skala zeichnen.
index.json bekommt "water": {"tiles": {z: [keys]}} und eine neue Version (index.versions.water).
"""
import hashlib
import json
import math
import os
import shutil
import urllib.request

from shapely import STRtree
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Polygon, box, shape
from shapely.geometry.polygon import orient

SRC = "tmp/src"
BASE_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
RIVERS = "ne_10m_rivers_lake_centerlines"
LAKES = "ne_10m_lakes"
OUT = "../worldmapguessr/static/data/map"
SIMPLIFY_PX = 0.6       # Vereinfachung: Abweichung in Pixeln bei sMax der Stufe
MIN_LAKE_PX2 = 4        # Seen, die bei sMax kleiner als so viele px² wären, fehlen in der Stufe
FINEST_SCALE = 20000    # für die feinste Stufe (sMax = ∞): so fein vereinfachen


def fetch(name):
    path = f"{SRC}/{name}.geojson"
    if not os.path.exists(path):
        os.makedirs(SRC, exist_ok=True)
        print(f"Lade {name} …")
        urllib.request.urlretrieve(f"{BASE_URL}{name}.geojson", path)
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)["features"]


def s_min(min_zoom):
    """Kartenskala (px/rad), ab der ein Objekt mit diesem min_zoom gezeichnet wird"""
    return 256 * 2 ** float(min_zoom) / (2 * math.pi)


def encode(coords, tile, level, x, y):
    """Punkte (lon, lat) → Differenzen in 1/q der Kachelseite ab der Kachelecke"""
    size, q = level["tile"], level["q"]
    lon0, lat0 = -180 + x * size, -90 + y * size
    out, px, py = [], 0, 0
    for lon, lat in coords:
        qx, qy = round((lon - lon0) / size * q), round((lat - lat0) / size * q)
        if out and qx == px and qy == py:
            continue
        out += [qx - px, qy - py]
        px, py = qx, qy
    return out


def lines_of(g):
    if g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    if isinstance(g, MultiLineString):
        return list(g.geoms)
    return [p for part in getattr(g, "geoms", []) for p in lines_of(part)]


def polys_of(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [p for part in getattr(g, "geoms", []) for p in polys_of(part)]


def main():
    with open(f"{OUT}/index.json", encoding="utf-8") as fh:
        index = json.load(fh)
    levels = index["levels"]
    rivers = [(s_min(f["properties"].get("min_zoom") or 7), shape(f["geometry"])) for f in fetch(RIVERS) if f["geometry"]]
    lakes = [(s_min(f["properties"].get("min_zoom") or 7), shape(f["geometry"])) for f in fetch(LAKES) if f["geometry"]]

    shutil.rmtree(f"{OUT}/water", ignore_errors=True)
    tiles_index, digest, total = {}, hashlib.sha1(), 0
    for level in levels:
        z, size, e = level["z"], level["tile"], level.get("overlap", 0)
        smax = level["sMax"] or FINEST_SCALE
        tol = SIMPLIFY_PX / smax * 180 / math.pi          # Grad
        min_area = MIN_LAKE_PX2 / smax ** 2 * (180 / math.pi) ** 2
        lv_rivers = [(s, g.simplify(tol, preserve_topology=False)) for s, g in rivers if s <= smax]
        lv_lakes = [(s, g.simplify(tol, preserve_topology=True)) for s, g in lakes if s <= smax and g.area >= min_area]
        r_tree = STRtree([g for _, g in lv_rivers])
        k_tree = STRtree([g for _, g in lv_lakes])
        cols, rows = round(360 / size), round(180 / size)
        keys = []
        os.makedirs(f"{OUT}/water/z{z}", exist_ok=True)
        for x in range(cols):
            for y in range(rows):
                lon0, lat0 = -180 + x * size, -90 + y * size
                clip = box(lon0 - e, lat0 - e, lon0 + size + e, lat0 + size + e)
                r_out, k_out = [], []
                for i in sorted(r_tree.query(clip, predicate="intersects")):
                    s, g = lv_rivers[i]
                    for line in lines_of(g.intersection(clip)):
                        ints = encode(line.coords, None, level, x, y)
                        if len(ints) >= 4:
                            r_out.append([round(s), ints])
                for i in sorted(k_tree.query(clip, predicate="intersects")):
                    s, g = lv_lakes[i]
                    for poly in polys_of(g.intersection(clip)):
                        poly = orient(poly)
                        rings = [encode(poly.exterior.coords, None, level, x, y)]
                        rings += [encode(h.coords, None, level, x, y) for h in poly.interiors]
                        rings = [r for r in rings if len(r) >= 8]
                        if rings:
                            k_out.append([round(s), *rings])
                if not r_out and not k_out:
                    continue
                key = f"{x}_{y}"
                text = json.dumps({"r": r_out, "k": k_out}, separators=(",", ":"))
                with open(f"{OUT}/water/z{z}/{key}.json", "w", encoding="utf-8") as fh:
                    fh.write(text)
                digest.update(text.encode())
                total += len(text)
                keys.append(key)
        tiles_index[str(z)] = keys
        print(f"Wasser Stufe {z}: {len(lv_rivers)} Flüsse, {len(lv_lakes)} Seen, {len(keys)} Kacheln")

    index["water"] = {"tiles": tiles_index}
    set_version(index, "water", digest.hexdigest())
    with open(f"{OUT}/index.json", "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"Wasser: {round(total / 1024)} kB, Version {index['version']}")


def set_version(index, part, digest):
    """Gesamtversion aus Landkacheln (Schritt 2) und Zusatzebenen – ändert sich mit jedem Teil"""
    versions = index.setdefault("versions", {"tiles": index["version"]})
    versions[part] = digest[:10]
    index["version"] = hashlib.sha1(json.dumps(versions, sort_keys=True).encode()).hexdigest()[:10]


if __name__ == "__main__":
    main()
