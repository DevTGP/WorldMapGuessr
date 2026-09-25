import pytest

from worldmapguessr import create_app


@pytest.fixture()
def app(tmp_path):
    return create_app({
        "TESTING": True,
        "ITEM_STORE_PATH": str(tmp_path / "items.json"),
        "LOBBY_STORE_PATH": str(tmp_path / "lobbies.json"),
        "LOBBY_EXPIRY_THREAD": False,
    })


@pytest.fixture()
def client(app):
    return app.test_client()
