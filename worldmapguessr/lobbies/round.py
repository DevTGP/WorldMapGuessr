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
- Teile können an Mitspieler gesendet werden (give) – sie wechseln nur das Inventar. Sendelimit
  (Lobbyeinstellung `sendEvery` = N): je N vom Server erhaltene Items darf ein Spieler 1 Item senden;
  geschenkte Items zählen nicht mit.
- Timer (`config.timer` s, 0 = aus): fester Takt ab Rundenbeginn. Nach der Schonfrist (`config.grace`)
  gehen alle `timer` Sekunden `timerTake` Items zurück in den Vorrat – wie beim Verteilen reihum in fester
  Reihenfolge (eigener Zeiger `takeCursor`), je Spieler sein ältestes Item. Hat ein Spieler keins (oder
  ist er nicht verbunden), ist der Nächste dran.

Rundenzustand (JSON-serialisierbar, wird mit der Lobby gespeichert):
{number, seed, startedAt, config, status: running|won|lost, lives, livesMax, total,
 pool: [key], hands: {playerId: [key]}, placed: [key], placedBy: {key: playerId},
 order: [playerId], cursor, dealt: {playerId: n}, sent: {playerId: n}, sinceRefill,
 timer: {nextAt, graceUntil, pausedAt} | None, takeCursor, events, log: [event], last: event}
Ereignis: {seq, type: placed|miss|refill|gift|take, player?, key?, count?, to?, items?}
 refill: to = {playerId: n}; take: items = [{player, key}]
`events` zählt Ereignisse hoch; `log` hält die letzten LOG_SIZE, der Client zeigt jedes (seq) genau einmal.

Item-Statistik (spawned/correct/incorrect) zählt in der Lobby allein der Server: jedes Austeilen aus
dem Vorrat an einen Spieler = spawned, jeder angenommene Einsetzversuch = correct bzw. incorrect.
Senden zwischen Spielern und Zurücklegen in den Vorrat zählen nicht. Die Ereignisse sammeln sich in
rnd[STATS] und werden vom LobbyStore mit take_stats() abgeholt (nicht gespeichert).
"""
from __future__ import annotations

import random
import time

from ..difficulty import order_by_difficulty

RUNNING, WON, LOST = "running", "won", "lost"
LOG_SIZE = 40
STATS = "_stats"  # vorübergehende Liste [(key, event)] für die Item-Statistik


class RoundError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def build_pool(catalog: dict[str, list[str]], config: dict, rng: random.Random,
               difficulty: dict[str, float] | None = None) -> list[str]:
    """Alle Items der Konfiguration (Gruppen ohne ausgeschlossene) in Austeil-Reihenfolge nach dem
    Schwierigkeitsregler (config["difficulty"], 0…100 %) und der Item-Schwierigkeit."""
    excluded = set(config.get("excluded") or [])
    keys = [k for kind in config["kinds"] for k in catalog.get(kind, []) if k not in excluded]
    return order_by_difficulty(keys, difficulty or {}, config.get("difficulty", 50), rng)


def new_round(number: int, config: dict, catalog, online: list[str], seed: int, now: float,
              difficulty: dict[str, float] | None = None) -> dict:
    rng = random.Random(seed)
    pool = build_pool(catalog, config, rng, difficulty)
    rnd = {
        "number": number, "seed": seed, "startedAt": now, "config": dict(config),
        "status": RUNNING, "lives": config["lives"], "livesMax": config["lives"], "total": len(pool),
        "pool": pool, "hands": {}, "order": list(online), "cursor": 0, "dealt": {}, "sent": {},
        "placed": [], "placedBy": {}, "sinceRefill": 0, "events": 0, "log": [], "last": None,
        "timer": {"nextAt": now + config.get("grace", 0) + config["timer"], "graceUntil": now + config.get("grace", 0),
                  "pausedAt": None} if config.get("timer") else None,
        "takeCursor": 0,
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
    return sum(_deal(rnd, online, count).values())


def _deal(rnd: dict, online: list[str], count: int) -> dict[str, int]:
    """Wie deal(), gibt {Spieler: Anzahl} zurück."""
    order = _rotation(rnd)
    online = set(online)
    to: dict[str, int] = {}
    if not order or not online.intersection(order):
        return to
    given = 0
    while given < count and rnd["pool"]:
        pid = order[rnd["cursor"] % len(order)]
        rnd["cursor"] = (rnd["cursor"] + 1) % len(order)
        if pid not in online:
            continue
        key = rnd["pool"].pop(0)
        rnd["hands"].setdefault(pid, []).append(key)
        rnd["dealt"][pid] = rnd["dealt"].get(pid, 0) + 1
        _count(rnd, key, "spawned")
        to[pid] = to.get(pid, 0) + 1
        given += 1
    return to


def _count(rnd: dict, key: str, event: str) -> None:
    rnd.setdefault(STATS, []).append((key, event))


def take_stats(rnd: dict | None) -> list[tuple[str, str]]:
    """Gesammelte Statistik-Ereignisse abholen (und aus der Runde entfernen)."""
    return rnd.pop(STATS, []) if rnd else []


def _event(rnd: dict, **event) -> None:
    rnd["events"] = rnd.get("events", 0) + 1
    rnd["last"] = {"seq": rnd["events"], **event}
    log = rnd.setdefault("log", [])
    log.append(rnd["last"])
    del log[:-LOG_SIZE]


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

    _count(rnd, key, "correct" if correct else "incorrect")
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
        to = _deal(rnd, online, rnd["config"]["refillCount"])
        refill = sum(to.values())
        if refill:
            _event(rnd, type="refill", player=None, count=refill, to=to)
    refill += _unstick(rnd, online)
    return {"refill": refill}


def send_quota(rnd: dict, pid: str, every: int) -> dict:
    """Sendelimit eines Spielers: {"every", "left": noch erlaubte Sendungen, "next": Items bis zur nächsten}
    (every 0 = ohne Limit → left None)."""
    if not every:
        return {"every": 0, "left": None, "next": 0}
    dealt = rnd.get("dealt", {}).get(pid, 0)
    left = dealt // every - rnd.get("sent", {}).get(pid, 0)
    return {"every": every, "left": max(0, left), "next": every - dealt % every}


def give(rnd: dict, pid: str, to: str, key: str, every: int = 0) -> None:
    """Teil aus dem eigenen Inventar an einen Mitspieler senden (every: Sendelimit, siehe send_quota)."""
    if rnd["status"] != RUNNING:
        raise RoundError("round_over", "Die Runde ist schon vorbei.")
    if to == pid:
        raise RoundError("bad_target", "An dich selbst kannst du nichts senden.")
    hand = rnd["hands"].get(pid, [])
    if key not in hand:
        raise RoundError("not_in_hand", "Dieses Item liegt nicht in deinem Inventar.")
    quota = send_quota(rnd, pid, every)
    if quota["left"] == 0:
        n = quota["next"]
        raise RoundError("send_limit", f"Senden wieder möglich nach {n} weiteren {'Item' if n == 1 else 'Items'}.")
    hand.remove(key)
    rnd["hands"].setdefault(to, []).append(key)
    sent = rnd.setdefault("sent", {})
    sent[pid] = sent.get(pid, 0) + 1
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


def tick(rnd: dict, now: float, online: list[str], rng: random.Random | None = None) -> bool:
    """Timer weiterzählen; ist ein Takt fällig, Items zurück in den Vorrat. True, wenn sich etwas geändert hat.
    Ein Takt je Aufruf. Lag der Takt mehr als eine Periode zurück (Server war aus, niemand da), wird nur
    neu angesetzt – verpasste Takte werden nicht nachgeholt."""
    timer = rnd.get("timer")
    if not timer or rnd["status"] != RUNNING or timer.get("pausedAt") is not None or now < timer["nextAt"]:
        return False
    every = rnd["config"]["timer"]
    if now - timer["nextAt"] > every or not online:
        timer["nextAt"] = now + every
        return False
    timer["nextAt"] += every
    return bool(take(rnd, online, rnd["config"]["timerTake"], rng))


def take(rnd: dict, online: list[str], count: int, rng: random.Random | None = None) -> list[dict]:
    """`count` Items reihum (eigener Zeiger) aus den Inventaren zurück in den Vorrat, je Spieler das älteste.
    Spieler ohne Item oder ohne Verbindung werden übersprungen. Gibt [{player, key}] zurück."""
    order = _rotation(rnd)
    online = set(online)
    rng = rng or random.Random()
    taken: list[dict] = []
    misses = 0  # Spieler in Folge ohne Item – nach einer vollen Runde ist nichts mehr zu holen
    while len(taken) < count and order and misses < len(order):
        pid = order[rnd.get("takeCursor", 0) % len(order)]
        rnd["takeCursor"] = (rnd.get("takeCursor", 0) + 1) % len(order)
        hand = rnd["hands"].get(pid) or []
        if pid not in online or not hand:
            misses += 1
            continue
        misses = 0
        key = hand.pop(0)
        rnd["pool"].insert(rng.randint(0, len(rnd["pool"])), key)
        taken.append({"player": pid, "key": key})
    if taken:
        _event(rnd, type="take", player=None, items=taken)
        _unstick(rnd, online)
    return taken


def pause_timer(rnd: dict | None, now: float, paused: bool) -> bool:
    """Timer anhalten (niemand verbunden, Einzelspieler im Menü) bzw. weiterlaufen lassen – Takt und
    Schonfrist verschieben sich um die Pause. True, wenn sich etwas geändert hat."""
    timer = (rnd or {}).get("timer")
    if not timer or rnd["status"] != RUNNING:
        return False
    since = timer.get("pausedAt")
    if paused and since is None:
        timer["pausedAt"] = now
        return True
    if not paused and since is not None:
        gone = max(0.0, now - since)
        timer["nextAt"] += gone
        timer["graceUntil"] = _grace_until(rnd) + gone
        timer["pausedAt"] = None
        return True
    return False


def _grace_until(rnd: dict) -> float:
    timer = rnd["timer"]
    return timer.get("graceUntil", rnd["startedAt"] + rnd["config"].get("grace", 0))  # ältere Runden


def timer_view(rnd: dict, now: float) -> dict | None:
    """Timer für die Anzeige: Sekunden bis zum nächsten Takt, restliche Schonfrist, ob angehalten."""
    timer = rnd.get("timer")
    if not timer or rnd["status"] != RUNNING:
        return None
    c = rnd["config"]
    ref = timer["pausedAt"] if timer.get("pausedAt") is not None else now
    return {
        "nextIn": max(0.0, round(timer["nextAt"] - ref, 2)),
        "every": c["timer"], "take": c["timerTake"],
        "graceLeft": max(0.0, round(_grace_until(rnd) - ref, 2)),
        "paused": timer.get("pausedAt") is not None,
    }


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
    to = _deal(rnd, online, rnd["config"]["refillCount"])
    n = sum(to.values())
    if n:
        _event(rnd, type="refill", player=None, count=n, to=to)
    return n


def public_view(rnd: dict | None, now: float | None = None) -> dict | None:
    """Was alle sehen dürfen: ohne Vorrat-Reihenfolge und fremde Inventare (nur deren Größe)."""
    if not rnd:
        return None
    now = time.time() if now is None else now
    return {
        "number": rnd["number"], "config": rnd["config"], "status": rnd["status"],
        "lives": rnd["lives"], "livesMax": rnd["livesMax"], "total": rnd["total"],
        "placed": rnd["placed"], "placedBy": rnd["placedBy"], "poolCount": len(rnd["pool"]),
        "sinceRefill": rnd["sinceRefill"],
        "handCounts": {pid: len(h) for pid, h in rnd["hands"].items()}, "last": rnd["last"],
        "log": rnd.get("log", []), "events": rnd.get("events", 0), "timer": timer_view(rnd, now),
    }
