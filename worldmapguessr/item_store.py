"""Item-Statistik als JSON-Datei: jedes Spielteil hat eine UID und Zähler für
spawned (ins Inventar gelegt), correct und incorrect (Einsetzversuche) sowie waited/waitedCount:
Summe der Items, die die Lobby zwischen Austeilen und Einsetzen (bzw. Verlust) eingesetzt hat, und wie viele
Spawns darin stecken (Ereignis "waited" mit Anzahl, siehe lobbies/round.py)."""
from __future__ import annotations

import json
import os
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

EVENTS = ("spawned", "correct", "incorrect", "waited")
COUNTERS = ("spawned", "correct", "incorrect", "waited", "waitedCount")
SCHEMA_VERSION = 1


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class UnknownItem(KeyError):
    pass


class InvalidEvent(ValueError):
    pass


def increments(event: str, amount: int = 1) -> dict[str, int]:
    """Zähler-Änderungen eines Ereignisses; "waited" zählt amount dazu und einen Spawn in waitedCount."""
    if event not in EVENTS:
        raise InvalidEvent(event)
    if event == "waited":
        if isinstance(amount, bool) or not isinstance(amount, int) or amount < 0:
            raise InvalidEvent(f"waited: {amount!r}")
        return {"waited": amount, "waitedCount": 1}
    return {event: 1}


class ItemStore:
    """Thread-sicherer Zugriff auf die Item-Datei; jede Änderung wird atomar geschrieben."""

    def __init__(self, path: str | os.PathLike):
        self.path = Path(path)
        self._lock = threading.Lock()
        self._data = self._load()

    # ---------- Lesen ----------
    def list(self, kind: str | None = None) -> list[dict]:
        with self._lock:
            items = self._data["items"].values()
            return [dict(i) for i in items if kind is None or i["kind"] == kind]

    def get(self, uid: str) -> dict:
        with self._lock:
            return dict(self._item(uid))

    # ---------- Schreiben ----------
    def ensure(self, kind: str, code: str, name: str) -> dict:
        """Legt ein Item an, falls (kind, code) noch nicht existiert. UID bleibt dauerhaft stabil."""
        with self._lock:
            for item in self._data["items"].values():
                if item["kind"] == kind and item["code"] == code:
                    if item["name"] != name:
                        item["name"] = name
                        self._save()
                    return dict(item)
            now = _now()
            item = {
                "uid": str(uuid.uuid4()),
                "kind": kind,
                "code": code,
                "name": name,
                **{e: 0 for e in COUNTERS},
                "created": now,
                "updated": now,
            }
            self._data["items"][item["uid"]] = item
            self._save()
            return dict(item)

    def record(self, uid: str, event: str, amount: int = 1) -> dict:
        inc = increments(event, amount)
        with self._lock:
            item = self._item(uid)
            for k, v in inc.items():
                item[k] = item.get(k, 0) + v
            item["updated"] = _now()
            self._save()
            return dict(item)

    # ---------- intern ----------
    def _item(self, uid: str) -> dict:
        try:
            return self._data["items"][uid]
        except KeyError:
            raise UnknownItem(uid) from None

    def _load(self) -> dict:
        if self.path.exists():
            with self.path.open(encoding="utf-8") as f:
                data = json.load(f)
            data.setdefault("items", {})
            return data
        return {"version": SCHEMA_VERSION, "items": {}}

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=".items-", suffix=".json")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(self._data, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self.path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise


# TopoJSON-Objekt → Item-Art
def seed_items(store: ItemStore, items: list[dict]) -> None:
    """Registriert alle Items der Kartendaten (index.json: kind, id, name)."""
    for it in items:
        store.ensure(it["kind"], it["id"], it["name"])
