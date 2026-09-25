"""JSON-API für die Item-Statistik."""
from flask import Blueprint, current_app, jsonify, request

from .item_store import EVENTS, InvalidEvent, UnknownItem

bp = Blueprint("api", __name__, url_prefix="/api")


def _store():
    return current_app.extensions["item_store"]


@bp.get("/items")
def list_items():
    """Alle Items, optional gefiltert: /api/items?kind=continent"""
    return jsonify(items=_store().list(request.args.get("kind")))


@bp.get("/items/<uid>")
def get_item(uid):
    try:
        return jsonify(_store().get(uid))
    except UnknownItem:
        return jsonify(error="Unbekanntes Item", uid=uid), 404


@bp.post("/items/<uid>/events")
def record_event(uid):
    """Ereignis zählen. Body: {"event": "spawned" | "correct" | "incorrect"}"""
    body = request.get_json(silent=True) or {}
    try:
        return jsonify(_store().record(uid, body.get("event")))
    except UnknownItem:
        return jsonify(error="Unbekanntes Item", uid=uid), 404
    except InvalidEvent:
        return jsonify(error="Ungültiges Ereignis", allowed=list(EVENTS)), 400
