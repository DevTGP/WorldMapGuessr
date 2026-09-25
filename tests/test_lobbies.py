import json
import re

import mongomock
import pytest

from worldmapguessr.lobbies.codes import PATTERN
from worldmapguessr.lobbies.hub import Connection, LobbyHub
from worldmapguessr.lobbies.persistence import MongoLobbyPersistence
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


CATALOG = {"continent": [f"continent:{i}" for i in range(3)], "country-eu": [f"country:{i}" for i in range(20)]}


@pytest.fixture(params=["json", "mongodb"])
def store(request, tmp_path):
    if request.param == "mongodb":
        return LobbyStore(MongoLobbyPersistence(mongomock.MongoClient().db["lobbies"]), catalog=CATALOG)
    return LobbyStore(tmp_path / "lobbies.json", catalog=CATALOG)


def connect(hub, code, **msg):
    conn = Connection(FakeWS())
    hub.join(code, conn, {"type": "join", **msg})
    return conn


# ---------- Store ----------
def test_create_short_unique_code_and_persist(tmp_path, store):
    lobby, host = store.create(player_name="Manu", config={"lives": 99, "kinds": ["country-na", "x"]})
    assert re.fullmatch(PATTERN, lobby["code"])
    assert lobby["host"] == host["id"] and host["token"]
    assert lobby["settings"]["config"]["lives"] == 30          # auf Grenze geklemmt
    assert lobby["settings"]["config"]["kinds"] == ["country-na"]  # unbekannte Gruppe verworfen
    again = LobbyStore(store.persistence)                       # neu geladen (gleiches Backend)
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


def test_legacy_kind_country_means_europe(tmp_path):
    store = LobbyStore(tmp_path / "l.json")
    lobby, _ = store.create(player_name="A")
    lobby["settings"]["config"]["kinds"] = ["continent", "country"]  # so gespeichert vor den Item-Gruppen
    store.persistence.save(lobby)
    again = LobbyStore(store.persistence)
    assert again.get(lobby["code"])["settings"]["config"]["kinds"] == ["continent", "country-eu"]


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


# ---------- Gemeinsame Runde ----------
def hand_of(conn):
    return [m for m in conn.ws.sent if m["type"] == "state"][-1]["hand"]


def round_of(conn):
    return [m for m in conn.ws.sent if m["type"] == "state"][-1]["lobby"]["round"]


def two_players(store, **config):
    hub = LobbyHub(store, clock=Clock())
    # Gesamtzahlen, reihum verteilt: 6 Startteile → je 3, 4 neue → je 2
    lobby, host = store.create(player_name="Host", config={"startItems": 6, "refillEvery": 2,
                                                          "refillCount": 4, "lives": 2, **config})
    code = lobby["code"]
    h = connect(hub, code, playerId=host["id"], token=host["token"])
    g = connect(hub, code, name="Gast")
    hub.handle(code, h, {"type": "start"})
    return hub, code, h, g


def test_round_items_exclusive_and_placements_synced(store):
    hub, code, h, g = two_players(store)
    hh, gh = hand_of(h), hand_of(g)
    assert len(hh) == len(gh) == 3 and not set(hh) & set(gh)
    assert "pool" not in round_of(g) and round_of(g)["poolCount"] == 23 - 6
    # Gast kann kein Teil des Hosts einsetzen
    with pytest.raises(LobbyError) as e:
        hub.handle(code, g, {"type": "place", "key": hh[0], "correct": True})
    assert e.value.code == "not_in_hand"
    hub.handle(code, h, {"type": "place", "key": hh[0], "correct": True})
    r = round_of(g)
    assert r["placed"] == [hh[0]] and r["placedBy"][hh[0]] == h.player_id
    assert r["last"]["type"] == "placed" and hh[0] not in hand_of(h)
    assert r["sinceRefill"] == 1                       # Anzeige: noch 1 Treffer bis Nachschub
    # zweiter Treffer der Lobby → jeder bekommt 2 neue
    hub.handle(code, g, {"type": "place", "key": gh[0], "correct": True})
    assert len(hand_of(h)) == 4 and len(hand_of(g)) == 4


def test_shared_lives_end_round_for_everyone(store):
    hub, code, h, g = two_players(store)
    hub.handle(code, h, {"type": "place", "key": hand_of(h)[0], "correct": False})
    assert round_of(g)["lives"] == 1
    hub.handle(code, g, {"type": "place", "key": hand_of(g)[0], "correct": "yes"})  # nur True zählt
    assert round_of(h)["status"] == "lost" and round_of(h)["lives"] == 0


def test_late_joiner_waits_for_next_deal_and_leaver_returns_them(store):
    hub, code, h, g = two_players(store)
    late = connect(hub, code, name="Spät")
    assert hand_of(late) == [] and round_of(h)["handCounts"][late.player_id] == 0
    hub.handle(code, h, {"type": "place", "key": hand_of(h)[0], "correct": True})
    hub.handle(code, g, {"type": "place", "key": hand_of(g)[0], "correct": True})
    late_hand = hand_of(late)
    assert len(late_hand) == 1                          # Nachschub H, G, Spät, H
    hub.handle(code, late, {"type": "leave"})
    r = round_of(h)
    assert late.player_id is None and r["poolCount"] == 23 - 6 - 4 + len(late_hand) and late.ws.sent[-1]["type"] == "left"


def test_disconnected_player_keeps_hand_during_grace(store):
    hub, code, h, g = two_players(store)
    gid, items = g.player_id, hand_of(g)
    hub.leave(code, g)
    hub._hand_check(code, gid)                     # noch in der Karenzzeit
    assert round_of(h)["handCounts"][gid] == 3
    g2 = connect(hub, code, playerId=gid, token=g.ws.sent[0]["player"]["token"])
    assert hand_of(g2) == items                    # Wiederverbinden: gleiches Inventar
    hub.leave(code, g2)
    hub.clock.t += hub.hand_grace + 1
    hub._hand_check(code, gid)
    assert gid not in round_of(h)["handCounts"] and round_of(h)["poolCount"] == 23 - 3


def test_give_item_to_online_player_and_host_can_disable(store):
    hub, code, h, g = two_players(store)
    key = hand_of(h)[0]
    assert h.ws.sent[-1]["lobby"]["settings"]["allowSend"] is True   # Standard: an
    hub.handle(code, h, {"type": "give", "key": key, "to": g.player_id})
    assert key in hand_of(g) and key not in hand_of(h)
    assert round_of(h)["handCounts"] == {h.player_id: 2, g.player_id: 4}
    # an getrennte Spieler nicht
    gid = g.player_id
    hub.leave(code, g)
    with pytest.raises(LobbyError) as e:
        hub.handle(code, h, {"type": "give", "key": hand_of(h)[0], "to": gid})
    assert e.value.code == "bad_target"
    # Host schaltet aus → Senden abgelehnt; Gäste dürfen die Einstellung nicht ändern
    g2 = connect(hub, code, name="Zweiter")
    with pytest.raises(LobbyError):
        hub.handle(code, g2, {"type": "settings", "settings": {"allowSend": True}})
    hub.handle(code, h, {"type": "settings", "settings": {"allowSend": False}})
    assert g2.ws.sent[-1]["lobby"]["settings"]["allowSend"] is False
    with pytest.raises(LobbyError) as e:
        hub.handle(code, h, {"type": "give", "key": hand_of(h)[0], "to": g2.player_id})
    assert e.value.code == "send_disabled"


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


# ---------- Verlassen / Beenden ----------
def test_leave_transfers_host_and_removes_player(store):
    hub = LobbyHub(store)
    lobby, host = store.create(player_name="Host")
    code = lobby["code"]
    h = connect(hub, code, playerId=host["id"], token=host["token"])
    g = connect(hub, code, name="Gast")
    gid = g.ws.sent[0]["player"]["id"]
    hub.handle(code, h, {"type": "leave"})
    assert h.ws.sent[-1] == {"type": "left"} and h.player_id is None
    lob = store.get(code)
    assert host["id"] not in lob["players"] and lob["host"] == gid     # sofortiger Host-Wechsel
    assert g.ws.sent[-1]["lobby"]["host"] == gid
    # alter Token gilt nicht mehr → Wiederkommen = neuer Spieler
    again = connect(hub, code, playerId=host["id"], token=host["token"], name="Host")
    assert again.ws.sent[0]["player"]["id"] != host["id"]


def test_last_player_leaving_deletes_lobby(store):
    hub = LobbyHub(store)
    lobby, host = store.create(player_name="Host")
    h = connect(hub, lobby["code"], playerId=host["id"], token=host["token"])
    hub.handle(lobby["code"], h, {"type": "leave"})
    assert store.get(lobby["code"]) is None


def test_close_only_host_and_notifies_everyone(store):
    hub = LobbyHub(store)
    lobby, host = store.create(player_name="Host")
    code = lobby["code"]
    h = connect(hub, code, playerId=host["id"], token=host["token"])
    g = connect(hub, code, name="Gast")
    with pytest.raises(LobbyError):
        hub.handle(code, g, {"type": "close"})
    hub.handle(code, h, {"type": "close"})
    assert store.get(code) is None
    assert g.ws.sent[-1]["type"] == "closed" and h.ws.sent[-1]["type"] == "closed"
    assert hub.online_count(code) == 0
