"""Gemeinsame Lobby-Runde – der Server ist maßgeblich.

- Ein gemeinsamer Vorrat: jedes Teil existiert in der Runde genau einmal – entweder im Vorrat,
  im Inventar genau eines Spielers oder eingesetzt.
- Gemeinsame Leben: jeder Fehlwurf kostet der ganzen Lobby ein Leben; bei 0 ist die Runde verloren.
- Verteilen reihum: `startItems` und `refillCount` sind Gesamtzahlen für die Lobby. Der Server geht in
  einer festen Reihenfolge (`order`) durch die Spieler und merkt sich, wer als Nächstes dran ist
  (`cursor`) – über alle Verteilungen der Runde hinweg. So bekommt am Ende jeder (±1) gleich viele Teile.
  Beispiel 3 Spieler, 2 Startteile → A, B; danach 2 neue → C, A. Getrennte Spieler werden übersprungen.
- Gemeinsamer Nachschub-Zähler: nach je `refillEvery` Treffern der Lobby werden `refillCount` Teile verteilt.
- Wer später beitritt, bekommt nichts sofort, sondern reiht sich hinten in die Reihenfolge ein.
- Hat kein Online-Spieler mehr ein Teil, der Vorrat aber noch welche, wird sofort nachgelegt
  (sonst käme die Runde nie weiter).
- Verlässt ein Spieler die Lobby (oder ist lange getrennt), gehen seine Teile zurück in den Vorrat.
- Teile können an Mitspieler gesendet werden (give) – sie wechseln nur das Inventar.

Rundenzustand (JSON-serialisierbar, wird mit der Lobby gespeichert):
{number, seed, startedAt, config, status: running|won|lost, lives, livesMax, total,
 pool: [key], hands: {playerId: [key]}, placed: [key], placedBy: {key: playerId},
 order: [playerId], cursor, dealt: {playerId: n}, sinceRefill, events, last: {seq, type: placed|miss|refill|gift, player, key?, count?, to?}}
`events` zählt Ereignisse hoch; `last.seq` erlaubt dem Client, jedes Ereignis genau einmal anzuzeigen.
"""
from __future__ import annotations

import random

RUNNING, WON, LOST = "running", "won", "lost"


class RoundError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def build_pool(catalog: dict[str, list[str]], config: dict, rng: random.Random) -> list[str]:
    """Alle Teile der Konfiguration (Arten ohne ausgeschlossene), gemischt."""
    excluded = set(config.get("excluded") or [])
    keys = [k for kind in config["kinds"] for k in catalog.get(kind, []) if k not in excluded]
    rng.shuffle(keys)
    return keys


def new_round(number: int, config: dict, catalog, online: list[str], seed: int, now: float) -> dict:
    rng = random.Random(seed)
    pool = build_pool(catalog, config, rng)
    rnd = {
        "number": number, "seed": seed, "startedAt": now, "config": dict(config),
        "status": RUNNING, "lives": config["lives"], "livesMax": config["lives"], "total": len(pool),
        "pool": pool, "hands": {}, "order": list(online), "cursor": 0, "dealt": {}, "placed": [], "placedBy": {}, "sinceRefill": 0, "events": 0, "last": None,
    }
    if not pool:
        rnd["status"] = WON
    for pid in online:
        rnd["hands"][pid] = []
    deal(rnd, online, config["startItems"])
    return rnd


def _rotation(rnd: dict) -> list[str]:
    """Reihenfolge der Spieler (ältere gespeicherte Runden haben noch keine)."""
    if "order" not in rnd:
        rnd["order"] = list(rnd["hands"])
        rnd["cursor"] = 0
        rnd["dealt"] = {}
    return rnd["order"]


def deal(rnd: dict, online: list[str], count: int) -> int:
    """`count` Teile insgesamt reihum verteilen, beginnend bei dem Spieler, der als Nächstes dran ist.
    Nicht verbundene Spieler werden übersprungen. Gibt die Anzahl verteilter Teile zurück."""
    order = _rotation(rnd)
    online = set(online)
    if not order or not online.intersection(order):
        return 0
    given = 0
    while given < count and rnd["pool"]:
        pid = order[rnd["cursor"] % len(order)]
        rnd["cursor"] = (rnd["cursor"] + 1) % len(order)
        if pid not in online:
            continue
        rnd["hands"].setdefault(pid, []).append(rnd["pool"].pop(0))
        rnd["dealt"][pid] = rnd["dealt"].get(pid, 0) + 1
        given += 1
    return given


def _event(rnd: dict, **event) -> None:
    rnd["events"] = rnd.get("events", 0) + 1
    rnd["last"] = {"seq": rnd["events"], **event}


def join(rnd: dict, pid: str) -> bool:
    """Spieler kommt (neu) in eine laufende Runde: reiht sich hinten in die Reihenfolge ein,
    bekommt aber erst beim nächsten Verteilen Teile. True, wenn er neu eingereiht wurde."""
    order = _rotation(rnd)
    if rnd["status"] != RUNNING or pid in order:
        return False
    order.append(pid)
    rnd["hands"].setdefault(pid, [])
    return True


def place(rnd: dict, pid: str, key: str, correct: bool, online: list[str]) -> dict:
    """Einsetzversuch. Gibt {"refill": n} zurück (neu verteilte Teile)."""
    if rnd["status"] != RUNNING:
        raise RoundError("round_over", "Die Runde ist schon vorbei.")
    hand = rnd["hands"].get(pid, [])
    if key not in hand:
        raise RoundError("not_in_hand", "Dieses Item liegt nicht in deinem Inventar.")

    if not correct:
        rnd["lives"] = max(0, rnd["lives"] - 1)
        _event(rnd, type="miss", player=pid, key=key)
        if rnd["lives"] == 0:
            rnd["status"] = LOST
        return {"refill": 0}

    hand.remove(key)
    rnd["placed"].append(key)
    rnd["placedBy"][key] = pid
    rnd["sinceRefill"] += 1
    _event(rnd, type="placed", player=pid, key=key)
    if len(rnd["placed"]) == rnd["total"]:
        rnd["status"] = WON
        return {"refill": 0}

    refill = 0
    if rnd["sinceRefill"] >= rnd["config"]["refillEvery"] and rnd["pool"]:
        rnd["sinceRefill"] = 0
        refill = deal(rnd, online, rnd["config"]["refillCount"])
    refill += _unstick(rnd, online)
    return {"refill": refill}


def give(rnd: dict, pid: str, to: str, key: str) -> None:
    """Teil aus dem eigenen Inventar an einen Mitspieler senden."""
    if rnd["status"] != RUNNING:
        raise RoundError("round_over", "Die Runde ist schon vorbei.")
    if to == pid:
        raise RoundError("bad_target", "An dich selbst kannst du nichts senden.")
    hand = rnd["hands"].get(pid, [])
    if key not in hand:
        raise RoundError("not_in_hand", "Dieses Item liegt nicht in deinem Inventar.")
    hand.remove(key)
    rnd["hands"].setdefault(to, []).append(key)
    _event(rnd, type="gift", player=pid, to=to, key=key)


def return_hand(rnd: dict, pid: str, online: list[str], rng: random.Random | None = None) -> int:
    """Teile eines Spielers zurück in den Vorrat (an zufällige Stellen); er verlässt die Reihenfolge."""
    _leave_rotation(rnd, pid)
    hand = rnd["hands"].pop(pid, [])
    if rnd["status"] != RUNNING or not hand:
        return 0
    rng = rng or random.Random()
    for key in hand:
        rnd["pool"].insert(rng.randint(0, len(rnd["pool"])), key)
    _unstick(rnd, online)
    return len(hand)


def _leave_rotation(rnd: dict, pid: str) -> None:
    order = _rotation(rnd)
    if pid not in order:
        return
    i = order.index(pid)
    order.pop(i)
    if i < rnd["cursor"]:
        rnd["cursor"] -= 1
    rnd["cursor"] = rnd["cursor"] % len(order) if order else 0


def _unstick(rnd: dict, online: list[str]) -> int:
    """Keiner (online) hat mehr ein Teil, der Vorrat aber schon → sofort nachlegen."""
    if rnd["status"] != RUNNING or not rnd["pool"] or not online:
        return 0
    if any(rnd["hands"].get(pid) for pid in online):
        return 0
    rnd["sinceRefill"] = 0
    n = deal(rnd, online, rnd["config"]["refillCount"])
    if n:
        _event(rnd, type="refill", player=None, count=n)
    return n


def public_view(rnd: dict | None) -> dict | None:
    """Was alle sehen dürfen: ohne Vorrat-Reihenfolge und fremde Inventare (nur deren Größe)."""
    if not rnd:
        return None
    return {
        "number": rnd["number"], "config": rnd["config"], "status": rnd["status"],
        "lives": rnd["lives"], "livesMax": rnd["livesMax"], "total": rnd["total"],
        "placed": rnd["placed"], "placedBy": rnd["placedBy"], "poolCount": len(rnd["pool"]),
        "sinceRefill": rnd["sinceRefill"],
        "handCounts": {pid: len(h) for pid, h in rnd["hands"].items()}, "last": rnd["last"],
    }
