import uuid

import mongomock
import pytest

from worldmapguessr import create_app


@pytest.fixture(params=["json", "mongodb"])
def app(request, tmp_path):
    """Jeder API-Test läuft zweimal: mit JSON-Dateien und mit MongoDB (mongomock)."""
    config = {
        "TESTING": True,
        "ITEM_STORE_PATH": str(tmp_path / "items.json"),
        "LOBBY_STORE_PATH": str(tmp_path / "lobbies.json"),
        "LOBBY_EXPIRY_THREAD": False,
        "ITEM_IMPORT_PATH": "",
        "MONGODB_URI": "",
    }
    if request.param == "mongodb":
        config.update(
            MONGODB_URI="mongodb://test.invalid:27017",
            MONGODB_DB=f"wmg_{uuid.uuid4().hex[:8]}",
            MONGODB_CLIENT_FACTORY=mongomock.MongoClient,
        )
    return create_app(config)


@pytest.fixture()
def client(app):
    return app.test_client()
