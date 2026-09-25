import json
import re

import pytest

from worldmapguessr.lobbies.codes import PATTERN
from worldmapguessr.lobbies.hub import Connection, LobbyHub
from worldmapguessr.lobbies.store import LobbyError, LobbyStore


class FakeWS:
    def __init__(self):
        self.sent = []

    def send(self, data):
        self.sent.append(json.loads(data))


class Clock:
    def __init__(self, t=1000.0):
        self.t = t

    def __call__(self):
        return self.t


@pytest.fixture()
def store(tmp_path):
    return LobbyStore(tmp_path / "lobbies.json")


def connect(hub, code, **msg):
    conn = Connection(FakeWS())
    hub.join(code, conn, {"type": "join", **msg})
    return conn


# ---------- Store ----------
def test_create_short_unique_code_and_persist(tmp_path, store):
    lobby, host = store.create(player_name="Manu", config={"lives": 99, "kinds": ["country", "x"]})
    assert re.fullmatch(PATTERN, lobby["code"])
    assert lobby["host"] == host["id"] and host["token"]
    assert lobby["settings"]["config"]["lives"] == 30          # auf Grenze geklemmt
    assert lobby["settings"]["config"]["kinds"] == ["country"]  # unbekannte Art verworfen
    again = LobbyStore(tmp_path / "lobbies.json")               # neu geladen
    assert again.get(lobby["code"].lower())["host"] == host["id"]


def test_password_and_full(store):
    lobby, _ = store.create(player_name="Host", password="geheim", max_players=2)
    code = lobby["code"]
    with pytest.raises(LobbyError) as e:
        store.join(code, name="Gast", password="falsch")
    assert e.value.code == "password"
    store.join(code, name="Gast", password="geheim", online_count=1)
    with pytest.raises(LobbyError) as e:
        store.join(code, name="Dritter", password="geheim", online_count=2)
    assert e.value.code == "full"


def test_only_host_changes_settings(store):
    lobby, host = store.create(player_name="Host")
    guest, _ = store.join(lobby["code"], name="Gast")
    with pytest.raises(LobbyError):
        store.update_settings(lobby["code"], guest["id"], {"maxPlayers": 3})
    store.update_settings(lobby["code"], host["id"], {"maxPlayers": 3, "password": "x"})
    assert store.public_info(lobby["code"]) == {"code": lobby["code"], "private": True, "maxPlayers": 3}


def test_expiry(tmp_path):
    clock = Clock()
    store = LobbyStore(tmp_path / "l.json", ttl=100, clock=clock)
    lobby, _ = store.create(player_name="A")
    clock.t += 101
    assert store.expire() == [lobby["code"]]
    assert store.get(lobby["code"]) is None


def test_start_round_has_seed_and_config(store):
    lobby, host = store.create(player_name="Host", config={"lives": 3})
    store.start_round(lobby["code"], host["id"])
    r = store.get(lobby["code"])["round"]
    assert r["number"] == 1 and isinstance(r["seed"], int) and r["config"]["lives"] == 3


# ---------- Hub ----------
def test_hub_join_rejoin_and_state(store):
    hub = LobbyHub(store)
    lobby, host = store.create(player_name="Host")
    code = lobby["code"]
    h = connect(hub, code, playerId=host["id"], token=host["token"])
    g = connect(hub, code, name="Gast")
    welcome = g.ws.sent[0]
    assert welcome["type"] == "welcome" and welcome["player"]["token"]  # neuer Spieler bekommt Token
    state = h.ws.sent[-1]["lobby"]
    assert [p["name"] for p in state["players"]] == ["Host", "Gast"]
    # Wiederbeitritt mit Token: gleiche ID, kein neuer Token
    g2 = connect(hub, code, playerId=welcome["player"]["id"], token=welcome["player"]["token"])
    assert g2.ws.sent[0]["player"]["id"] == welcome["player"]["id"] and "token" not in g2.ws.sent[0]["player"]
    # falscher Token → neuer Spieler statt Übernahme
    g3 = connect(hub, code, playerId=host["id"], token="falsch", name="Fälscher")
    assert g3.ws.sent[0]["player"]["id"] != host["id"]


def test_host_transfer_after_grace(store):
    clock = Clock()
    hub = LobbyHub(store, host_grace=5, clock=clock)
    lobby, host = store.create(player_name="Host")
    code = lobby["code"]
    h = connect(hub, code, playerId=host["id"], token=host["token"])
    g = connect(hub, code, name="Gast")
    gid = g.ws.sent[0]["player"]["id"]
    hub.leave(code, h)
    assert store.get(code)["host"] == host["id"]   # innerhalb der Karenzzeit bleibt der Host
    clock.t += 6
    hub._host_check(code)
    assert store.get(code)["host"] == gid
    assert g.ws.sent[-1]["lobby"]["host"] == gid


def test_hub_rejects_guest_settings_and_start(store):
    hub = LobbyHub(store)
    lobby, host = store.create(player_name="Host")
    code = lobby["code"]
    connect(hub, code, playerId=host["id"], token=host["token"])
    g = connect(hub, code, name="Gast")
    with pytest.raises(LobbyError):
        hub.handle(code, g, {"type": "start"})


# ---------- HTTP ----------
def test_http_create_info_and_page(client):
    r = client.post("/api/lobbies", json={"name": "Manu", "maxPlayers": 4, "password": "pw"})
    assert r.status_code == 201
    code = r.get_json()["code"]
    assert r.get_json()["url"] == f"/{code}"
    info = client.get(f"/api/lobbies/{code.lower()}").get_json()
    assert info == {"code": code, "private": True, "maxPlayers": 4, "online": 0}
    assert client.get(f"/{code}").status_code == 200
    assert client.get(f"/l/{code.lower()}").headers["Location"].endswith(f"/{code}")
    assert client.get("/api/lobbies/ZZZZZ").status_code == 404
    assert client.get("/stats").status_code == 200  # kein Konflikt mit Lobby-Route


def test_fresh_host_keeps_role_during_grace(store):
    """Erster Gast verbindet sich vor dem Ersteller: Host bleibt innerhalb der Karenzzeit."""
    clock = Clock()
    hub = LobbyHub(store, host_grace=5, clock=clock)
    lobby, host = store.create(player_name="Host")
    code = lobby["code"]
    connect(hub, code, name="Gast")
    assert store.get(code)["host"] == host["id"]
    clock.t += 6
    connect(hub, code, name="Zweiter")          # nächster Beitritt prüft erneut
    assert store.get(code)["host"] != host["id"]
