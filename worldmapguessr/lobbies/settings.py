"""Lobbyeinstellungen prüfen und normalisieren (Server ist maßgeblich)."""

LIMITS = {
    "lives": (1, 30),
    "startItems": (1, 60),
    "refillCount": (1, 20),
    "refillEvery": (1, 20),
}
# Item-Gruppen (Menü-Karten); Items behalten ihre Art im Key ("country:USA")
KINDS = ("continent", "country-eu", "country-na", "country-sa", "country-af")
# Ältere Lobbys: "country" meinte die Staaten Europas
LEGACY_KINDS = {"country": ("country-eu",)}
MAX_PLAYERS = (1, 50)
DEFAULT_ALLOW_SEND = True  # Items an Mitspieler senden

DEFAULT_CONFIG = {
    "lives": 10,
    "startItems": 5,
    "refillCount": 4,
    "refillEvery": 3,
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


def clean_max_players(value) -> int:
    return _int(value, *MAX_PLAYERS, 8)


def clean_name(value, fallback="Spieler") -> str:
    name = " ".join(str(value or "").split())[:24]
    return name or fallback
