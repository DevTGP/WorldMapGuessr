"""JSON-API für die Item-Statistik."""
from flask import Blueprint, current_app, jsonify, request

from .difficulty import with_difficulty
from .item_store import EVENTS, InvalidEvent, UnknownItem

bp = Blueprint("api", __name__, url_prefix="/api")


def _store():
    return current_app.extensions["item_store"]


@bp.get("/health")
def health():
    """Für Docker-Healthcheck und Portainer: läuft der Server, erreicht er die Datenbank?"""
    storage = current_app.extensions["storage"]
    if storage.backend == "mongodb":
        from .storage.mongo import ping
        if not ping(storage.db):
            return jsonify(status="error", storage="mongodb", error="MongoDB nicht erreichbar"), 503
    return jsonify(status="ok", storage=storage.backend)


@bp.get("/items")
def list_items():
    """Alle Items mit Zählern und Schwierigkeit (0–10), optional gefiltert: /api/items?kind=continent"""
    return jsonify(items=[with_difficulty(i) for i in _store().list(request.args.get("kind"))])


@bp.get("/items/<uid>")
def get_item(uid):
    try:
        return jsonify(with_difficulty(_store().get(uid)))
    except UnknownItem:
        return jsonify(error="Unbekanntes Item", uid=uid), 404


@bp.post("/items/<uid>/events")
def record_event(uid):
    """Ereignis zählen. Body: {"event": "spawned" | "correct" | "incorrect"}"""
    body = request.get_json(silent=True) or {}
    try:
        return jsonify(with_difficulty(_store().record(uid, body.get("event"))))
    except UnknownItem:
        return jsonify(error="Unbekanntes Item", uid=uid), 404
    except InvalidEvent:
        return jsonify(error="Ungültiges Ereignis", allowed=list(EVENTS)), 400
