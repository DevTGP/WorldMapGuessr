"""HTTP-API der Lobbys: anlegen, öffentliche Infos (Beitrittsdialog), eigene Lobbys fürs Hauptmenü
(Überblick, Entfernen)."""
from flask import Blueprint, current_app, jsonify, request, url_for

from .codes import normalize
from .store import LobbyError

bp = Blueprint("lobbies_api", __name__, url_prefix="/api/lobbies")


def _store():
    return current_app.extensions["lobby_store"]


@bp.post("")
def create_lobby():
    """Body: {name, config, maxPlayers, password, solo, ttl, sendEvery, handCap} → {code, url, player: {id, token, name}}
    solo: Einzelspiel (niemand kann beitreten) · ttl: Verfall nach so vielen Sekunden Untätigkeit"""
    body = request.get_json(silent=True) or {}
    lobby, player = _store().create(
        player_name=body.get("name"),
        config=body.get("config"),
        max_players=body.get("maxPlayers"),
        password=str(body.get("password") or "")[:64],
        solo=body.get("solo") is True,
        ttl=body.get("ttl"),
        send_every=body.get("sendEvery"),
        hand_cap=body.get("handCap"),
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


MINE_MAX = 50  # so viele Lobbys fragt das Hauptmenü höchstens auf einmal ab


@bp.post("/mine")
def my_lobbies():
    """Body: {lobbies: [{code, id, token}]} (was der Browser kennt) → {lobbies: [summary]} für die, die es noch
    gibt und in denen der Spieler noch ist; {gone: [code]} für die übrigen (der Browser vergisst sie)."""
    body = request.get_json(silent=True) or {}
    hub = current_app.extensions["lobby_hub"]
    found, gone = [], []
    for entry in (body.get("lobbies") or [])[:MINE_MAX]:
        if not isinstance(entry, dict):
            continue
        code = str(entry.get("code") or "")
        summary = _store().summary(code, entry.get("id"), entry.get("token"), online=hub.online_count(normalize(code)))
        if summary:
            found.append(summary)
        else:
            gone.append(code)
    return jsonify(lobbies=found, gone=gone)


@bp.delete("/<code>")
def remove_lobby(code):
    """Body: {id, token}. Host: Lobby für alle beenden; sonst: Lobby verlassen → {result: "closed"|"left"}"""
    body = request.get_json(silent=True) or {}
    result = current_app.extensions["lobby_hub"].remove(code, body.get("id"), body.get("token"))
    return jsonify(result=result)


@bp.errorhandler(LobbyError)
def lobby_error(err):
    return jsonify(error=err.message, code=err.code, params=err.params), 400
