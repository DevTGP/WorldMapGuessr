"""Seiten-Routen."""
import os
import re

from flask import Blueprint, abort, current_app, redirect, render_template, url_for

from .lobbies.codes import PATTERN, normalize

bp = Blueprint("main", __name__)


def _data_size() -> int:
    """Unkomprimierte Größe der Kartendaten – für einen genauen Download-Fortschritt im Browser."""
    try:
        return os.path.getsize(os.path.join(current_app.static_folder, "data", "world.topo.json"))
    except OSError:
        return 0


@bp.get("/")
def index():
    return render_template("index.html", data_size=_data_size())


@bp.get("/stats")
def stats():
    """Statistik-Seite: Item-Zähler aus /api/items als sortierbare Tabelle."""
    return render_template("stats.html")


@bp.get("/<lobbycode:code>")
def lobby(code):
    """Lobby-Link, so kurz wie möglich: /K7Q2M (klein geschrieben → Weiterleitung)"""
    if code != code.upper():
        return redirect(url_for("main.lobby", code=code.upper()))
    return render_template("index.html", lobby_code=code, data_size=_data_size())


@bp.get("/l/<code>")
def lobby_alias(code):
    """Fallback für klein geschriebene oder abgetippte Codes"""
    code = normalize(code)
    if not re.fullmatch(PATTERN, code):
        abort(404)
    return redirect(url_for("main.lobby", code=code))
