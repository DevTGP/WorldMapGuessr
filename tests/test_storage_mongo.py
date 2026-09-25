"""MongoDB-Backend (mit mongomock): Items, Lobby-Persistenz, Übernahme aus items.json."""
import json

import mongomock
import pytest

from worldmapguessr import create_app
from worldmapguessr.item_store import InvalidEvent, ItemStore, UnknownItem
from worldmapguessr.lobbies.persistence import MongoLobbyPersistence
from worldmapguessr.lobbies.store import LobbyStore
from worldmapguessr.storage.mongo_items import MongoItemStore


@pytest.fixture()
def db():
    return mongomock.MongoClient().db


def test_items_ensure_record_and_errors(db):
    store = MongoItemStore(db["items"])
    a = store.ensure("country", "DEU", "Deutschland")
    b = store.ensure("country", "DEU", "Deutschland (neu)")    # gleicher Schlüssel → gleiche UID
    assert a["uid"] == b["uid"] and b["name"] == "Deutschland (neu)"
    assert "_id" not in a
    store.record(a["uid"], "spawned")
    doc = store.record(a["uid"], "correct")
    assert (doc["spawned"], doc["correct"], doc["incorrect"]) == (1, 1, 0)
    assert store.get(a["uid"])["correct"] == 1
    assert [i["code"] for i in store.list("country")] == ["DEU"]
    with pytest.raises(InvalidEvent):
        store.record(a["uid"], "x")
    with pytest.raises(UnknownItem):
        store.record("nope", "spawned")
    with pytest.raises(UnknownItem):
        store.get("nope")


def test_import_json_keeps_uids_merges_and_is_idempotent(db, tmp_path):
    js = ItemStore(tmp_path / "items.json")
    deu = js.ensure("country", "DEU", "Deutschland")
    js.record(deu["uid"], "correct")
    js.record(deu["uid"], "correct")
    data = json.loads((tmp_path / "items.json").read_text(encoding="utf-8"))

    store = MongoItemStore(db["items"])
    other = store.ensure("country", "DEU", "Deutschland")          # schon da, andere UID, 1 Treffer
    store.record(other["uid"], "correct")
    assert store.import_json(data) == {"imported": 1, "skipped": 0, "merged": 1}
    doc = store.get(deu["uid"])
    assert doc["correct"] == 3                                     # 2 aus JSON + 1 aus Mongo
    assert len(store.list()) == 1
    assert store.import_json(data) == {"imported": 0, "skipped": 1, "merged": 0}


def test_lobbies_survive_restart(db):
    s1 = LobbyStore(MongoLobbyPersistence(db["lobbies"]))
    lobby, host = s1.create(player_name="Host", password="pw")
    s1.join(lobby["code"], name="Gast", password="pw")
    s2 = LobbyStore(MongoLobbyPersistence(db["lobbies"]))          # "Neustart"
    again = s2.get(lobby["code"])
    assert again["host"] == host["id"] and len(again["players"]) == 2
    assert s2.authenticate(lobby["code"], host["id"], host["token"])
    s2.close(lobby["code"], host["id"])
    assert db["lobbies"].count_documents({}) == 0


def test_app_imports_items_on_first_start(tmp_path):
    js = ItemStore(tmp_path / "old.json")
    old = js.ensure("continent", "AF", "Afrika")
    js.record(old["uid"], "spawned")
    client = mongomock.MongoClient()
    factory = lambda *a, **k: client  # noqa: E731 – beide Starts sehen dieselbe "Datenbank"
    cfg = {
        "TESTING": True, "LOBBY_EXPIRY_THREAD": False,
        "MONGODB_URI": "mongodb://test.invalid", "MONGODB_DB": "wmg", "MONGODB_CLIENT_FACTORY": factory,
        "ITEM_IMPORT_PATH": str(tmp_path / "old.json"),
    }
    app = create_app(cfg)
    items = app.test_client().get("/api/items?kind=continent").get_json()["items"]
    af = next(i for i in items if i["code"] == "AF")
    assert af["uid"] == old["uid"] and af["spawned"] == 1          # UID und Zähler übernommen
    assert len(items) == 7                                          # restliche Kontinente neu angelegt
    create_app(cfg)                                                 # zweiter Start: kein Doppel-Import
    assert client.wmg.items.find_one({"_id": old["uid"]})["spawned"] == 1


def test_health(client, app):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.get_json()["storage"] == app.extensions["storage"].backend
