"""Komprimierte Auslieferung: Kartendaten (JSON) und statische Dateien (JS, CSS) als vorkomprimiertes gzip,
Seiten (HTML) und API-Antworten (JSON) beim Ausliefern.

Gunicorn liefert Dateien unkomprimiert aus. JSON und JS schrumpfen mit gzip auf etwa ein Drittel (Startpaket
der Karte: 419 kB → 140 kB). Neben jeder Datei liegt dafür eine .gz-Fassung; sie wird beim Docker-Build erzeugt
(`python -m worldmapguessr.precompress`), sonst beim ersten Abruf bzw. beim Start im Hintergrund, und neu gebaut,
wenn die Quelle neuer ist. Browser, die kein gzip melden, bekommen die Originaldatei. Bilder (JPEG) sind schon
komprimiert und werden direkt ausgeliefert. Dynamische Antworten (Seite mit Wörterbuch ≈ 30 kB, /api/items)
komprimiert gzip_response() nach jeder Anfrage (schnelle Stufe).
"""
from __future__ import annotations

import gzip
import mimetypes
import os
import re
import shutil
import threading
import time

from flask import request, send_file, send_from_directory
from werkzeug.exceptions import NotFound
from werkzeug.security import safe_join

COMPRESSIBLE = {".json", ".js", ".css", ".html", ".svg", ".txt"}
MIN_SIZE = 512       # kleinere Dateien lohnen den Umweg nicht
LEVEL = 9
DYNAMIC_LEVEL = 6   # für Antworten, die bei jeder Anfrage neu entstehen
DYNAMIC_TYPES = {"text/html", "application/json"}
_lock = threading.Lock()
_STALE_TMP = re.compile(r"\.gz\.\d+\.tmp$")


def _compressible(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in COMPRESSIBLE


def ensure_gz(path: str) -> str | None:
    """Pfad der aktuellen .gz-Fassung (bei Bedarf erzeugt) oder None (nicht komprimierbar/zu klein)."""
    if not _compressible(path):
        return None
    try:
        st = os.stat(path)
    except OSError:
        return None
    if st.st_size < MIN_SIZE:
        return None
    gz = path + ".gz"
    try:
        if os.stat(gz).st_mtime >= st.st_mtime:
            return gz
    except OSError:
        pass
    with _lock:
        tmp = f"{gz}.{os.getpid()}.tmp"
        try:
            with open(path, "rb") as src, open(tmp, "wb") as raw:
                # mtime=0: gleiche Quelle → gleiche Datei (reproduzierbare Builds, stabile ETags)
                with gzip.GzipFile(filename="", mode="wb", compresslevel=LEVEL, fileobj=raw, mtime=0) as out:
                    shutil.copyfileobj(src, out)
            os.replace(tmp, gz)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
    return gz


def send_compressed(directory: str, filename: str, max_age=None):
    """Datei aus directory ausliefern – gzip-komprimiert, wenn der Browser es kann und es sich lohnt."""
    path = safe_join(directory, filename)
    if path is None or not os.path.isfile(path):
        raise NotFound()
    if "gzip" in request.headers.get("Accept-Encoding", "").lower():
        gz = ensure_gz(path)
        if gz:
            mimetype = mimetypes.guess_type(path)[0] or "application/octet-stream"
            response = send_file(gz, mimetype=mimetype, max_age=max_age, conditional=True)
            response.headers["Content-Encoding"] = "gzip"
            response.headers["Vary"] = "Accept-Encoding"
            return response
    response = send_from_directory(directory, filename, max_age=max_age)
    if _compressible(path):
        response.headers["Vary"] = "Accept-Encoding"
    return response


def gzip_response(response):
    """after_request: HTML- und JSON-Antworten komprimieren, wenn der Browser gzip kann und es sich lohnt."""
    if (response.status_code != 200 or response.direct_passthrough or response.is_streamed
            or "Content-Encoding" in response.headers or response.mimetype not in DYNAMIC_TYPES
            or "gzip" not in request.headers.get("Accept-Encoding", "").lower()):
        return response
    data = response.get_data()
    if len(data) < MIN_SIZE:
        return response
    response.set_data(gzip.compress(data, compresslevel=DYNAMIC_LEVEL, mtime=0))
    response.headers["Content-Encoding"] = "gzip"
    response.vary.add("Accept-Encoding")
    return response


def precompress(root: str) -> int:
    """Alle komprimierbaren Dateien unter root vorab komprimieren. Gibt die Zahl der Dateien zurück."""
    n = 0
    for base, _dirs, files in os.walk(root):
        for name in files:
            path = os.path.join(base, name)
            if _STALE_TMP.search(name):
                _remove_stale(path)  # Rest eines abgebrochenen Laufs (Server beendet)
            elif not name.endswith(".gz") and ensure_gz(path):
                n += 1
    return n


def _remove_stale(path: str, min_age: float = 60) -> None:
    try:
        if time.time() - os.stat(path).st_mtime > min_age:
            os.remove(path)
    except OSError:
        pass


def precompress_in_background(root: str) -> threading.Thread:
    thread = threading.Thread(target=precompress, args=(root,), name="precompress", daemon=True)
    thread.start()
    return thread

