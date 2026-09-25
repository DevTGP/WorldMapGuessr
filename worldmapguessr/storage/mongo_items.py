"""Item-Statistik in MongoDB (Collection "items"). Gleiche Schnittstelle wie item_store.ItemStore.

Dokument: {_id: uid, uid, kind, code, name, spawned, correct, incorrect, created, updated}
Zähler werden atomar mit $inc erhöht – sicher auch bei mehreren Server-Prozessen.
"""
from __future__ import annotations

import uuid

from pymongo import ASCENDING, ReturnDocument
from pymongo.collection import Collection
from pymongo.errors import DuplicateKeyError

from ..item_store import EVENTS, InvalidEvent, UnknownItem, _now

NO_ID = {"_id": 0}


class MongoItemStore:
    def __init__(self, collection: Collection):
        self.col = collection
        self.col.create_index([("kind", ASCENDING), ("code", ASCENDING)], unique=True, name="kind_code")

    # ---------- Lesen ----------
    def list(self, kind: str | None = None) -> list[dict]:
        query = {"kind": kind} if kind else {}
        return list(self.col.find(query, NO_ID).sort([("kind", ASCENDING), ("code", ASCENDING)]))

    def get(self, uid: str) -> dict:
        doc = self.col.find_one({"_id": uid}, NO_ID)
        if doc is None:
            raise UnknownItem(uid)
        return doc

    # ---------- Schreiben ----------
    def ensure(self, kind: str, code: str, name: str) -> dict:
        """Legt ein Item an, falls (kind, code) noch nicht existiert; aktualisiert sonst nur den Namen."""
        for _ in range(2):  # bei gleichzeitigem Anlegen gewinnt einer, der andere liest danach
            uid = str(uuid.uuid4())
            now = _now()
            try:
                return self.col.find_one_and_update(
                    {"kind": kind, "code": code},
                    {
                        "$set": {"name": name},
                        "$setOnInsert": {
                            "_id": uid, "uid": uid, "kind": kind, "code": code,
                            **{e: 0 for e in EVENTS}, "created": now, "updated": now,
                        },
                    },
                    upsert=True, projection=NO_ID, return_document=ReturnDocument.AFTER,
                )
            except DuplicateKeyError:
                continue
        return self.col.find_one({"kind": kind, "code": code}, NO_ID)

    def record(self, uid: str, event: str) -> dict:
        if event not in EVENTS:
            raise InvalidEvent(event)
        doc = self.col.find_one_and_update(
            {"_id": uid},
            {"$inc": {event: 1}, "$set": {"updated": _now()}},
            projection=NO_ID, return_document=ReturnDocument.AFTER,
        )
        if doc is None:
            raise UnknownItem(uid)
        return doc

    # ---------- Übernahme aus items.json ----------
    def is_empty(self) -> bool:
        return self.col.estimated_document_count() == 0 and self.col.find_one({}) is None

    def import_json(self, data: dict) -> dict:
        """Items aus einer items.json übernehmen – mit ihren UIDs. Mehrfach ausführbar:
        schon übernommene UIDs werden übersprungen. Gibt es (kind, code) bereits unter anderer UID,
        werden deren Zähler addiert und der doppelte Eintrag entfernt."""
        stats = {"imported": 0, "skipped": 0, "merged": 0}
        for item in (data.get("items") or {}).values():
            uid = item["uid"]
            if self.col.find_one({"_id": uid}, {"_id": 1}):
                stats["skipped"] += 1
                continue
            doc = {k: item.get(k) for k in ("uid", "kind", "code", "name", "created", "updated")}
            doc.update({e: int(item.get(e, 0)) for e in EVENTS})
            other = self.col.find_one({"kind": item["kind"], "code": item["code"]})
            if other:
                for e in EVENTS:
                    doc[e] += int(other.get(e, 0))
                self.col.delete_one({"_id": other["_id"]})
                stats["merged"] += 1
            self.col.insert_one({"_id": uid, **doc})
            stats["imported"] += 1
        return stats
