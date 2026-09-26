"""Lobbyeinstellungen prüfen und normalisieren (Server ist maßgeblich)."""

LIMITS = {
    "lives": (1, 30),
    "startItems": (1, 60),
    "refillCount": (1, 20),
    "refillEvery": (1, 20),
    "difficulty": (0, 100),  # Schwierigkeitsregler in % (Reihenfolge der Items, siehe difficulty.py)
    "timer": (0, 600),       # s zwischen zwei Wegnahmen (0 = aus), in 10-s-Schritten
    "grace": (0, 600),       # s Schonfrist ab Rundenbeginn bis zum ersten Takt, in 10-s-Schritten
    "timerTake": (1, 20),    # Items, die je Takt reihum aus den Inventaren zurück in den Vorrat gehen
}
TEN_SECOND_STEPS = ("timer", "grace")
# Item-Gruppen (Menü-Karten); Items behalten ihre Art im Key ("country:USA")
KINDS = ("continent", "country-eu", "country-na", "country-sa", "country-af", "country-as", "country-oc")
# Ältere Lobbys: "country" meinte die Staaten Europas
LEGACY_KINDS = {"country": ("country-eu",)}
MAX_PLAYERS = (1, 50)
DEFAULT_ALLOW_SEND = True  # Items an Mitspieler senden
SEND_EVERY = (0, 20)       # Sendelimit: 1 Senden je N vom Server erhaltene Items (0 = ohne Limit)
DEFAULT_SEND_EVERY = 5

DEFAULT_CONFIG = {
    "lives": 10,
    "startItems": 5,
    "refillCount": 4,
    "refillEvery": 3,
    "difficulty": 50,
    "timer": 0,
    "grace": 30,
    "timerTake": 1,
    "noReturn": False,       # gehaltenes Item kann nicht zurück ins Inventar – es muss eingesetzt werden
    "kinds": list(KINDS),
    "excluded": [],
}


def _int(value, lo, hi, default):
    try:
        return max(lo, min(hi, int(value)))
    except (TypeError, ValueError):
        return default


def clean_config(raw) -> dict:
    raw = raw if isinstance(raw, dict) else {}
    cfg = {k: _int(raw.get(k), lo, hi, DEFAULT_CONFIG[k]) for k, (lo, hi) in LIMITS.items()}
    for k in TEN_SECOND_STEPS:
        cfg[k] = int(round(cfg[k] / 10)) * 10
    cfg["noReturn"] = clean_bool(raw.get("noReturn"), DEFAULT_CONFIG["noReturn"])
    wanted = set()
    for k in raw.get("kinds") or []:
        wanted.update(LEGACY_KINDS.get(k, (k,)) if isinstance(k, str) else ())
    kinds = [k for k in KINDS if k in wanted]
    cfg["kinds"] = kinds or list(KINDS)
    excluded = raw.get("excluded") or []
    cfg["excluded"] = sorted({str(x)[:40] for x in excluded if isinstance(x, str)})[:500]
    return cfg


def clean_bool(value, default: bool) -> bool:
    return value if isinstance(value, bool) else default


def clean_send_every(value, default=DEFAULT_SEND_EVERY) -> int:
    return _int(value, *SEND_EVERY, default)


def clean_max_players(value) -> int:
    return _int(value, *MAX_PLAYERS, 8)


def clean_name(value, fallback="Spieler") -> str:
    name = " ".join(str(value or "").split())[:24]
    return name or fallback
