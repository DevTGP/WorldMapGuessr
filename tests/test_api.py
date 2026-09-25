def test_continents_are_seeded(client):
    items = client.get("/api/items?kind=continent").get_json()["items"]
    assert sorted(i["code"] for i in items) == ["AF", "AN", "AS", "EU", "NA", "OC", "SA"]
    assert all(i["spawned"] == i["correct"] == i["incorrect"] == 0 for i in items)


def test_countries_are_seeded(client):
    items = client.get("/api/items?kind=country").get_json()["items"]
    codes = {i["code"] for i in items}
    assert len(items) == 45 + 23 + 12 + 54 + 49 + 14               # Europa, Nord-/Südamerika, Afrika, Asien, Ozeanien
    assert {"DEU", "FRA", "RUS", "XKX", "VAT", "MCO", "SMR"} <= codes
    assert {"USA", "CAN", "MEX", "CUB", "PAN", "KNA", "TTO"} <= codes
    assert {"BRA", "ARG", "CHL", "GUY", "SUR", "URY"} <= codes
    assert {"EGY", "ZAF", "MDG", "SOM", "SSD", "SWZ", "CPV", "SYC", "MUS"} <= codes
    assert {"CHN", "IND", "JPN", "TUR", "KAZ", "CYP", "TWN", "PSE", "MDV", "SGP", "TLS"} <= codes
    assert {"AUS", "NZL", "PNG", "FJI", "KIR", "TUV", "NRU", "WSM", "TON"} <= codes
    assert not {"GRL", "GUF", "FLK", "ESH", "REU", "MYT", "HKG", "MAC", "NCL", "PYF", "COK", "GUM"} & codes
    names = {i["code"]: i["name"] for i in items}
    assert names["DEU"] == "Deutschland" and names["USA"] == "Vereinigte Staaten"
    assert names["SWZ"] == "Eswatini" and names["COD"] == "Demokratische Republik Kongo"


def test_catalog_groups_countries_by_region(app):
    catalog = app.extensions["lobby_store"].catalog
    assert len(catalog["continent"]) == 7
    assert len(catalog["country-eu"]) == 45 and "country:DEU" in catalog["country-eu"]
    assert len(catalog["country-na"]) == 23 and "country:USA" in catalog["country-na"]
    assert len(catalog["country-sa"]) == 12 and "country:BRA" in catalog["country-sa"]
    assert len(catalog["country-af"]) == 54 and "country:SOM" in catalog["country-af"]
    assert len(catalog["country-as"]) == 49 and "country:CYP" in catalog["country-as"]
    assert "country:RUS" in catalog["country-eu"] and "country:CYP" not in catalog["country-eu"]
    assert len(catalog["country-oc"]) == 14 and "country:AUS" in catalog["country-oc"]


def test_record_event(client):
    uid = client.get("/api/items").get_json()["items"][0]["uid"]
    r = client.post(f"/api/items/{uid}/events", json={"event": "spawned"})
    assert r.status_code == 200 and r.get_json()["spawned"] == 1
    r = client.post(f"/api/items/{uid}/events", json={"event": "correct"})
    assert r.get_json()["correct"] == 1
    assert client.get(f"/api/items/{uid}").get_json()["correct"] == 1


def test_invalid_requests(client):
    uid = client.get("/api/items").get_json()["items"][0]["uid"]
    assert client.post(f"/api/items/{uid}/events", json={"event": "x"}).status_code == 400
    assert client.post(f"/api/items/{uid}/events").status_code == 400
    assert client.post("/api/items/unbekannt/events", json={"event": "spawned"}).status_code == 404
    assert client.get("/api/items/unbekannt").status_code == 404


def test_index_page(client):
    r = client.get("/")
    assert r.status_code == 200 and b'id="map"' in r.data


def test_stats_page(client):
    r = client.get("/stats")
    assert r.status_code == 200 and b'id="table"' in r.data
    assert b"stats/stats.js" in r.data
