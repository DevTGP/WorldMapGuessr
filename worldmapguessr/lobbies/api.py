"""HTTP-API der Lobbys: anlegen und öffentliche Infos (für den Beitrittsdialog)."""
from flask import Blueprint, current_app, jsonify, request, url_for

from .store import LobbyError

bp = Blueprint("lobbies_api", __name__, url_prefix="/api/lobbies")


def _store():
    return current_app.extensions["lobby_store"]


@bp.post("")
def create_lobby():
    """Body: {name, config, maxPlayers, password, solo, ttl} → {code, url, player: {id, token, name}}
    solo: Einzelspiel (niemand kann beitreten) · ttl: Verfall nach so vielen Sekunden Untätigkeit"""
    body = request.get_json(silent=True) or {}
    lobby, player = _store().create(
        player_name=body.get("name"),
        config=body.get("config"),
        max_players=body.get("maxPlayers"),
        password=str(body.get("password") or "")[:64],
        solo=body.get("solo") is True,
        ttl=body.get("ttl"),
    )
    code = lobby["code"]
    return jsonify(code=code, url=url_for("main.lobby", code=code), player=player), 201


@bp.get("/<code>")
def lobby_info(code):
    info = _store().public_info(code)
    if not info:
        return jsonify(error="Diese Lobby gibt es nicht (mehr).", code="not_found"), 404
    hub = current_app.extensions["lobby_hub"]
    info["online"] = hub.online_count(info["code"])
    return jsonify(info)


@bp.errorhandler(LobbyError)
def lobby_error(err):
    return jsonify(error=err.message, code=err.code), 400
