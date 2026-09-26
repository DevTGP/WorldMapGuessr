"""Seiten-Routen."""
import re

from flask import Blueprint, abort, current_app, redirect, render_template, request, send_from_directory, url_for

from .lobbies.codes import PATTERN, normalize
from .map_data import CACHE_SECONDS, map_dir

bp = Blueprint("main", __name__)


def _game_page(**kwargs):
    """Spielseite mit Kartendaten-URL (inkl. Version) und Startgröße für den Ladebalken."""
    version = current_app.extensions["map_index"]["version"]
    return render_template("index.html", map_base=f"{request.script_root}/data/{version}",
                           data_size=current_app.extensions["map_start_bytes"], **kwargs)


@bp.get("/")
def index():
    return _game_page()


@bp.get("/data/<version>/<path:filename>")
def map_data(version, filename):
    """Kartendaten (Kacheln, Items, Index). Die Version im Pfad ändert sich mit jedem Build, daher darf
    der Browser alles ein Jahr lang zwischenspeichern."""
    return send_from_directory(map_dir(current_app.static_folder), filename, max_age=CACHE_SECONDS)


@bp.get("/stats")
def stats():
    """Statistik-Seite: Item-Zähler aus /api/items als sortierbare Tabelle."""
    return render_template("stats.html")


@bp.get("/<lobbycode:code>")
def lobby(code):
    """Lobby-Link, so kurz wie möglich: /K7Q2M (klein geschrieben → Weiterleitung)"""
    if code != code.upper():
        return redirect(url_for("main.lobby", code=code.upper()))
    return _game_page(lobby_code=code)


@bp.get("/l/<code>")
def lobby_alias(code):
    """Fallback für klein geschriebene oder abgetippte Codes"""
    code = normalize(code)
    if not re.fullmatch(PATTERN, code):
        abort(404)
    return redirect(url_for("main.lobby", code=code))
