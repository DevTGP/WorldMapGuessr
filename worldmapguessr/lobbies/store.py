"""Lobbys als JSON-Datei (instance/lobbies.json). Verfällt nach LOBBY_TTL ohne Aktivität."""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import tempfile
import threading
import time
from pathlib import Path

from werkzeug.security import check_password_hash, generate_password_hash

from .codes import new_code, normalize
from .settings import DEFAULT_CONFIG, clean_config, clean_max_players, clean_name

LOBBY_TTL = 24 * 3600  # Sekunden ohne Aktivität, danach wird die Lobby gelöscht


class LobbyError(Exception):
    """Fehler mit maschinenlesbarem Code für den Client."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class LobbyStore:
    def __init__(self, path: str | os.PathLike, ttl: int = LOBBY_TTL, clock=time.time):
        self.path = Path(path)
        self.ttl = ttl
        self.clock = clock
        self.lock = threading.RLock()
        self._lobbies: dict[str, dict] = self._load()
        self.expire()

    # ---------- Lesen ----------
    def get(self, code: str) -> dict | None:
        with self.lock:
            return self._lobbies.get(normalize(code))

    def public_info(self, code: str) -> dict | None:
        lobby = self.get(code)
        if not lobby:
            return None
        return {
            "code": lobby["code"],
            "private": bool(lobby["settings"]["passwordHash"]),
            "maxPlayers": lobby["settings"]["maxPlayers"],
        }

    # ---------- Anlegen / Beitreten ----------
    def create(self, *, player_name, config=None, max_players=None, password="") -> tuple[dict, dict]:
        """Neue Lobby; der Ersteller wird Host. Gibt (lobby, player_with_token) zurück."""
        with self.lock:
            code = new_code(self._lobbies)
            now = self.clock()
            player, token = self._new_player(player_name, now)
            lobby = {
                "code": code,
                "created": now,
                "lastActive": now,
                "host": player["id"],
                "settings": {
                    "config": clean_config(config if config is not None else DEFAULT_CONFIG),
                    "maxPlayers": clean_max_players(max_players),
                    "passwordHash": generate_password_hash(password) if password else "",
                },
                "players": {player["id"]: player},
                "round": None,
            }
            self._lobbies[code] = lobby
            self._save()
            return lobby, {"id": player["id"], "token": token, "name": player["name"]}

    def authenticate(self, code, player_id, token) -> dict | None:
        """Bekannter Spieler mit gültigem Token (Wiederbeitritt) oder None."""
        lobby = self.get(code)
        if not lobby or not player_id or not token:
            return None
        player = lobby["players"].get(player_id)
        if player and secrets.compare_digest(player["tokenHash"], _hash_token(token)):
            return player
        return None

    def join(self, code, *, name, password="", online_count=0) -> tuple[dict, str]:
        """Neuer Spieler tritt bei. Prüft Passwort und Spielerlimit."""
        with self.lock:
            lobby = self._require(code)
            pw_hash = lobby["settings"]["passwordHash"]
            if pw_hash and not check_password_hash(pw_hash, password or ""):
                raise LobbyError("password", "Falsches Passwort.")
            if online_count >= lobby["settings"]["maxPlayers"]:
                raise LobbyError("full", "Die Lobby ist voll.")
            player, token = self._new_player(name, self.clock())
            lobby["players"][player["id"]] = player
            self.touch(lobby["code"])
            return player, token

    def rename(self, code, player_id, name):
        with self.lock:
            lobby = self._require(code)
            lobby["players"][player_id]["name"] = clean_name(name)
            self.touch(code)

    # ---------- Host-Aktionen ----------
    def update_settings(self, code, player_id, settings: dict) -> dict:
        with self.lock:
            lobby = self._require(code)
            self._require_host(lobby, player_id)
            s = lobby["settings"]
            if "config" in settings:
                s["config"] = clean_config(settings["config"])
            if "maxPlayers" in settings:
                s["maxPlayers"] = clean_max_players(settings["maxPlayers"])
            if "password" in settings:  # "" entfernt das Passwort
                pw = str(settings["password"] or "")[:64]
                s["passwordHash"] = generate_password_hash(pw) if pw else ""
            self.touch(code)
            return lobby

    def start_round(self, code, player_id) -> dict:
        with self.lock:
            lobby = self._require(code)
            self._require_host(lobby, player_id)
            number = (lobby["round"] or {}).get("number", 0) + 1
            lobby["round"] = {
                "number": number,
                "seed": secrets.randbits(31),
                "startedAt": self.clock(),
                "config": dict(lobby["settings"]["config"]),
            }
            self.touch(code)
            return lobby

    def set_host(self, code, player_id):
        with self.lock:
            lobby = self._require(code)
            if player_id in lobby["players"]:
                lobby["host"] = player_id
                self.touch(code)

    # ---------- Pflege ----------
    def touch(self, code):
        with self.lock:
            lobby = self._lobbies.get(normalize(code))
            if lobby:
                lobby["lastActive"] = self.clock()
                self._save()

    def expire(self) -> list[str]:
        """Lobbys ohne Aktivität seit ttl löschen."""
        with self.lock:
            limit = self.clock() - self.ttl
            gone = [c for c, l in self._lobbies.items() if l["lastActive"] < limit]
            for c in gone:
                del self._lobbies[c]
            if gone:
                self._save()
            return gone

    # ---------- intern ----------
    def _require(self, code) -> dict:
        lobby = self._lobbies.get(normalize(code))
        if not lobby:
            raise LobbyError("not_found", "Diese Lobby gibt es nicht (mehr).")
        return lobby

    @staticmethod
    def _require_host(lobby, player_id):
        if lobby["host"] != player_id:
            raise LobbyError("not_host", "Nur der Host darf das.")

    @staticmethod
    def _new_player(name, now):
        token = secrets.token_urlsafe(24)
        player = {
            "id": secrets.token_hex(6),
            "name": clean_name(name),
            "tokenHash": _hash_token(token),
            "joined": now,
        }
        return player, token

    def _load(self) -> dict:
        if self.path.exists():
            with self.path.open(encoding="utf-8") as f:
                return json.load(f).get("lobbies", {})
        return {}

    def _save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=".lobbies-", suffix=".json")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump({"version": 1, "lobbies": self._lobbies}, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self.path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
