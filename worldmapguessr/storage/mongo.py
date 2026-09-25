"""MongoDB-Verbindung."""
from __future__ import annotations

from pymongo import MongoClient
from pymongo.database import Database

DEFAULT_DB = "worldmapguessr"
SERVER_SELECTION_TIMEOUT_MS = 5000


def connect(uri: str, db_name: str | None = None, client_factory=MongoClient) -> Database:
    """Verbindet und prüft die Erreichbarkeit (ping). Datenbankname: Parameter, sonst aus der URI,
    sonst "worldmapguessr"."""
    client = client_factory(uri, serverSelectionTimeoutMS=SERVER_SELECTION_TIMEOUT_MS, tz_aware=True)
    client.admin.command("ping")
    if db_name:
        return client[db_name]
    try:
        return client.get_default_database()
    except Exception:  # keine Datenbank in der URI
        return client[DEFAULT_DB]


def ping(db: Database) -> bool:
    try:
        db.client.admin.command("ping")
        return True
    except Exception:
        return False
