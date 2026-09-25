"""Live-Verbindungen der Lobbys: wer ist online, Host-Übergabe, Broadcast des Lobby-Zustands."""
from __future__ import annotations

import json
import threading
import time

from .settings import clean_name
from .store import LobbyError, LobbyStore

HOST_GRACE = 10.0         # s: so lange darf der Host weg sein (z. B. Seite neu laden), bevor die Rolle wechselt
EXPIRE_INTERVAL = 600.0   # s: Abstand der Aufräumläufe für verfallene Lobbys


class Connection:
    """Ein WebSocket (ein Browser-Tab). Senden ist thread-sicher."""

    def __init__(self, ws):
        self.ws = ws
        self.lock = threading.Lock()
        self.player_id: str | None = None

    def send(self, message: dict) -> bool:
        try:
            with self.lock:
                self.ws.send(json.dumps(message, ensure_ascii=False))
            return True
        except Exception:  # Verbindung schon zu – wird beim Aufräumen entfernt
            return False


class LobbyHub:
    def __init__(self, store: LobbyStore, host_grace: float = HOST_GRACE, clock=time.monotonic):
        self.store = store
        self.host_grace = host_grace
        self.clock = clock
        self.lock = threading.RLock()
        self.online: dict[str, dict[str, list[Connection]]] = {}  # code → player_id → Verbindungen
        self.offline_since: dict[tuple[str, str], float] = {}

    # ---------- Verbindung ----------
    def join(self, code: str, conn: Connection, msg: dict) -> str:
        """Erste Nachricht einer Verbindung. Gibt die Spieler-ID zurück oder wirft LobbyError."""
        if msg.get("type") != "join":
            raise LobbyError("protocol", "Erwartet: join")
        with self.lock:
            lobby = self.store.get(code)
            if not lobby:
                raise LobbyError("not_found", "Diese Lobby gibt es nicht (mehr).")
            code = lobby["code"]
            player = self.store.authenticate(code, msg.get("playerId"), msg.get("token"))
            token = None
            if player:
                if msg.get("name") and clean_name(msg["name"]) != player["name"]:
                    self.store.rename(code, player["id"], msg["name"])
            else:
                player, token = self.store.join(
                    code, name=msg.get("name"), password=msg.get("password", ""),
                    online_count=len(self.online.get(code, {})),
                )
            conn.player_id = player["id"]
            online = self.online.setdefault(code, {})
            # Host noch nie verbunden (frisch erstellt oder nach Serverneustart): Karenzzeit ab jetzt
            if lobby["host"] not in online:
                self.offline_since.setdefault((code, lobby["host"]), self.clock())
            online.setdefault(player["id"], []).append(conn)
            self.offline_since.pop((code, player["id"]), None)
            self._fix_host(code)
            self.store.touch(code)

        welcome = {"type": "welcome", "player": {"id": player["id"], "name": player["name"]}}
        if token:
            welcome["player"]["token"] = token  # nur beim ersten Beitritt; der Browser merkt ihn sich
        conn.send(welcome)
        self.broadcast(code)
        return player["id"]

    def leave(self, code: str, conn: Connection):
        with self.lock:
            players = self.online.get(code, {})
            conns = players.get(conn.player_id, [])
            if conn in conns:
                conns.remove(conn)
            if conn.player_id and not conns:
                players.pop(conn.player_id, None)
                self.offline_since[(code, conn.player_id)] = self.clock()
                lobby = self.store.get(code)
                if lobby and lobby["host"] == conn.player_id:
                    threading.Timer(self.host_grace + 0.1, self._host_check, args=(code,)).start()
            if not players:
                self.online.pop(code, None)
        self.broadcast(code)

    # ---------- Nachrichten ----------
    def handle(self, code: str, conn: Connection, msg: dict):
        kind = msg.get("type")
        pid = conn.player_id
        if kind == "ping":
            conn.send({"type": "pong"})
            return
        if kind == "settings":
            self.store.update_settings(code, pid, msg.get("settings") or {})
        elif kind == "start":
            self.store.start_round(code, pid)
        elif kind == "rename":
            self.store.rename(code, pid, msg.get("name"))
        else:
            raise LobbyError("protocol", f"Unbekannte Nachricht: {kind}")
        self.broadcast(code)

    # ---------- Zustand ----------
    def state(self, code: str) -> dict | None:
        lobby = self.store.get(code)
        if not lobby:
            return None
        online = self.online.get(lobby["code"], {})
        players = [
            {"id": p["id"], "name": p["name"], "online": p["id"] in online, "host": p["id"] == lobby["host"]}
            for p in sorted(lobby["players"].values(), key=lambda p: p["joined"])
            if p["id"] in online or p["id"] == lobby["host"]
        ]
        s = lobby["settings"]
        return {
            "code": lobby["code"],
            "host": lobby["host"],
            "players": players,
            "settings": {"config": s["config"], "maxPlayers": s["maxPlayers"], "private": bool(s["passwordHash"])},
            "round": lobby["round"],
        }

    def broadcast(self, code: str):
        state = self.state(code)
        if state is None:
            return
        with self.lock:
            conns = [c for cs in self.online.get(state["code"], {}).values() for c in cs]
        for c in conns:
            c.send({"type": "state", "lobby": state})

    def online_count(self, code: str) -> int:
        return len(self.online.get(code, {}))

    # ---------- Host ----------
    def _host_check(self, code: str):
        with self.lock:
            changed = self._fix_host(code)
        if changed:
            self.broadcast(code)

    def _fix_host(self, code: str) -> bool:
        """Host länger als host_grace offline → Rolle an den am längsten anwesenden Online-Spieler."""
        lobby = self.store.get(code)
        online = self.online.get(code, {})
        if not lobby or not online or lobby["host"] in online:
            return False
        since = self.offline_since.get((code, lobby["host"]))
        if since is not None and self.clock() - since < self.host_grace:
            return False
        successor = min(online, key=lambda pid: lobby["players"][pid]["joined"])
        self.store.set_host(code, successor)
        return True

    # ---------- Aufräumen ----------
    def start_expiry(self, interval: float = EXPIRE_INTERVAL):
        def loop():
            while True:
                time.sleep(interval)
                for code in self.store.expire():
                    with self.lock:
                        self.online.pop(code, None)
        threading.Thread(target=loop, name="lobby-expiry", daemon=True).start()
