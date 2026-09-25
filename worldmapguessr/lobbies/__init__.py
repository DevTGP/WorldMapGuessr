"""Lobbys: kurze Links, Einstellungen (Spielkonfiguration, max. Spieler, Passwort), Host-Rolle,
Live-Abgleich per WebSocket. Das Mehrspieler-Verhalten im Spiel selbst folgt später."""
from .store import LobbyStore
from .hub import LobbyHub

__all__ = ["LobbyStore", "LobbyHub"]
