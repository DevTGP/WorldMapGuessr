"""Seiten-Routen."""
from flask import Blueprint, abort, redirect, render_template, url_for

import re

from .lobbies.codes import PATTERN, normalize

bp = Blueprint("main", __name__)


@bp.get("/")
def index():
    return render_template("index.html")


@bp.get("/stats")
def stats():
    """Statistik-Seite: Item-Zähler aus /api/items als sortierbare Tabelle."""
    return render_template("stats.html")


@bp.get("/<lobbycode:code>")
def lobby(code):
    """Lobby-Link, so kurz wie möglich: /K7Q2M (klein geschrieben → Weiterleitung)"""
    if code != code.upper():
        return redirect(url_for("main.lobby", code=code.upper()))
    return render_template("index.html", lobby_code=code)


@bp.get("/l/<code>")
def lobby_alias(code):
    """Fallback für klein geschriebene oder abgetippte Codes"""
    code = normalize(code)
    if not re.fullmatch(PATTERN, code):
        abort(404)
    return redirect(url_for("main.lobby", code=code))
