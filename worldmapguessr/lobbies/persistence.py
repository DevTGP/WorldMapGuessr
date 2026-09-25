"""Wohin Lobbys geschrieben werden. LobbyStore hält alle Lobbys im Speicher (ein Server-Prozess)
und schreibt jede Änderung sofort durch – als JSON-Datei oder in MongoDB."""
from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path


class JsonLobbyPersistence:
    """Alle Lobbys in einer Datei (instance/lobbies.json), atomar ersetzt."""

    def __init__(self, path: str | os.PathLike):
        self.path = Path(path)
        self._all: dict[str, dict] = {}

    def load_all(self) -> dict[str, dict]:
        if self.path.exists():
            with self.path.open(encoding="utf-8") as f:
                self._all = json.load(f).get("lobbies", {})
        return self._all

    def save(self, lobby: dict):
        self._all[lobby["code"]] = lobby
        self._write()

    def delete(self, code: str):
        self._all.pop(code, None)
        self._write()

    def _write(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=".lobbies-", suffix=".json")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump({"version": 1, "lobbies": self._all}, f, ensure_ascii=False, indent=2)
            os.replace(tmp, self.path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise


class MongoLobbyPersistence:
    """Eine Lobby = ein Dokument in der Collection "lobbies" (_id = Lobby-Code)."""

    def __init__(self, collection):
        self.col = collection

    def load_all(self) -> dict[str, dict]:
        lobbies = {}
        for doc in self.col.find({}):
            doc.pop("_id", None)
            lobbies[doc["code"]] = doc
        return lobbies

    def save(self, lobby: dict):
        self.col.replace_one({"_id": lobby["code"]}, {"_id": lobby["code"], **lobby}, upsert=True)

    def delete(self, code: str):
        self.col.delete_one({"_id": code})
