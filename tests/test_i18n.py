import gzip
import json
import re

from worldmapguessr.i18n import dictionary, translate


def _page(client, path="/", **headers):
    r = client.get(path, headers=headers)
    assert r.status_code == 200
    data = r.get_data()
    return gzip.decompress(data).decode() if r.headers.get("Content-Encoding") == "gzip" else data.decode()


def test_dictionaries_match():
    """Gleiche Schlüssel, gleiche Platzhalter, Mehrzahl in beiden Sprachen"""
    de, en = dictionary("de"), dictionary("en")
    assert de.keys() == en.keys()
    for key in de:
        assert type(de[key]) is type(en[key]), key
        vars_ = lambda v: sorted(set(re.findall(r"\{(\w+)\}", json.dumps(v))))  # noqa: E731
        assert vars_(de[key]) == vars_(en[key]), key


def test_translate_placeholders_and_plural():
    assert translate("de", "unit.items", n=1) == "1 Item"
    assert translate("en", "unit.items", n=3) == "3 items"
    assert translate("en", "join.title", code="K7M2Q") == "Join lobby K7M2Q"
    assert translate("en", "does.not.exist") == "does.not.exist"


def test_language_from_browser_and_cookie(client):
    assert '<html lang="de">' in _page(client, **{"Accept-Language": "de-DE,de;q=0.9,en;q=0.8"})
    en = _page(client, **{"Accept-Language": "fr-FR,en;q=0.5"})
    assert '<html lang="en">' in en and ">Play</button>" not in en  # Knopf enthält noch ein SVG
    assert "Play" in en and "Spielen" not in en
    assert '<html lang="en">' in _page(client, **{"Accept-Language": "fr"})  # unbekannt → Englisch
    client.set_cookie("wmg_lang", "de")
    assert '<html lang="de">' in _page(client, **{"Accept-Language": "en"})
    stats = _page(client, "/stats")
    assert '<html lang="de">' in stats and "Statistik" in stats


def test_page_carries_dictionary_for_browser(client):
    html = _page(client, **{"Accept-Language": "en"})
    m = re.search(r"i18n: (\{.*\}),\s+// Sprache", html)
    data = json.loads(m.group(1))
    assert data["lang"] == "en" and data["dict"]["home.play"] == "Play"


def test_html_and_json_gzip(client):
    r = client.get("/", headers={"Accept-Encoding": "gzip"})
    assert r.headers["Content-Encoding"] == "gzip" and "Accept-Encoding" in r.headers["Vary"]
    assert b"WorldMapGuessr" in gzip.decompress(r.get_data())
    assert "Content-Encoding" not in client.get("/").headers
    r = client.get("/api/items", headers={"Accept-Encoding": "gzip"})
    items = json.loads(gzip.decompress(r.get_data()))["items"]
    africa = next(i for i in items if i["kind"] == "continent" and i["code"] == "AF")
    assert africa["name"] == "Afrika" and africa["nameEn"] == "Africa"
