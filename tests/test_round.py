"""Rundenlogik einer Lobby: gemeinsamer Vorrat, exklusive Inventare, gemeinsame Leben."""
import random

import pytest

from worldmapguessr.lobbies import round as rounds

CATALOG = {"continent": [f"continent:{i}" for i in range(3)], "country": [f"country:{i}" for i in range(12)]}
CONFIG = {"lives": 3, "startItems": 2, "refillCount": 2, "refillEvery": 2,
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
    assert rnd["last"] == {"seq": 3, "type": "miss", "player": "a", "key": key}
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


def test_late_join_and_return_hand():
    rnd = new(online=["a"])
    assert rounds.join(rnd, "b") == 2 and rounds.join(rnd, "b") == 0  # nur einmal
    hand = list(rnd["hands"]["b"])
    assert rounds.return_hand(rnd, "b", ["a"], random.Random(1)) == 2
    assert "b" not in rnd["hands"] and set(hand) <= set(rnd["pool"])
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
