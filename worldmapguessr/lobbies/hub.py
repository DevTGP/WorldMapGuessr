"""Live-Verbindungen der Lobbys: wer ist online, Host-Übergabe, gemeinsame Runde, Broadcast.

Jeder Spieler bekommt denselben Lobby-Zustand (inkl. öffentlicher Rundenansicht: eingesetzte Teile,
Leben, Vorratsgröße) plus sein eigenes Inventar (`hand`). Fremde Inventare sieht niemand.

Getrennte Spieler behalten ihr Inventar, bis sie die Lobby verlassen oder sie verfällt (Runden lassen
sich Stunden später fortsetzen). Ist niemand verbunden, steht der Rundentimer."""
from __future__ import annotations

import json
import threading
import time

from . import round as rounds
from .settings import DEFAULT_ALLOW_SEND, clean_name
from .store import LobbyError, LobbyStore

HOST_GRACE = 10.0         # s: so lange darf der Host weg sein (z. B. Seite neu laden), bevor die Rolle wechselt
EXPIRE_INTERVAL = 600.0   # s: Abstand der Aufräumläufe für verfallene Lobbys
TICK_INTERVAL = 0.5       # s: Takt, in dem die Rundentimer geprüft werden
CHAT_IN_STATE = 30        # letzte Chat-Nachrichten im Lobby-Zustand


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
            if not self.online.get(code):
                self.store.pause_timer(code, False)  # erster Spieler da → Timer läuft weiter
            online = self.online.setdefault(code, {})
            # Host noch nie verbunden (frisch erstellt oder nach Serverneustart): Karenzzeit ab jetzt
            if lobby["host"] not in online:
                self.offline_since.setdefault((code, lobby["host"]), self.clock())
            online.setdefault(player["id"], []).append(conn)
            self.offline_since.pop((code, player["id"]), None)
            self._fix_host(code)
            self.store.round_join(code, player["id"])  # Nachzügler reiht sich ins Verteilen ein
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
                    self._later(self.host_grace + 0.1, self._host_check, code)
            if not players:
                self.online.pop(code, None)
                self.store.pause_timer(code, True)  # niemand mehr da → Timer anhalten
        self.broadcast(code)

    # ---------- Nachrichten ----------
    def handle(self, code: str, conn: Connection, msg: dict):
        kind = msg.get("type")
        pid = conn.player_id
        if kind == "ping":
            conn.send({"type": "pong"})
            return
        if kind == "leave":
            self._leave_for_good(code, pid)
            return
        if kind == "close":
            self._close(code, pid)
            return
        if kind == "settings":
            self.store.update_settings(code, pid, msg.get("settings") or {})
        elif kind == "start":
            self.store.start_round(code, pid, online=self._online_ids(code))
        elif kind == "give":
            self.store.give(code, pid, msg.get("to"), msg.get("key"), online=self._online_ids(code))
        elif kind == "place":
            self.store.place(code, pid, msg.get("key"), msg.get("correct") is True,
                             online=self._online_ids(code))
        elif kind == "rename":
            self.store.rename(code, pid, msg.get("name"))
        elif kind == "pause":
            # Einzelspiel: Timer steht, solange Menü oder Dialog offen sind (in Lobbys läuft er für alle weiter)
            lobby = self.store.get(code)
            if not lobby or not lobby["settings"].get("solo"):
                return
            if not self.store.pause_timer(code, msg.get("paused") is True):
                return
        elif kind == "chat":
            if not self.store.chat(code, pid, msg.get("text")):
                return
        else:
            raise LobbyError("protocol", f"Unbekannte Nachricht: {kind}")
        self.broadcast(code)

    def _leave_for_good(self, code: str, player_id: str):
        """Spieler verlässt die Lobby (alle seine Tabs). Er muss danach neu beitreten."""
        with self.lock:
            conns = self.online.get(code, {}).pop(player_id, [])
            self.offline_since.pop((code, player_id), None)
            self.store.return_hand(code, player_id, online=self._online_ids(code))
            lobby = self.store.remove_player(code, player_id, online=self.online.get(code, {}).keys())
            if lobby is None:
                self.online.pop(code, None)
        for c in conns:
            c.player_id = None  # kein erneutes leave() beim Schließen
            c.send({"type": "left"})
        if lobby is not None:
            self.broadcast(code)

    def _close(self, code: str, player_id: str):
        """Host beendet die Lobby: alle bekommen "closed", die Lobby wird gelöscht."""
        with self.lock:
            self.store.close(code, player_id)
            players = self.online.pop(code, {})
            for key in [k for k in self.offline_since if k[0] == code]:
                del self.offline_since[key]
        for conns in players.values():
            for c in conns:
                c.player_id = None
                c.send({"type": "closed", "message": "Der Host hat die Lobby beendet."})

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
            "settings": {
                "config": s["config"], "maxPlayers": s["maxPlayers"], "private": bool(s["passwordHash"]),
                "allowSend": s.get("allowSend", DEFAULT_ALLOW_SEND),
                "sendEvery": self.store.send_every(lobby),
                "solo": bool(s.get("solo")), "ttl": self.store.ttl_of(lobby),
            },
            "round": rounds.public_view(lobby["round"], now=self.store.clock()),
            "chat": lobby.get("chat", [])[-CHAT_IN_STATE:],
        }

    def broadcast(self, code: str):
        """Zustand an alle; jeder bekommt zusätzlich nur sein eigenes Inventar."""
        with self.lock:
            state = self.state(code)
            if state is None:
                return
            lobby = self.store.get(code)
            rnd = lobby["round"]
            hands = rnd["hands"] if rnd else {}
            every = self.store.send_every(lobby)
            targets = [
                (c, list(hands.get(pid, [])), rounds.send_quota(rnd, pid, every) if rnd else None)
                for pid, cs in self.online.get(state["code"], {}).items() for c in cs
            ]
        for c, hand, sends in targets:
            c.send({"type": "state", "lobby": state, "hand": hand, "sends": sends})

    def _online_ids(self, code: str) -> list[str]:
        return list(self.online.get(code, {}))

    def online_count(self, code: str) -> int:
        return len(self.online.get(code, {}))

    @staticmethod
    def _later(delay: float, fn, *args):
        t = threading.Timer(delay, fn, args=args)
        t.daemon = True
        t.start()

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

    # ---------- Rundentimer ----------
    def tick(self) -> list[str]:
        """Alle Lobbys mit verbundenen Spielern: fällige Timer-Takte ausführen, Änderungen senden."""
        with self.lock:
            codes = [code for code in list(self.online) if self.store.tick(code, self._online_ids(code))]
        for code in codes:
            self.broadcast(code)
        return codes

    def start_ticker(self, interval: float = TICK_INTERVAL):
        def loop():
            while True:
                time.sleep(interval)
                try:
                    self.tick()
                except Exception:  # ein Fehler darf den Takt nicht beenden
                    import logging
                    logging.getLogger(__name__).exception("Lobby-Timer")
        threading.Thread(target=loop, name="lobby-timer", daemon=True).start()

    # ---------- Aufräumen ----------
    def start_expiry(self, interval: float = EXPIRE_INTERVAL):
        def loop():
            while True:
                time.sleep(interval)
                for code in self.store.expire():
                    with self.lock:
                        self.online.pop(code, None)
        threading.Thread(target=loop, name="lobby-expiry", daemon=True).start()
