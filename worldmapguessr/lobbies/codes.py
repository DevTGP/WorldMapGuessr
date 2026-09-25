"""Kurze, gut lesbare Lobby-Codes (ohne 0/O, 1/I/L)."""
import secrets

ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"  # 31 Zeichen
LENGTH = 5                                     # 31^5 ≈ 28,6 Mio. Codes
PATTERN = f"[{ALPHABET}]{{{LENGTH}}}"          # für die URL-Route


def new_code(taken) -> str:
    while True:
        code = "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))
        if code not in taken:
            return code


def normalize(code: str) -> str:
    return code.strip().upper()


try:
    from werkzeug.routing import BaseConverter

    class LobbyCodeConverter(BaseConverter):
        """URL-Konverter für Codes in beliebiger Schreibweise (/k7q2m → Weiterleitung auf /K7Q2M).
        Feste Routen wie /stats haben in Werkzeug Vorrang vor Konverter-Routen."""
        regex = "[" + ALPHABET + ALPHABET.lower().replace("2345678", "").replace("9", "") + "]{" + str(LENGTH) + "}"
except ImportError:  # pragma: no cover
    pass
