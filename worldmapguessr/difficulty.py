"""Schwierigkeit der Items und Reihenfolge nach dem Schwierigkeitsregler.

Item-Schwierigkeit 0 (leicht) … 10 (schwer), aus der Statistik:
    Leichtigkeit = 75 % Einsetzquote (eingesetzt / spawns) + 25 % Trefferquote (eingesetzt / Versuche)
    Schwierigkeit = 10 × (1 − Leichtigkeit)
Ohne Daten (nie gespawnt, nie versucht) gilt 5 (mittel). Fehlt nur eine der beiden Quoten, zählt die andere
allein. Die Einsetzquote wird auf 1 begrenzt (ältere Zahlen können mehr Treffer als Spawns enthalten).

Reihenfolge (Regler 0…100 %), je Item ein Wert aus Schwierigkeit (0…1) und Zufall (0…1):
    Zufallsanteil z = min(Regler, 100 % − Regler)
    Wert = (1 − z) · Schwierigkeit/10 + z · Zufall
    Regler ≤ 50 %: kleinster Wert zuerst (0 % = streng von leicht nach schwer)
    Regler > 50 %: größter Wert zuerst  (100 % = streng von schwer nach leicht)
Die gleiche Rechnung steckt im Browser in static/js/game/difficulty.js (Einzelspiel).
"""
from __future__ import annotations

import random

PLACE_WEIGHT = 0.75
HIT_WEIGHT = 0.25
UNKNOWN = 5.0
DEFAULT_LEVEL = 50


def item_difficulty(item: dict) -> float:
    spawned = item.get("spawned", 0)
    correct = item.get("correct", 0)
    attempts = correct + item.get("incorrect", 0)
    place = min(1.0, correct / spawned) if spawned else None
    hit = correct / attempts if attempts else None
    if place is None and hit is None:
        return UNKNOWN
    place = hit if place is None else place
    hit = place if hit is None else hit
    ease = PLACE_WEIGHT * place + HIT_WEIGHT * hit
    return round(10 * (1 - ease), 1)


def with_difficulty(item: dict) -> dict:
    return {**item, "difficulty": item_difficulty(item)}


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
