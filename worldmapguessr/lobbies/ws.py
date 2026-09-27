"""WebSocket-Endpunkt einer Lobby: /ws/lobby/<code>

Protokoll (JSON):
  Client → Server  join {playerId?, token?, name, password?} · settings {settings} · start · rename {name}
                   · place {key, correct} (Einsetzversuch eines Teils aus dem eigenen Inventar)
                   · give {key, to} (Teil an einen Online-Mitspieler senden, wenn settings.allowSend;
                     Sendelimit settings.sendEvery) · chat {text} (Nachricht an alle, max. 200 Zeichen)
                   · pause {paused} (nur Einzelspiel/Solo-Lobby: Rundentimer anhalten, z. B. Menü offen)
                   · leave (Lobby verlassen) · close (nur Host: Lobby beenden)
                   · kick {player} (nur Host: Spieler entfernen) · ping
  Server → Client  welcome {player} · state {lobby, hand, sends} · error {code, message, params?, fatal?} · left
                   · closed {message}
                   · kicked (vom Host entfernt)
                   · pong
  lobby.round: öffentliche Rundenansicht (round.public_view: log der letzten Ereignisse, timer), lobby.chat:
  letzte Chat-Nachrichten, hand: eigenes Inventar (Feature-Keys), sends: eigenes Sendelimit (round.send_quota)
"""
import json
import socket

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
        dev_sock = _dev_socket(ws)
        try:
            raw = ws.receive(timeout=JOIN_TIMEOUT)
            if raw is None:
                return
            try:
                hub.join(code, conn, json.loads(raw))
            except LobbyError as err:
                conn.send({"type": "error", **err.payload(), "fatal": True})
                _wait_for_close(ws)
                return
            code = hub.store.get(code)["code"]
            while True:
                raw = ws.receive()
                if raw is None:
                    break
                try:
                    hub.handle(code, conn, json.loads(raw))
                    if conn.player_id is None:  # verlassen oder Lobby beendet
                        _wait_for_close(ws)
                        break
                except LobbyError as err:
                    conn.send({"type": "error", **err.payload()})
                except (ValueError, TypeError):
                    conn.send({"type": "error", "code": "protocol", "message": "Ungültige Nachricht."})
        except ConnectionClosed:
            pass
        finally:
            if conn.player_id:
                hub.leave(code.upper(), conn)
            _finish_close(ws, dev_sock)


def _dev_socket(ws):
    """Nur Entwicklungsserver (Werkzeug): eigene Kopie des Sockets, um ihn am Ende sauber zu schließen."""
    if getattr(ws, "mode", None) != "werkzeug":
        return None
    try:
        return socket.fromfd(ws.sock.fileno(), socket.AF_INET, socket.SOCK_STREAM)
    except OSError:
        return None


def _finish_close(ws, dev_sock=None):
    """Nach dem Schluss-Handshake: Werkzeug (Entwicklungsserver) schreibt nach dem Ende der WebSocket-Route noch
    eine HTTP-Antwort auf dieselbe Verbindung – kommt sie beim Browser an, meldet er „Invalid frame header“. Daher
    warten, bis simple-websocket seine Antwort auf das Schluss-Signal gesendet hat, und die Verbindung dann
    selbst beenden. Gunicorn (Produktion) schreibt nichts nach – dort ist nichts zu tun."""
    if dev_sock is None:
        return
    thread = getattr(ws, "thread", None)
    if thread is not None:
        thread.join(timeout=2)
    try:
        dev_sock.shutdown(socket.SHUT_RDWR)
    except OSError:
        pass
    dev_sock.close()


def _wait_for_close(ws):
    """Der Client schließt selbst; bis dahin warten (sauberer als ein Abbruch vom Server)."""
    try:
        while ws.receive(timeout=5) is not None:
            pass
    except ConnectionClosed:
        pass
