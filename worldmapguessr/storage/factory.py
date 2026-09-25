"""Wählt das Speicher-Backend anhand der Konfiguration.

MONGODB_URI gesetzt  → MongoDB (Items: Collection "items", Lobbys: Collection "lobbies")
MONGODB_URI leer     → JSON-Dateien im instance-Ordner (Fallback für Offline-Entwicklung und Tests)
"""
from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass

from ..item_store import ItemStore
from ..lobbies.persistence import JsonLobbyPersistence, MongoLobbyPersistence

log = logging.getLogger(__name__)


@dataclass
class StorageInfo:
    backend: str            # "mongodb" | "json"
    db: object = None       # pymongo Database, falls MongoDB


def create_stores(config: dict, instance_path: str):
    """Gibt (item_store, lobby_persistence, StorageInfo) zurück."""
    uri = config.get("MONGODB_URI")
    if not uri:
        log.info("Speicher: JSON-Dateien in %s", instance_path)
        return (
            ItemStore(config["ITEM_STORE_PATH"]),
            JsonLobbyPersistence(config["LOBBY_STORE_PATH"]),
            StorageInfo("json"),
        )

    from pymongo import MongoClient

    from .mongo import connect
    from .mongo_items import MongoItemStore

    db = connect(uri, config.get("MONGODB_DB"), config.get("MONGODB_CLIENT_FACTORY") or MongoClient)
    log.info("Speicher: MongoDB, Datenbank %s", db.name)
    items = MongoItemStore(db["items"])

    # Einmalige Übernahme der alten JSON-Statistik (standardmäßig instance/items.json),
    # solange die Collection noch leer ist. Die Datei bleibt als Sicherung liegen.
    import_path = config.get("ITEM_IMPORT_PATH")
    if import_path is None:
        import_path = config["ITEM_STORE_PATH"]
    if import_path and os.path.exists(import_path) and items.is_empty():
        with open(import_path, encoding="utf-8") as f:
            stats = items.import_json(json.load(f))
        log.info("items.json übernommen: %s", stats)

    return items, MongoLobbyPersistence(db["lobbies"]), StorageInfo("mongodb", db)
