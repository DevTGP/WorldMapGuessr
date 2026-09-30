from worldmapguessr.lobbies import round as rounds
from worldmapguessr.lobbies import scoring

CATALOG = {"continent": [f"continent:{i}" for i in range(4)]}
CONFIG = {"lives": 3, "startItems": 4, "refillCount": 2, "refillEvery": 1, "kinds": ["continent"], "excluded": [],
          "mode": "casual", "level": 2}


def new(**cfg):
    diff = {"continent:0": 10, "continent:1": 0}
    return rounds.new_round(1, {**CONFIG, **cfg}, CATALOG, ["a"], seed=1, now=100, difficulty=diff)


def test_multiplier_by_mode_level_and_custom():
    assert scoring.multiplier({"mode": "casual", "level": 0}) == 1.0
    assert scoring.multiplier({"mode": "hardcore", "level": 4}) == 2.0  # 1,5 × 1,4 gekappt
    assert scoring.multiplier({"mode": "focus", "level": 2}) == 1.5
    assert scoring.multiplier({"mode": "custom", "timer": 30, "noReturn": True}) == 1.3
    assert scoring.multiplier({"mode": "custom", "rotate": True}) == 1.2


def test_tempo_bonus():
    assert scoring.tempo_bonus(2) == 50 and scoring.tempo_bonus(25) == 25 and scoring.tempo_bonus(60) == 0


def test_hit_difficulty_tempo_multiplier_and_miss():
    rnd = new()  # Normal: ×1,2
    hand = rnd["hands"]["a"]
    # schweres Item (10) nach 3 s: (100 + 200 + 50) × 1,2
    r = rounds.place(rnd, "a", "continent:0", True, ["a"], now=103)
    assert r["points"] == 420 and rnd["last"]["points"] == 420
    # leichtes Item (0) 25 s nach der letzten Aktion: (100 + 0 + 25) × 1,2
    assert rounds.place(rnd, "a", "continent:1", True, ["a"], now=128)["points"] == 150
    key = next(k for k in hand if k not in ("continent:0", "continent:1"))
    assert rounds.place(rnd, "a", key, False, ["a"], now=130)["points"] == -36
    assert rnd["scores"]["a"] == {"points": 534, "hits": 2, "misses": 1}


def test_pause_does_not_eat_tempo_and_win_bonus():
    rnd = new(mode="casual", level=0)  # ×1
    rounds.pause_timer(rnd, 100, True)
    rounds.pause_timer(rnd, 400, False)  # 5 min Pause (z. B. Hauptmenü)
    keys = list(rnd["hands"]["a"])
    assert rounds.place(rnd, "a", keys[0], True, ["a"], now=402)["points"] >= 150  # voller Tempo-Bonus
    for i, k in enumerate(keys[1:]):
        rounds.place(rnd, "a", k, True, ["a"], now=403 + i)
    assert rnd["status"] == rounds.WON
    view = rounds.public_view(rnd, now=410)["score"]
    assert view["bonus"] == {"lives": 150, "win": 200, "total": 350}
    assert view["total"] == rnd["scores"]["a"]["points"] + 350 and view["mult"] == 1.0


def test_lost_round_has_no_team_bonus():
    rnd = new(lives=1)
    rounds.place(rnd, "a", rnd["hands"]["a"][0], False, ["a"], now=101)
    assert rnd["status"] == rounds.LOST and rnd["bonus"] == {"lives": 0, "win": 0, "total": 0}
