"""Rundenlogik einer Lobby: gemeinsamer Vorrat, exklusive Inventare, gemeinsame Leben."""
import random

import pytest

from worldmapguessr.lobbies import round as rounds

CATALOG = {"continent": [f"continent:{i}" for i in range(3)], "country": [f"country:{i}" for i in range(12)]}
# startItems/refillCount sind Gesamtzahlen für die Lobby (reihum verteilt): bei 2 Spielern je 2
# Grundwerte für 1 Spieler: bei 2 Spielern 2 + 2 = 4 Start-Items (je 2) und 1 + 2 = 3 Leben
CONFIG = {"lives": 1, "startItems": 2, "refillCount": 4, "refillEvery": 2,
          "kinds": ["continent", "country"], "excluded": ["country:0"]}


def all_keys(rnd):
    return rnd["pool"] + [k for h in rnd["hands"].values() for k in h] + rnd["placed"]


def assert_unique(rnd):
    keys = all_keys(rnd)
    assert len(keys) == len(set(keys)) == rnd["total"]


def new(online=("a", "b"), **cfg):
    return rounds.new_round(1, {**CONFIG, **cfg}, CATALOG, list(online), seed=7, now=0)


def test_pool_excludes_and_deals_round_robin():
    rnd = new()
    assert rnd["total"] == 14 and "country:0" not in all_keys(rnd)
    assert [len(rnd["hands"][p]) for p in "ab"] == [2, 2]
    assert_unique(rnd)
    assert new()["pool"] == rnd["pool"]  # gleicher Seed → gleiche Reihenfolge


def test_wrong_costs_shared_life_and_keeps_item():
    rnd = new()
    key = rnd["hands"]["a"][0]
    for i in range(3):
        rounds.place(rnd, "a", key, False, ["a", "b"])
    assert rnd["lives"] == 0 and rnd["status"] == rounds.LOST and key in rnd["hands"]["a"]
    assert rnd["last"] == {"seq": 3, "type": "miss", "player": "a", "key": key, "lost": False}
    assert rnd["lostReason"] == "lives"
    with pytest.raises(rounds.RoundError) as e:
        rounds.place(rnd, "b", rnd["hands"]["b"][0], True, ["a", "b"])
    assert e.value.code == "round_over"


def test_foreign_item_rejected():
    rnd = new()
    with pytest.raises(rounds.RoundError) as e:
        rounds.place(rnd, "b", rnd["hands"]["a"][0], True, ["a", "b"])
    assert e.value.code == "not_in_hand"


def test_shared_refill_counter_deals_to_everyone():
    rnd = new()
    rounds.place(rnd, "a", rnd["hands"]["a"][0], True, ["a", "b"])
    assert rnd["sinceRefill"] == 1
    res = rounds.place(rnd, "b", rnd["hands"]["b"][0], True, ["a", "b"])  # 2. Treffer der Lobby
    assert res == {"refill": 4} and rnd["sinceRefill"] == 0
    assert [len(rnd["hands"][p]) for p in "ab"] == [3, 3]
    assert rnd["placedBy"] == {rnd["placed"][0]: "a", rnd["placed"][1]: "b"}
    assert_unique(rnd)


def test_example_start_and_refill_continue_the_loop():
    """3 Spieler, Grundwert 1 → 1 + 2·2 = 5 Startteile: A, B, C, A, B; 2 neue nach Erfolg → C, A."""
    rnd = new(online=["A", "B", "C"], startItems=1, refillCount=2, refillEvery=1)
    assert {p: len(h) for p, h in rnd["hands"].items()} == {"A": 2, "B": 2, "C": 1}
    assert rnd["lives"] == rnd["livesMax"] == 1 + 4
    rounds.place(rnd, "A", rnd["hands"]["A"][0], True, ["A", "B", "C"])
    assert rnd["dealt"] == {"A": 3, "B": 2, "C": 2}


def test_everyone_gets_the_same_number_of_items():
    online = ["a", "b", "c"]
    rnd = new(online=online, startItems=5, refillCount=4, refillEvery=1)
    while rnd["status"] == rounds.RUNNING:
        pid = next(p for p in online if rnd["hands"].get(p))
        rounds.place(rnd, pid, rnd["hands"][pid][0], True, online)
        dealt = [rnd["dealt"].get(p, 0) for p in online]
        assert max(dealt) - min(dealt) <= 1
    assert sum(rnd["dealt"].values()) == rnd["total"]


def test_offline_players_are_skipped():
    rnd = new(online=["a", "b", "c"], startItems=1, refillCount=2, refillEvery=1)  # 5: a2 b2 c1, weiter bei c
    rounds.place(rnd, "a", rnd["hands"]["a"][0], True, ["a", "c"])  # b getrennt → c, a
    assert rnd["dealt"] == {"a": 3, "b": 2, "c": 2}


def test_late_join_gets_two_items_and_two_lives_and_return_hand():
    rnd = new(online=["a"], refillCount=2, refillEvery=1)
    assert rnd["lives"] == 1 and len(rnd["hands"]["a"]) == 2               # allein: Grundwerte
    assert rounds.join(rnd, "b") is True and rounds.join(rnd, "b") is False  # nur einmal
    assert len(rnd["hands"]["b"]) == 2 and rnd["order"] == ["a", "b"] and rnd["dealt"]["b"] == 2
    assert rnd["lives"] == rnd["livesMax"] == 3 and rnd["last"] == {**rnd["last"], "type": "join", "count": 2, "lives": 2}
    hand = list(rnd["hands"]["b"])
    assert rounds.return_hand(rnd, "b", ["a"], random.Random(1)) == 2
    assert "b" not in rnd["hands"] and "b" not in rnd["order"] and set(hand) <= set(rnd["pool"])
    assert_unique(rnd)


def test_unstick_when_nobody_holds_items():
    rnd = new(online=["a", "b"])
    rounds.return_hand(rnd, "b", ["a"])
    for key in list(rnd["hands"]["a"]):
        rounds.place(rnd, "a", key, True, ["a"])
    # a hat alles eingesetzt → sofort Nachschub, obwohl der Zähler noch nicht voll wäre
    assert rnd["hands"]["a"] and rnd["status"] == rounds.RUNNING
    assert_unique(rnd)


def test_play_to_win():
    rnd = new(online=["a", "b"])
    while rnd["status"] == rounds.RUNNING:
        pid = next(p for p in "ab" if rnd["hands"].get(p))
        rounds.place(rnd, pid, rnd["hands"][pid][0], True, ["a", "b"])
        assert_unique(rnd)
    assert rnd["status"] == rounds.WON and len(rnd["placed"]) == rnd["total"] and not rnd["pool"]


def test_public_view_hides_pool_and_hands():
    view = rounds.public_view(new())
    assert "pool" not in view and "hands" not in view and "seed" not in view
    assert view["poolCount"] == 10 and view["handCounts"] == {"a": 2, "b": 2}
    assert view["sinceRefill"] == 0


def test_give_moves_item_between_hands():
    rnd = new()
    key = rnd["hands"]["a"][0]
    rounds.give(rnd, "a", "b", key)
    assert key in rnd["hands"]["b"] and key not in rnd["hands"]["a"] and len(rnd["hands"]["b"]) == 3
    assert rnd["last"]["type"] == "gift" and rnd["last"]["to"] == "b"
    assert_unique(rnd)
    for bad, code in [(("b", "b", key), "bad_target"), (("a", "b", key), "not_in_hand")]:
        with pytest.raises(rounds.RoundError) as e:
            rounds.give(rnd, *bad)
        assert e.value.code == code


# ---------- Timer: fester Takt ab Start, Wegnahme reihum ----------
def test_timer_waits_for_grace_then_takes_round_robin_oldest_first():
    rnd = new(timer=30, grace=60, timerTake=3)  # a, b je 2 Items
    assert rnd["timer"] == {"nextAt": 90, "graceUntil": 60, "pausedAt": None}
    oldest_a, oldest_b = rnd["hands"]["a"][0], rnd["hands"]["b"][0]
    assert not rounds.tick(rnd, 89.9, ["a", "b"])
    assert rounds.timer_view(rnd, 50)["graceLeft"] == 10 and rounds.timer_view(rnd, 50)["nextIn"] == 40
    assert rounds.tick(rnd, 90, ["a", "b"], random.Random(1))
    taken = rnd["last"]["items"]
    assert rnd["last"]["type"] == "take" and [t["player"] for t in taken] == ["a", "b", "a"]
    assert taken[0]["key"] == oldest_a and taken[1]["key"] == oldest_b
    assert len(rnd["hands"]["a"]) == 0 and len(rnd["hands"]["b"]) == 1
    assert all(t["key"] in rnd["pool"] for t in taken)
    assert_unique(rnd)
    # nächster Takt 30 s später, ohne Schonfrist
    assert rnd["timer"]["nextAt"] == 120 and rounds.timer_view(rnd, 100)["graceLeft"] == 0


def test_timer_skips_empty_and_offline_players():
    rnd = new(online=("a", "b", "c"), startItems=1, timer=10, grace=0, timerTake=9)  # a2 b2 c1
    assert rounds.tick(rnd, 10, ["a", "c"])  # b getrennt → übersprungen
    assert sorted(t["player"] for t in rnd["last"]["items"]) == ["a", "a", "c"]
    assert rnd["status"] == rounds.RUNNING   # b hat noch Items → Lobby-Inventar nicht leer
    assert_unique(rnd)


def test_empty_inventory_loses_the_round():
    rnd = new(online=("a",), startItems=2, timer=10, grace=0, timerTake=2)
    assert rounds.tick(rnd, 10, ["a"])
    assert rnd["status"] == rounds.LOST and rnd["lostReason"] == "empty" and rnd["last"]["type"] == "empty"


def test_miss_loses_item_unless_endspurt():
    rnd = new(online=("a",), startItems=3, missLoses=True, lives=5)
    key = rnd["hands"]["a"][0]
    rounds.place(rnd, "a", key, False, ["a"])
    assert key not in rnd["hands"]["a"] and key in rnd["pool"] and rnd["last"]["lost"] is True
    # Endspurt: Vorrat leer → Fehlwurf behält das Item, Timer nimmt nichts
    rnd["hands"]["a"] += rnd["pool"]
    rnd["pool"] = []
    rounds._check_endspurt(rnd)
    assert rnd["endspurt"] and rnd["last"]["type"] == "endspurt"
    key = rnd["hands"]["a"][0]
    rounds.place(rnd, "a", key, False, ["a"])
    assert key in rnd["hands"]["a"] and rnd["last"]["lost"] is False


def test_missing_last_item_empties_inventory_and_loses():
    rnd = new(online=("a",), startItems=2, refillEvery=1, refillCount=2, missLoses=True, lives=9)
    for key in list(rnd["hands"]["a"]):
        rounds.place(rnd, "a", key, False, ["a"])
    assert rnd["status"] == rounds.LOST and rnd["lostReason"] == "empty"


def test_endspurt_stops_the_timer():
    rnd = new(online=("a",), startItems=20, timer=10, grace=0, timerTake=1)   # alle Items verteilt → sofort Endspurt
    assert rnd["endspurt"] and not rnd["pool"]
    assert not rounds.tick(rnd, 10, ["a"]) and rounds.timer_view(rnd, 10)["endspurt"] is True


def test_timer_off_and_missed_ticks_are_not_replayed():
    assert new()["timer"] is None and not rounds.tick(new(), 1e9, ["a"])
    rnd = new(timer=10, grace=0)
    assert not rounds.tick(rnd, 500, ["a", "b"])  # Server war aus: nur neu ansetzen
    assert rnd["timer"]["nextAt"] == 510 and rnd["events"] == 0


# ---------- Sendelimit ----------
def test_send_quota_counts_only_items_dealt_by_server():
    rnd = new(startItems=4)  # 4 + 2 = 6 → je 3
    assert rounds.send_quota(rnd, "a", 3) == {"every": 3, "left": 1, "next": 3}
    rounds.give(rnd, "a", "b", rnd["hands"]["a"][0], every=3)
    assert rounds.send_quota(rnd, "a", 3)["left"] == 0
    with pytest.raises(rounds.RoundError) as e:
        rounds.give(rnd, "a", "b", rnd["hands"]["a"][0], every=3)
    assert e.value.code == "send_limit"
    # b hat ein geschenktes Item mehr – zählt nicht: weiter 1 Sendung aus 3 ausgeteilten
    assert rounds.send_quota(rnd, "b", 3)["left"] == 1 and rounds.send_quota(rnd, "b", 2) == {"every": 2, "left": 1, "next": 1}
    assert rounds.send_quota(rnd, "a", 0)["left"] is None  # ohne Limit


def test_log_keeps_recent_events_and_refill_names_receivers():
    rnd = new()
    for key in list(rnd["hands"]["a"]):
        rounds.place(rnd, "a", key, True, ["a", "b"])
    kinds = [e["type"] for e in rnd["log"]]
    assert kinds[:3] == ["placed", "placed", "refill"] and rnd["log"][2]["to"] == {"a": 2, "b": 2}
    assert [e["seq"] for e in rnd["log"]] == list(range(1, len(kinds) + 1))
