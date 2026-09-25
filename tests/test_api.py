def test_continents_are_seeded(client):
    items = client.get("/api/items?kind=continent").get_json()["items"]
    assert sorted(i["code"] for i in items) == ["AF", "AN", "AS", "EU", "NA", "OC", "SA"]
    assert all(i["spawned"] == i["correct"] == i["incorrect"] == 0 for i in items)


def test_european_countries_are_seeded(client):
    items = client.get("/api/items?kind=country").get_json()["items"]
    codes = {i["code"] for i in items}
    assert len(items) == 45
    assert {"DEU", "FRA", "RUS", "XKX", "VAT", "MCO", "SMR"} <= codes
    assert "CYP" not in codes and "TUR" not in codes
    names = {i["code"]: i["name"] for i in items}
    assert names["DEU"] == "Deutschland"


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
