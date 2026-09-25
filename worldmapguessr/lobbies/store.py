"""Lobbys: im Speicher gehalten, jede Änderung sofort persistiert (JSON-Datei oder MongoDB,
siehe persistence.py). Verfällt nach LOBBY_TTL ohne Aktivität."""
from __future__ import annotations

import hashlib
import os
import secrets
import threading
import time

from werkzeug.security import check_password_hash, generate_password_hash

from . import round as rounds
from .codes import new_code, normalize
from .persistence import JsonLobbyPersistence
from .settings import (DEFAULT_ALLOW_SEND, DEFAULT_CONFIG, clean_bool, clean_config, clean_max_players,
                       clean_name)

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
    def __init__(self, persistence, ttl: int = LOBBY_TTL, clock=time.time, catalog=None):
        """persistence: JsonLobbyPersistence/MongoLobbyPersistence oder ein Dateipfad (→ JSON).
        catalog: {kind: [Feature-Key]} – alle Teile, aus denen eine Runde gebaut wird."""
        self.catalog = catalog or {}
        if isinstance(persistence, (str, os.PathLike)):
            persistence = JsonLobbyPersistence(persistence)
        self.persistence = persistence
        self.ttl = ttl
        self.clock = clock
        self.lock = threading.RLock()
        self._lobbies: dict[str, dict] = persistence.load_all()
        for lobby in self._lobbies.values():  # ältere Lobbys: Konfiguration ins aktuelle Format (Item-Gruppen)
            lobby["settings"]["config"] = clean_config(lobby["settings"]["config"])
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
                    "allowSend": DEFAULT_ALLOW_SEND,
                },
                "players": {player["id"]: player},
                "round": None,
            }
            self._lobbies[code] = lobby
            self.persistence.save(lobby)
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
            if "allowSend" in settings:
                s["allowSend"] = clean_bool(settings["allowSend"], s.get("allowSend", DEFAULT_ALLOW_SEND))
            if "password" in settings:  # "" entfernt das Passwort
                pw = str(settings["password"] or "")[:64]
                s["passwordHash"] = generate_password_hash(pw) if pw else ""
            self.touch(code)
            return lobby

    # ---------- Runde ----------
    def start_round(self, code, player_id, online=()) -> dict:
        """Host startet eine neue Runde für alle (gemeinsamer Vorrat, gemeinsame Leben)."""
        with self.lock:
            lobby = self._require(code)
            self._require_host(lobby, player_id)
            number = (lobby["round"] or {}).get("number", 0) + 1
            # Reihenfolge fürs Verteilen: wer am längsten in der Lobby ist, zuerst
            players = sorted((p for p in online if p in lobby["players"]),
                             key=lambda p: lobby["players"][p]["joined"]) or [player_id]
            lobby["round"] = rounds.new_round(
                number, lobby["settings"]["config"], self.catalog, players,
                seed=secrets.randbits(31), now=self.clock(),
            )
            self.touch(code)
            return lobby

    def round_join(self, code, player_id) -> bool:
        """Spieler ist (wieder) da: reiht sich in die Verteil-Reihenfolge der laufenden Runde ein."""
        with self.lock:
            lobby = self._require(code)
            if not lobby["round"]:
                return False
            joined = rounds.join(lobby["round"], player_id)
            if joined:
                self.touch(code)
            return joined

    def place(self, code, player_id, key, correct, online=()) -> dict:
        with self.lock:
            lobby = self._require(code)
            if not lobby["round"]:
                raise LobbyError("no_round", "Es läuft keine Runde.")
            try:
                result = rounds.place(lobby["round"], player_id, str(key), bool(correct), list(online))
            except rounds.RoundError as err:
                raise LobbyError(err.code, err.message) from None
            self.touch(code)
            return result

    def give(self, code, player_id, to, key, online=()):
        """Teil an einen Mitspieler senden (nur wenn der Host es erlaubt und der Empfänger online ist)."""
        with self.lock:
            lobby = self._require(code)
            if not lobby["settings"].get("allowSend", DEFAULT_ALLOW_SEND):
                raise LobbyError("send_disabled", "Senden ist in dieser Lobby ausgeschaltet.")
            if not lobby["round"]:
                raise LobbyError("no_round", "Es läuft keine Runde.")
            if to not in online or to not in lobby["players"]:
                raise LobbyError("bad_target", "Dieser Spieler ist gerade nicht da.")
            try:
                rounds.give(lobby["round"], player_id, str(to), str(key))
            except rounds.RoundError as err:
                raise LobbyError(err.code, err.message) from None
            self.touch(code)

    def return_hand(self, code, player_id, online=()) -> int:
        """Teile eines Spielers zurück in den Vorrat (Verlassen, lange getrennt)."""
        with self.lock:
            lobby = self.get(code)
            if not lobby or not lobby["round"]:
                return 0
            n = rounds.return_hand(lobby["round"], player_id, [p for p in online if p != player_id])
            if n:
                self.touch(code)
            return n

    def remove_player(self, code, player_id, online=()) -> dict | None:
        """Spieler verlässt die Lobby endgültig. War er Host, übernimmt der am längsten anwesende
        Online-Spieler (sonst der am längsten anwesende überhaupt). Ohne Spieler wird die Lobby
        gelöscht – dann Rückgabe None."""
        with self.lock:
            lobby = self._require(code)
            lobby["players"].pop(player_id, None)
            if not lobby["players"]:
                del self._lobbies[lobby["code"]]
                self.persistence.delete(lobby["code"])
                return None
            if lobby["host"] == player_id:
                candidates = [p for p in lobby["players"] if p in online] or list(lobby["players"])
                lobby["host"] = min(candidates, key=lambda p: lobby["players"][p]["joined"])
            self.touch(code)
            return lobby

    def close(self, code, player_id):
        """Host beendet die Lobby für alle."""
        with self.lock:
            lobby = self._require(code)
            self._require_host(lobby, player_id)
            del self._lobbies[lobby["code"]]
            self.persistence.delete(lobby["code"])

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
                self.persistence.save(lobby)

    def expire(self) -> list[str]:
        """Lobbys ohne Aktivität seit ttl löschen."""
        with self.lock:
            limit = self.clock() - self.ttl
            gone = [c for c, l in self._lobbies.items() if l["lastActive"] < limit]
            for c in gone:
                del self._lobbies[c]
                self.persistence.delete(c)
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
