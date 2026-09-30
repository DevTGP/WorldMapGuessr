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
    """Alle Items mit Zählern, Schwierigkeit (0–10) und Kontinent (region), optional gefiltert: /api/items?kind=continent"""
    meta = _item_meta()
    items = [with_difficulty(i) for i in _store().list(request.args.get("kind"))]
    for it in items:
        name_en, region = meta.get((it["kind"], it["code"]), (it["name"], None))
        it["nameEn"] = name_en
        it["region"] = region
    return jsonify(items=items)


def _item_meta() -> dict:
    """Englischer Name und Kontinent (Kartendaten index.json) je (kind, code) – für die Statistikseite"""
    ext = current_app.extensions
    if "item_meta" not in ext:
        ext["item_meta"] = {(it["kind"], it["id"]): (it.get("nameEn") or it["name"], it.get("region"))
                            for it in ext["map_index"]["items"]}
    return ext["item_meta"]


@bp.get("/items/<uid>")
def get_item(uid):
    try:
        return jsonify(with_difficulty(_store().get(uid)))
    except UnknownItem:
        return jsonify(error="Unbekanntes Item", uid=uid), 404


@bp.post("/items/<uid>/events")
def record_event(uid):
    """Ereignis zählen. Body: {"event": "spawned" | "correct" | "incorrect"} oder
    {"event": "waited", "value": n} (n Items der Lobby eingesetzt, bevor dieses saß bzw. verloren ging)"""
    body = request.get_json(silent=True) or {}
    try:
        return jsonify(with_difficulty(_store().record(uid, body.get("event"), body.get("value", 1))))
    except UnknownItem:
        return jsonify(error="Unbekanntes Item", uid=uid), 404
    except InvalidEvent:
        return jsonify(error="Ungültiges Ereignis", allowed=list(EVENTS)), 400
