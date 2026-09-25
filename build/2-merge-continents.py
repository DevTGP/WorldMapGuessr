"""Schritt 2: Länder je Kontinent vereinigen (GEOS) und spielbare Staaten (Europa, Nordamerika)
als eigene Ebene ausgeben (Europa, Nord-/Südamerika, Afrika). Russland wird für die Kontinente am Ural / Ural-Fluss geteilt, als Staat
bleibt es ganz. Überseegebiete europäischer Staaten (Französisch-Guayana, Guadeloupe, Réunion,
Karibische Niederlande …) zählen zum Kontinent, auf dem sie liegen – nicht zu Europa.

Die Kontinente sollen später beliebig um die Längsachse gedreht werden können. Deshalb dürfen
sie an der Datumsgrenze (±180°) keine künstlichen Schnittkanten haben: Kontinente, die über
±180° reichen, werden in einem um 360° verschobenen Rahmen (0…360°) vereinigt und erst danach
zurück nach -180…180° gebracht. d3-geo interpretiert Kanten sphärisch und kommt damit klar.
"""
import json
from shapely.geometry import shape, mapping, Polygon, MultiPolygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

NAMES = {"AF": "Afrika", "AN": "Antarktika", "AS": "Asien", "EU": "Europa",
         "NA": "Nordamerika", "SA": "Südamerika", "OC": "Ozeanien"}

# Kontinente, die über die Datumsgrenze reichen (Tschukotka, Aleuten, Fidschi …)
SHIFTED = {"AS", "NA", "OC"}

# Europäischer Teil Russlands: westlich von Ural-Kamm, Ural-Fluss und Kaspischem Meer.
EURO_RUSSIA = Polygon([
    (15, 40), (15, 83), (72, 83), (69.5, 76), (64, 72), (66, 68.8), (64.5, 67.3),
    (62, 66), (60.1, 65), (59.4, 63), (59.2, 61), (59.1, 59.6), (59.8, 57.5),
    (59.8, 55.5), (59.2, 53.5), (58.6, 51.2), (57, 51.4), (55.1, 51.75),
    (53, 51.5), (51.5, 50.8), (50, 45), (48, 40),
])


# Europa behält volle 1:10m-Genauigkeit; außerhalb werden Kleinstinseln weggelassen
EUROPE_BOX = box(-32, 27, 62, 83)
MIN_ISLAND_DEG2 = 0.003          # ~30 km² am Äquator
# Staaten: nur Landesteile in Europa (ohne Französisch-Guayana, Réunion, Karibische Niederlande …)
COUNTRY_BOX = box(-32, 27, 45, 83)


def overseas_continent(pt):
    """Kontinent eines Landesteils außerhalb Europas nach seiner Lage."""
    lon, lat = pt.x, pt.y
    if lon < -100 or lon > 100:
        return "OC"                          # Pazifik
    if lon < -25:
        return "SA" if lat < 10 else "NA"    # Französisch-Guayana | Karibik, St. Pierre
    return "AF"                              # Réunion, Mayotte …


def polys(g):
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [p for part in g.geoms for p in polys(part)]  # GeometryCollection


def to_shifted(g):
    """Alle Polygone in den Rahmen 0…360° bringen (negative Längen +360)."""
    def sh(ring):
        return [(x + 360 if x < 0 else x, y) for x, y in ring.coords]
    out = []
    for p in polys(shape(g) if isinstance(g, dict) else g):
        out.append(Polygon(sh(p.exterior), [sh(r) for r in p.interiors]).buffer(0))
    return unary_union(out)


def unshift_coords(geom):
    """GeoJSON-Koordinaten zurück nach -180…180° (Kanten über ±180° bleiben sphärisch gültig)."""
    def fix(ring):
        return [[x - 360 if x > 180 else x, y] for x, y in ring]
    return {"type": "MultiPolygon",
            "coordinates": [[fix(r) for r in poly] for poly in geom["coordinates"]]}


def drop_tiny_outside_europe(g):
    keep = [p for p in polys(g) if p.area >= MIN_ISLAND_DEG2 or EUROPE_BOX.contains(p.representative_point())]
    return MultiPolygon(keep) if keep else None


fc = json.load(open("tmp/countries.geojson"))
groups = {k: [] for k in NAMES}
antarctica = None
for f in fc["features"]:
    c = f["properties"]["continent"]
    if f["properties"]["name"] == "Antarctica":
        # umschließt den Südpol und hat keine Naht an ±180°: Original übernehmen
        antarctica = f["geometry"]
        continue
    if c == "RU":
        ru = to_shifted(f["geometry"])
        groups["EU"].append(ru.intersection(EURO_RUSSIA))
        groups["AS"].append(ru.difference(EURO_RUSSIA))
    elif c == "EU":
        for p in polys(shape(f["geometry"]).buffer(0)):
            pt = p.representative_point()
            home = "EU" if COUNTRY_BOX.contains(pt) else overseas_continent(pt)
            groups[home].append(to_shifted(p) if home in SHIFTED else p)
    elif c in SHIFTED:
        groups[c].append(to_shifted(f["geometry"]))
    else:
        groups[c].append(shape(f["geometry"]).buffer(0))

out = []
for code, parts in groups.items():
    parts = [q for q in (drop_tiny_outside_europe(x) for x in parts if not x.is_empty) if q is not None]
    if code == "AN":
        geom = antarctica
        print(code, "Original übernommen")
    else:
        u = unary_union(parts)
        # d3-geo erwartet Außenringe im Uhrzeigersinn (sign=-1)
        ps = [orient(p, sign=-1.0) for p in polys(u) if p.area > 0]
        print(code, "Polygone:", len(ps), "Löcher:", sum(len(p.interiors) for p in ps))
        geom = mapping(MultiPolygon(ps))
        geom = unshift_coords(geom) if code in SHIFTED else geom
    out.append({"type": "Feature", "id": code, "properties": {"name": NAMES[code]}, "geometry": geom})

json.dump({"type": "FeatureCollection", "features": out}, open("tmp/continents.geojson", "w"))

# ---------- Spielbare Staaten (Europa, Nord-/Südamerika, Afrika) ----------
# Über die Datumsgrenze reichende Staaten: im Rahmen 0…360° ohne Naht (Tschukotka, Aleuten)
SHIFTED_COUNTRIES = {"RUS", "USA"}

# Mehrere Quell-Features mit demselben Staat (Somalia + Somaliland) zu einem vereinigen
items = {}
for f in fc["features"]:
    info = f["properties"].get("country")
    if not info:
        continue
    if info["code"] in items:
        prev = items[info["code"]]
        prev["geometry"] = mapping(unary_union([shape(prev["geometry"]).buffer(0), shape(f["geometry"]).buffer(0)]))
        print("vereinigt:", info["code"], "+", f["properties"]["name"])
    else:
        items[info["code"]] = {"properties": f["properties"], "geometry": f["geometry"]}

# Marokko: in den Quelldaten (world-atlas 1:10m) samt dem von Marokko kontrollierten Teil der Westsahara.
# Als Item gilt Marokko wie bei den Vereinten Nationen ohne Westsahara: Grenze 27°40′ N.
CUT_TO = {"MAR": box(-20, 27 + 40 / 60, 0, 40)}
for code, area in CUT_TO.items():
    items[code]["geometry"] = mapping(shape(items[code]["geometry"]).buffer(0).intersection(area))

countries = []
for code, f in items.items():
    info = f["properties"]["country"]
    if code in SHIFTED_COUNTRIES:
        g = to_shifted(f["geometry"])
        ps = [orient(p, sign=-1.0) for p in polys(g) if p.area >= MIN_ISLAND_DEG2 or EUROPE_BOX.contains(p.representative_point())]
        geom = unshift_coords(mapping(MultiPolygon(ps)))
    elif info["region"] == "EU":
        g = shape(f["geometry"]).buffer(0)
        ps = [orient(p, sign=-1.0) for p in polys(g) if COUNTRY_BOX.contains(p.representative_point())]
        geom = mapping(MultiPolygon(ps))
    else:
        # wie beim Kontinent: Kleinstinseln (< ~30 km²) weglassen, damit beide Ebenen deckungsgleich sind
        g = shape(f["geometry"]).buffer(0)
        ps = [orient(p, sign=-1.0) for p in polys(g) if p.area >= MIN_ISLAND_DEG2]
        geom = mapping(MultiPolygon(ps))
    countries.append({"type": "Feature", "id": code,
                      "properties": {"name": info["name"], "region": info["region"]}, "geometry": geom})
print("Staaten:", len(countries), {r: sum(c["properties"]["region"] == r for c in countries) for r in ("EU", "NA", "SA", "AF")})
json.dump({"type": "FeatureCollection", "features": countries}, open("tmp/countries-items.geojson", "w"))
