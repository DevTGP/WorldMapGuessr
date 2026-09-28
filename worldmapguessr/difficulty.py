"""Schwierigkeit der Items und Reihenfolge nach dem Schwierigkeitsregler.

Item-Schwierigkeit 0 (leicht) … 10 (schwer), aus der Statistik – drei Anteile, je 0 (leicht) … 1 (schwer):
    20 %  Platzierungsrate  1 − eingesetzt / spawns (auf 0 … 1 begrenzt)
    30 %  Trefferquote      1 − eingesetzt / Versuche
    50 %  Dauer             d / (d + DURATION_K), d = waited / waitedCount: Ø Items, die die Lobby einsetzt,
                            während dieses Item im Spiel ist (bis es sitzt oder verloren geht)
    Schwierigkeit = 10 × gewichtete Summe
Fehlen Daten für einen Anteil (nie gespawnt, nie versucht, keine Dauer), werden die übrigen Gewichte hochgerechnet;
ganz ohne Daten gilt 5 (mittel).

Reihenfolge (Regler 0…100 %), je Item ein Wert aus Schwierigkeit (0…1) und Zufall (0…1):
    Zufallsanteil z = min(Regler, 100 % − Regler)
    Wert = (1 − z) · Schwierigkeit/10 + z · Zufall
    Regler ≤ 50 %: kleinster Wert zuerst (0 % = streng von leicht nach schwer)
    Regler > 50 %: größter Wert zuerst  (100 % = streng von schwer nach leicht)
Die Reihenfolge berechnet der Server beim Rundenstart (lobbies/round.py build_pool).
"""
from __future__ import annotations

import random

from .item_store import COUNTERS

PLACE_WEIGHT = 0.2
HIT_WEIGHT = 0.3
DURATION_WEIGHT = 0.5
DURATION_K = 5      # Ø so viele Items dazwischen = halbe Schwierigkeit dieses Anteils
UNKNOWN = 5.0
DEFAULT_LEVEL = 50


def duration(item: dict) -> float | None:
    """Ø eingesetzte Items der Lobby zwischen Austeilen und Einsetzen/Verlust, None ohne Daten"""
    n = item.get("waitedCount", 0)
    return item.get("waited", 0) / n if n else None


def item_difficulty(item: dict) -> float:
    spawned = item.get("spawned", 0)
    correct = item.get("correct", 0)
    attempts = correct + item.get("incorrect", 0)
    d = duration(item)
    parts = [
        (PLACE_WEIGHT, 1 - min(1.0, correct / spawned) if spawned else None),
        (HIT_WEIGHT, 1 - correct / attempts if attempts else None),
        (DURATION_WEIGHT, d / (d + DURATION_K) if d is not None else None),
    ]
    known = [(w, v) for w, v in parts if v is not None]
    if not known:
        return UNKNOWN
    return round(10 * sum(w * v for w, v in known) / sum(w for w, _ in known), 1)


def with_difficulty(item: dict) -> dict:
    """Item für die API: alle Zähler (ältere Items ohne waited), Ø Dauer und Schwierigkeit"""
    d = duration(item)
    return {**{c: 0 for c in COUNTERS}, **item,
            "duration": round(d, 2) if d is not None else None, "difficulty": item_difficulty(item)}


def difficulty_map(store) -> dict[str, float]:
    """{"kind:code": Schwierigkeit} für alle Items im Store."""
    return {f"{i['kind']}:{i['code']}": item_difficulty(i) for i in store.list()}


def order_by_difficulty(keys: list[str], difficulty: dict[str, float], level: int,
                        rng: random.Random) -> list[str]:
    """Items in der Reihenfolge, in der sie ausgeteilt werden (siehe Moduldoku)."""
    lvl = max(0, min(100, level)) / 100
    z = min(lvl, 1 - lvl)
    scored = [((1 - z) * difficulty.get(k, UNKNOWN) / 10 + z * rng.random(), rng.random(), k) for k in keys]
    scored.sort(reverse=lvl > 0.5)
    return [k for *_, k in scored]
