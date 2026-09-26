"""WorldMapGuessr – Flask-Anwendung."""
import mimetypes
import os

from flask import Flask
from flask_sock import Sock

from .difficulty import difficulty_map
from .item_events import ItemEventRecorder
from .item_store import seed_items
from .map_data import catalog, load_index, start_bytes
from .lobbies import LobbyHub, LobbyStore
from .storage import create_stores
from .lobbies.codes import LobbyCodeConverter

# Windows liest MIME-Typen aus der Registry; .js kommt dort teils als text/plain,
# was ES-Module im Browser blockiert.
mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        # Laufzeitdaten liegen im Flask-Instance-Ordner (WorldMapGuessr/instance/)
        ITEM_STORE_PATH=os.path.join(app.instance_path, "items.json"),
        LOBBY_STORE_PATH=os.path.join(app.instance_path, "lobbies.json"),
        LOBBY_EXPIRY_THREAD=True,
        # MongoDB: gesetzt → Daten in MongoDB, leer → JSON-Dateien (Fallback)
        MONGODB_URI=os.environ.get("MONGODB_URI", ""),
        MONGODB_DB=os.environ.get("MONGODB_DB", ""),
        # Einmalige Übernahme alter Statistik in eine leere MongoDB; None → instance/items.json
        ITEM_IMPORT_PATH=os.environ.get("WMG_ITEM_IMPORT") or None,
    )
    if test_config:
        app.config.update(test_config)

    store, lobby_persistence, storage = create_stores(app.config, app.instance_path)
    map_index = load_index(app.static_folder)
    app.extensions["map_index"] = map_index
    app.extensions["map_start_bytes"] = start_bytes(app.static_folder, map_index)
    seed_items(store, map_index["items"])
    app.extensions["item_store"] = store
    app.extensions["storage"] = storage

    # Lobby-Runden: Item-Statistik zählt der Server (Browser zählen nur im Einzelspiel)
    lobby_store = LobbyStore(lobby_persistence, catalog=catalog(map_index),
                             on_stat=ItemEventRecorder(store), difficulty=lambda: difficulty_map(store))
    lobby_hub = LobbyHub(lobby_store)
    if app.config["LOBBY_EXPIRY_THREAD"]:
        lobby_hub.start_expiry()
    app.extensions["lobby_store"] = lobby_store
    app.extensions["lobby_hub"] = lobby_hub

    app.url_map.converters["lobbycode"] = LobbyCodeConverter
    from . import api, routes
    from .lobbies import api as lobby_api, ws as lobby_ws
    app.register_blueprint(routes.bp)
    app.register_blueprint(api.bp)
    app.register_blueprint(lobby_api.bp)
    lobby_ws.register(Sock(app))
    return app
