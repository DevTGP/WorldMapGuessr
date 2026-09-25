"""WorldMapGuessr – Flask-Anwendung."""
import mimetypes
import os

from flask import Flask
from flask_sock import Sock

from .item_store import ItemStore, seed_from_topojson
from .lobbies import LobbyHub, LobbyStore
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
    )
    if test_config:
        app.config.update(test_config)

    store = ItemStore(app.config["ITEM_STORE_PATH"])
    seed_from_topojson(store, os.path.join(app.static_folder, "data", "world.topo.json"))
    app.extensions["item_store"] = store

    lobby_store = LobbyStore(app.config["LOBBY_STORE_PATH"])
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
