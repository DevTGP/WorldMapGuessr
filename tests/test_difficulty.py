"""Item-Schwierigkeit (0–10) und Reihenfolge nach dem Schwierigkeitsregler."""
import random

import pytest

from worldmapguessr.difficulty import item_difficulty, order_by_difficulty
from worldmapguessr.lobbies import round as rounds


def item(spawned, correct, incorrect):
    return {"spawned": spawned, "correct": correct, "incorrect": incorrect}


@pytest.mark.parametrize("stats, expected", [
    ((0, 0, 0), 5.0),        # keine Daten → mittel
    ((10, 10, 0), 0.0),      # alles eingesetzt, nie daneben
    ((10, 0, 10), 10.0),     # nichts eingesetzt
    ((10, 5, 5), 5.0),       # 75 % · 0,5 + 25 % · 0,5 = 0,5 → 5
    ((10, 8, 2), 2.0),       # 75 % · 0,8 + 25 % · 0,8 = 0,8 → 2
    ((10, 4, 0), 4.5),       # Einsetzquote 0,4, Trefferquote 1 → 0,55 → 4,5
    ((4, 0, 0), 10.0),       # gespawnt, nie versucht → nur Einsetzquote
    ((0, 2, 2), 5.0),        # (Altdaten) ohne Spawns → nur Trefferquote
    ((2, 5, 0), 0.0),        # Einsetzquote über 100 % wird begrenzt
])
def test_item_difficulty(stats, expected):
    assert item_difficulty(item(*stats)) == expected


KEYS = [f"k{i}" for i in range(11)]
DIFF = {k: float(i) for i, k in enumerate(KEYS)}   # k0 = 0 (leicht) … k10 = 10 (schwer)


def test_level_0_is_strictly_easy_to_hard_and_100_hard_to_easy():
    assert order_by_difficulty(KEYS[::-1], DIFF, 0, random.Random(1)) == KEYS
    assert order_by_difficulty(KEYS, DIFF, 100, random.Random(1)) == KEYS[::-1]


def test_middle_levels_mix_in_randomness():
    def mean_position_of_easy(level):
        pos = []
        for seed in range(200):
            order = order_by_difficulty(KEYS, DIFF, level, random.Random(seed))
            pos.append(order.index("k0"))
        return sum(pos) / len(pos)
    # 20 %: leichtes Item fast immer vorne; 50 %: noch vorne, aber gestreut; 80 %: eher hinten
    assert mean_position_of_easy(20) < 1
    assert 0.5 < mean_position_of_easy(50) < 4
    assert mean_position_of_easy(80) > 8
    # 51 % kippt die Richtung: schwere Items zuerst
    starts = [order_by_difficulty(KEYS, DIFF, 51, random.Random(s))[0] for s in range(200)]
    assert sum(DIFF[k] for k in starts) / len(starts) > 5


def test_unknown_items_count_as_medium():
    order = order_by_difficulty(["x", "k0", "k10"], DIFF, 0, random.Random(3))
    assert order == ["k0", "x", "k10"]


def test_lobby_pool_follows_the_slider():
    catalog = {"country-eu": KEYS}
    cfg = {"kinds": ["country-eu"], "excluded": [], "lives": 3, "startItems": 3, "refillCount": 1,
           "refillEvery": 1, "difficulty": 0}
    rnd = rounds.new_round(1, cfg, catalog, ["a"], seed=5, now=0, difficulty=DIFF)
    assert rnd["hands"]["a"] == ["k0", "k1", "k2"] and rnd["pool"][0] == "k3"
    rnd = rounds.new_round(1, {**cfg, "difficulty": 100}, catalog, ["a"], seed=5, now=0, difficulty=DIFF)
    assert rnd["hands"]["a"] == ["k10", "k9", "k8"]
