"""Schritt 1: Landflächen in „Zellen“ zerlegen – Grundlage für Kacheln und Item-Umrisse.

Quelle: Natural Earth 1:10m Admin-0 (volle Genauigkeit, von GitHub geladen und in tmp/src zwischengespeichert),
deutsche Namen und Regionen aus world-countries.

Eine Zelle ist ein Stück Land mit genau einem Kontinent und höchstens einem Staat-Item, z. B.
(EU, country:RUS) und (AS, country:RUS) für die beiden Teile Russlands, (SA, –) für Französisch-Guayana.
Kontinent-Items bestehen aus allen Zellen ihres Kontinents, Staat-Items aus ihren Zellen. Später kommen
Bundesländer/Regionen als weitere Unterteilung hinzu.

Ausgabe:
  tmp/pieces.geojson  ein Polygon je Quell-Stück, properties.cell = Index in cells
  tmp/cells.json      {"cells": [{"continent", "item"}], "items": {key: {kind, id, name, group, region}}}
"""
import json
import os
import urllib.request

from shapely.geometry import MultiPolygon, Polygon, box, mapping, shape
from shapely.geometry.polygon import orient

SRC_URL = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
           "ne_10m_admin_0_countries.geojson")
SRC = "tmp/src/ne_10m_admin_0_countries.geojson"
WORLD_COUNTRIES = "node_modules/world-countries/countries.json"

CONTINENT_NAMES = {"AF": "Afrika", "AN": "Antarktika", "AS": "Asien", "EU": "Europa",
                   "NA": "Nordamerika", "SA": "Südamerika", "OC": "Ozeanien"}

# Kontinent-Sonderfälle (Features ohne ISO-Nummer oder mit abweichender Zuordnung).
# Zypern liegt geografisch in Asien (samt Nordzypern, UN-Pufferzone und britischen Basen).
OVERRIDE_ID = {"010": "AN", "239": "SA", "260": "AF", "074": "AF", "334": "OC", "643": "RU", "196": "AS"}
OVERRIDE_NAME = {
    "Somaliland": "AF", "Kosovo": "EU", "N. Cyprus": "AS", "Cyprus U.N. Buffer Zone": "AS",
    "Dhekelia": "AS", "Akrotiri": "AS", "Indian Ocean Ter.": "OC", "Coral Sea Is.": "OC",
    "Siachen Glacier": "AS", "Baikonur": "AS", "Spratly Is.": "AS", "Scarborough Reef": "AS",
    "USNB Guantanamo Bay": "NA", "Clipperton I.": "NA", "Bajo Nuevo Bank": "NA", "Serranilla Bank": "NA",
}
REGION = {"Africa": "AF", "Asia": "AS", "Europe": "EU", "Oceania": "OC", "Antarctic": "AN"}
NE_CONTINENT = {"Africa": "AF", "Asia": "AS", "Europe": "EU", "Oceania": "OC", "Antarctica": "AN",
                "North America": "NA", "South America": "SA", "Seven seas (open ocean)": "AF"}

# "Klassisch Europa": unabhängige Staaten der Region Europa ohne Zypern, dazu Kosovo (45 Staaten)
EXCLUDED_EUROPE = {"CYP"}
KOSOVO = {"code": "XKX", "name": "Kosovo", "region": "EU"}
NAME_OVERRIDE = {
    "SWZ": "Eswatini", "COD": "Demokratische Republik Kongo", "COG": "Republik Kongo", "CIV": "Elfenbeinküste",
    "CAF": "Zentralafrikanische Republik",
}
# Quell-Features, die als Teil eines anderen Items zählen
PART_OF = {
    "Somaliland": {"code": "SOM", "name": "Somalia", "region": "AF"},      # international nicht anerkannt
    "N. Cyprus": {"code": "CYP", "name": "Zypern", "region": "AS"},
    "Cyprus U.N. Buffer Zone": {"code": "CYP", "name": "Zypern", "region": "AS"},
    "Dhekelia": {"code": "CYP", "name": "Zypern", "region": "AS"},         # britische Basen auf Zypern
    "Akrotiri": {"code": "CYP", "name": "Zypern", "region": "AS"},
    "Baikonur": {"code": "KAZ", "name": "Kasachstan", "region": "AS"},     # an Russland verpachtet
    "Hong Kong": {"code": "CHN", "name": "China", "region": "AS"},         # Sonderverwaltungszonen Chinas
    "Macao": {"code": "CHN", "name": "China", "region": "AS"},
}
# Nicht als unabhängig geführt, aber eigene Items (Entscheidung wie beim Kosovo)
EXTRA_ITEMS = {"TWN": "AS", "PSE": "AS"}

# Europäischer Teil Russlands: westlich von Ural-Kamm, Ural-Fluss und Kaspischem Meer.
EURO_RUSSIA = Polygon([
    (15, 40), (15, 83), (72, 83), (69.5, 76), (64, 72), (66, 68.8), (64.5, 67.3),
    (62, 66), (60.1, 65), (59.4, 63), (59.2, 61), (59.1, 59.6), (59.8, 57.5),
    (59.8, 55.5), (59.2, 53.5), (58.6, 51.2), (57, 51.4), (55.1, 51.75),
    (53, 51.5), (51.5, 50.8), (50, 45), (48, 40),
])
# Europäische Staaten: nur Landesteile in Europa (ohne Französisch-Guayana, Réunion, Karibische Niederlande …)
COUNTRY_BOX = box(-32, 27, 45, 83)
# Marokko als Item wie bei den Vereinten Nationen ohne Westsahara: Grenze 27°40′ N
CUT_TO = {"MAR": box(-20, 27 + 40 / 60, 0, 40)}


def load_source():
    if not os.path.exists(SRC):
        os.makedirs(os.path.dirname(SRC), exist_ok=True)
        print("lade", SRC_URL)
        urllib.request.urlretrieve(SRC_URL, SRC)
    return json.load(open(SRC, encoding="utf-8"))["features"]


wc = json.load(open(WORLD_COUNTRIES, encoding="utf-8"))
BY_NUM = {c["ccn3"]: c for c in wc if c.get("ccn3")}


def iso_num(props):
    n = str(props.get("ISO_N3_EH") or props.get("ISO_N3") or "-99")
    return None if n.startswith("-") else n.zfill(3)


def continent_of(num, name, props):
    if num in OVERRIDE_ID:
        return OVERRIDE_ID[num]
    if name in OVERRIDE_NAME:
        return OVERRIDE_NAME[name]
    c = BY_NUM.get(num)
    if c:
        if c["region"] == "Americas":
            return "SA" if c.get("subregion") == "South America" else "NA"
        if c["region"] in REGION:
            return REGION[c["region"]]
    return NE_CONTINENT[props["CONTINENT"]]


def country_item(num, name):
    """Spielbarer Staat? → {code, name, region} oder None"""
    if name == "Kosovo":
        return KOSOVO
    if name in PART_OF:
        return PART_OF[name]
    c = BY_NUM.get(num)
    if c and c["cca3"] in EXTRA_ITEMS:
        return {"code": c["cca3"], "name": c["translations"]["deu"]["common"], "region": EXTRA_ITEMS[c["cca3"]]}
    if not c or c.get("independent") is not True:
        return None
    item = {"code": c["cca3"], "name": NAME_OVERRIDE.get(c["cca3"], c["translations"]["deu"]["common"])}
    region, sub = c["region"], c.get("subregion")
    if c["cca3"] == "CYP":
        return {**item, "region": "AS"}                       # Zypern: geografisch Asien
    if region == "Europe" and c["cca3"] not in EXCLUDED_EUROPE:
        return {**item, "region": "EU"}
    if region == "Americas":
        return {**item, "region": "SA" if sub == "South America" else "NA"}
    if region in ("Africa", "Asia", "Oceania"):
        return {**item, "region": REGION[region]}
    return None


def overseas_continent(pt):
    """Kontinent eines Landesteils europäischer Staaten außerhalb Europas nach seiner Lage."""
    lon, lat = pt.x, pt.y
    if lon < -100 or lon > 100:
        return "OC"                          # Pazifik
    if lon < -25:
        return "SA" if lat < 10 else "NA"    # Französisch-Guayana | Karibik, St. Pierre
    return "AF"                              # Réunion, Mayotte …


def polys(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [p for part in g.geoms for p in polys(part)]


cells, cell_index, pieces = [], {}, []
items = {f"continent:{k}": {"kind": "continent", "id": k, "name": v, "group": "continent", "region": k}
         for k, v in CONTINENT_NAMES.items()}


def add(poly, continent, item_key):
    cell = cell_index.setdefault((continent, item_key), len(cells))
    if cell == len(cells):
        cells.append({"continent": continent, "item": item_key})
    for p in polys(poly):
        if p.area > 0:
            pieces.append({"type": "Feature", "properties": {"cell": cell},
                           "geometry": mapping(orient(p, sign=-1.0))})  # d3: Außenring im Uhrzeigersinn


for f in load_source():
    props = f["properties"]
    name, num = props["NAME"], iso_num(props)
    continent = continent_of(num, name, props)
    item = country_item(num, name)
    key = f"country:{item['code']}" if item else None
    if item:
        items.setdefault(key, {"kind": "country", "id": item["code"], "name": item["name"],
                               "group": f"country-{item['region'].lower()}", "region": item["region"]})
    geom = shape(f["geometry"]).buffer(0)
    if item and item["code"] in CUT_TO:
        area = CUT_TO[item["code"]]
        add(geom.intersection(area), continent, key)
        add(geom.difference(area), continent, None)
        continue
    for p in polys(geom):
        if continent == "RU":
            add(p.intersection(EURO_RUSSIA), "EU", key)
            add(p.difference(EURO_RUSSIA), "AS", key)
        elif continent == "EU":
            pt = p.representative_point()
            if COUNTRY_BOX.contains(pt):
                add(p, "EU", key if item and item["region"] == "EU" else None)
            else:
                add(p, overseas_continent(pt), None)
        else:
            add(p, continent, key)

os.makedirs("tmp", exist_ok=True)
json.dump({"type": "FeatureCollection", "features": pieces}, open("tmp/pieces.geojson", "w"))
json.dump({"cells": cells, "items": items}, open("tmp/cells.json", "w"), ensure_ascii=False)
by_region = {}
for it in items.values():
    by_region[it["group"]] = by_region.get(it["group"], 0) + 1
print("Stücke:", len(pieces), "Zellen:", len(cells), "Items:", by_region)
