"""Punkte einer Runde (Einzelspiel und Lobby).

Je Spieler:
  Treffer   100 + Item-Schwierigkeit × 20 (0 … 10, aus der Statistik zu Rundenbeginn) + Tempo-Bonus bis 50
  Fehlwurf  −30
Tempo: Zeit seit der letzten eigenen Aktion (Einsetzversuch), dem Beitritt, dem Rundenstart bzw. dem Ende einer
Pause – bis 5 s volle 50 Punkte, danach linear weniger, ab 45 s keiner.
Rundenende (Team, nur bei Sieg): +50 je übrigem Leben, +200 Siegbonus.
Alles wird mit dem Multiplikator von Modus und Stufe (×1 … ×2) gerechnet. Gesamtpunktzahl der Runde = Summe der
Spielerpunkte + Teambonus.
"""
from __future__ import annotations

HIT_BASE = 100
HIT_PER_DIFFICULTY = 20
TEMPO_MAX = 50
TEMPO_FULL_S = 5
TEMPO_ZERO_S = 45
MISS = -30
LIFE_BONUS = 50
WIN_BONUS = 200
DEFAULT_DIFFICULTY = 5.0
MAX_MULT = 2.0

MODE_FACTOR = {"casual": 1.0, "easyfocus": 1.1, "focus": 1.25, "tempo": 1.25, "hardcore": 1.5}
LEVEL_FACTOR = [1.0, 1.1, 1.2, 1.3, 1.4]  # Sehr einfach … Sehr schwer


def multiplier(config: dict) -> float:
    """×1 … ×2 aus Modus und Stufe; eigene Einstellungen: aus den Regeln (Timer, kein Zurücklegen, Fehlwurf)."""
    mode = config.get("mode")
    if mode in MODE_FACTOR:
        level = config.get("level", 2)
        factor = MODE_FACTOR[mode] * LEVEL_FACTOR[max(0, min(len(LEVEL_FACTOR) - 1, int(level)))]
    else:
        factor = 1 + 0.2 * bool(config.get("timer")) + 0.1 * bool(config.get("noReturn")) \
            + 0.1 * bool(config.get("missLoses"))
    return round(min(MAX_MULT, factor), 2)


def tempo_bonus(seconds: float) -> int:
    if seconds <= TEMPO_FULL_S:
        return TEMPO_MAX
    return round(TEMPO_MAX * max(0.0, (TEMPO_ZERO_S - seconds) / (TEMPO_ZERO_S - TEMPO_FULL_S)))


def _entry(rnd: dict, pid: str) -> dict:
    return rnd.setdefault("scores", {}).setdefault(pid, {"points": 0, "hits": 0, "misses": 0})


def start_pace(rnd: dict, pid: str, now: float) -> None:
    """Tempo-Uhr eines Spielers (neu) starten: Rundenstart, Beitritt, Wiederverbinden."""
    rnd.setdefault("pace", {})[pid] = now


def _seconds(rnd: dict, pid: str, now: float) -> float:
    since = max(rnd.get("pace", {}).get(pid, rnd.get("startedAt", now)), rnd.get("resumedAt") or 0)
    return max(0.0, now - since)


def hit(rnd: dict, pid: str, key: str, now: float) -> int:
    """Treffer werten; gibt die Punkte zurück."""
    difficulty = rnd.get("diff", {}).get(key, DEFAULT_DIFFICULTY)
    raw = HIT_BASE + difficulty * HIT_PER_DIFFICULTY + tempo_bonus(_seconds(rnd, pid, now))
    points = round(raw * multiplier(rnd["config"]))
    e = _entry(rnd, pid)
    e["points"] += points
    e["hits"] += 1
    start_pace(rnd, pid, now)
    return points


def miss(rnd: dict, pid: str, now: float) -> int:
    points = round(MISS * multiplier(rnd["config"]))
    e = _entry(rnd, pid)
    e["points"] += points
    e["misses"] += 1
    start_pace(rnd, pid, now)
    return points


def finish(rnd: dict) -> None:
    """Rundenende: Teambonus (nur bei Sieg: übrige Leben, Siegbonus) festhalten."""
    if "bonus" in rnd:
        return
    mult = multiplier(rnd["config"])
    won = rnd["status"] == "won"
    lives = round(LIFE_BONUS * rnd["lives"] * mult) if won else 0
    win = round(WIN_BONUS * mult) if won else 0
    rnd["bonus"] = {"lives": lives, "win": win, "total": lives + win}


def view(rnd: dict) -> dict:
    """Für alle sichtbar: Punkte je Spieler, Teambonus (erst am Rundenende), Gesamt, Multiplikator."""
    scores = rnd.get("scores", {})
    bonus = rnd.get("bonus")
    players = sum(s["points"] for s in scores.values())
    return {"players": scores, "bonus": bonus, "total": players + (bonus["total"] if bonus else 0),
            "mult": multiplier(rnd["config"])}
