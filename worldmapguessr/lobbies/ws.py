"""WebSocket-Endpunkt einer Lobby: /ws/lobby/<code>

Protokoll (JSON):
  Client → Server  join {playerId?, token?, name, password?} · settings {settings} · start · rename {name} · ping
  Server → Client  welcome {player} · state {lobby} · error {code, message} · pong
"""
import json

from flask import current_app
from simple_websocket import ConnectionClosed

from .hub import Connection
from .store import LobbyError

JOIN_TIMEOUT = 15  # s bis zur join-Nachricht


def register(sock):
    @sock.route("/ws/lobby/<code>")
    def lobby_socket(ws, code):
        hub = current_app.extensions["lobby_hub"]
        conn = Connection(ws)
        try:
            raw = ws.receive(timeout=JOIN_TIMEOUT)
            if raw is None:
                return
            try:
                hub.join(code, conn, json.loads(raw))
            except LobbyError as err:
                conn.send({"type": "error", "code": err.code, "message": err.message, "fatal": True})
                # Der Client schließt selbst; bis dahin warten (sauberer als ein Abbruch vom Server)
                while ws.receive(timeout=5) is not None:
                    pass
                return
            code = hub.store.get(code)["code"]
            while True:
                raw = ws.receive()
                if raw is None:
                    break
                try:
                    hub.handle(code, conn, json.loads(raw))
                except LobbyError as err:
                    conn.send({"type": "error", "code": err.code, "message": err.message})
                except (ValueError, TypeError):
                    conn.send({"type": "error", "code": "protocol", "message": "Ungültige Nachricht."})
        except ConnectionClosed:
            pass
        finally:
            if conn.player_id:
                hub.leave(code.upper(), conn)
