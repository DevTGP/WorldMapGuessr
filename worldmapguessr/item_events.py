"""Item-Statistik aus Lobby-Runden: Feature-Key ("country:DEU") → Zähler im Item-Store.

In Lobbys zählt nur der Server (siehe lobbies/round.py): spawned beim Austeilen aus dem Vorrat,
correct/incorrect bei jedem angenommenen Einsetzversuch. Fehler beim Schreiben der Statistik
dürfen das Spiel nie stören – sie werden nur protokolliert."""
from __future__ import annotations

import logging
import threading

log = logging.getLogger(__name__)


class ItemEventRecorder:
    def __init__(self, store):
        self.store = store
        self.lock = threading.Lock()
        self.uids: dict[str, str] = {}
        self._refresh()

    def _refresh(self):
        self.uids = {f"{i['kind']}:{i['code']}": i["uid"] for i in self.store.list()}

    def __call__(self, key: str, event: str) -> None:
        try:
            with self.lock:
                uid = self.uids.get(key)
                if uid is None:  # z. B. nach neuen Kartendaten: einmal neu einlesen
                    self._refresh()
                    uid = self.uids.get(key)
            if uid is None:
                log.warning("Item-Statistik: unbekanntes Item %s", key)
                return
            self.store.record(uid, event)
        except Exception:  # noqa: BLE001 – Statistik ist Nebensache
            log.exception("Item-Statistik: %s %s konnte nicht gezählt werden", key, event)
