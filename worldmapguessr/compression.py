"""Komprimierte Auslieferung: Kartendaten (JSON) und statische Dateien (JS, CSS) vorkomprimiert als Brotli und
gzip, Seiten (HTML) und API-Antworten (JSON) beim Ausliefern.

Gunicorn liefert Dateien unkomprimiert aus. JSON und JS schrumpfen mit gzip auf etwa ein Drittel (Startpaket
der Karte: 419 kB → 140 kB), mit Brotli um weitere 15–25 %. Neben jeder Datei liegen dafür eine .br- und eine
.gz-Fassung; sie werden beim Docker-Build erzeugt (`python -m worldmapguessr.precompress`), sonst beim ersten
Abruf bzw. beim Start im Hintergrund, und neu gebaut, wenn die Quelle neuer ist. Brotli bekommen Browser, die
„br“ melden (alle aktuellen über HTTPS), sonst gzip, sonst die Originaldatei. Ohne das Paket brotli entfällt
nur die .br-Fassung. Bilder (JPEG) sind schon komprimiert und werden direkt ausgeliefert. Dynamische Antworten
(Seite mit Wörterbuch ≈ 30 kB, /api/items) komprimiert gzip_response() nach jeder Anfrage (schnelle Stufe).
"""
from __future__ import annotations

import gzip
import mimetypes
import os
import re
import shutil
import threading
import time

try:
    import brotli
except ImportError:  # optional: ohne Brotli nur gzip
    brotli = None
from flask import request, send_file, send_from_directory
from werkzeug.exceptions import NotFound
from werkzeug.security import safe_join

COMPRESSIBLE = {".json", ".js", ".css", ".html", ".svg", ".txt"}
MIN_SIZE = 512       # kleinere Dateien lohnen den Umweg nicht
LEVEL = 9
DYNAMIC_LEVEL = 6   # für Antworten, die bei jeder Anfrage neu entstehen
BROTLI_LEVEL = 11
BROTLI_DYNAMIC_LEVEL = 5
DYNAMIC_TYPES = {"text/html", "application/json"}
_lock = threading.Lock()
_STALE_TMP = re.compile(r"\.(gz|br)\.\d+\.tmp$")


def _gzip_file(src, raw):
    # mtime=0: gleiche Quelle → gleiche Datei (reproduzierbare Builds, stabile ETags)
    with gzip.GzipFile(filename="", mode="wb", compresslevel=LEVEL, fileobj=raw, mtime=0) as out:
        shutil.copyfileobj(src, out)


def _brotli_file(src, raw):
    raw.write(brotli.compress(src.read(), quality=BROTLI_LEVEL))


# (Content-Encoding, Endung, Schreiber) – in der Reihenfolge der Vorliebe
ENCODINGS = [("br", ".br", _brotli_file), ("gzip", ".gz", _gzip_file)]
if brotli is None:
    ENCODINGS = ENCODINGS[1:]


def accepted_encodings() -> set[str]:
    """Kodierungen aus Accept-Encoding (ohne die mit q=0)"""
    out = set()
    for part in request.headers.get("Accept-Encoding", "").lower().split(","):
        name, _, params = part.strip().partition(";")
        if name and not re.search(r"q=0(\.0*)?\s*$", params.strip()):
            out.add(name.strip())
    return out


def _compressible(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in COMPRESSIBLE


def ensure_gz(path: str) -> str | None:
    """Pfad der aktuellen .gz-Fassung (bei Bedarf erzeugt) oder None (nicht komprimierbar/zu klein)."""
    return ensure_compressed(path, ".gz", _gzip_file)


def ensure_compressed(path: str, ext: str, write) -> str | None:
    """Pfad der aktuellen komprimierten Fassung (bei Bedarf erzeugt) oder None (nicht komprimierbar/zu klein)."""
    if not _compressible(path):
        return None
    try:
        st = os.stat(path)
    except OSError:
        return None
    if st.st_size < MIN_SIZE:
        return None
    out = path + ext
    try:
        if os.stat(out).st_mtime >= st.st_mtime:
            return out
    except OSError:
        pass
    with _lock:
        tmp = f"{out}.{os.getpid()}.tmp"
        try:
            with open(path, "rb") as src, open(tmp, "wb") as raw:
                write(src, raw)
            os.replace(tmp, out)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)
    return out


def send_compressed(directory: str, filename: str, max_age=None):
    """Datei aus directory ausliefern – Brotli- bzw. gzip-komprimiert, wenn der Browser es kann und es sich lohnt."""
    path = safe_join(directory, filename)
    if path is None or not os.path.isfile(path):
        raise NotFound()
    accepted = accepted_encodings()
    for encoding, ext, write in ENCODINGS:
        if encoding not in accepted:
            continue
        packed = ensure_compressed(path, ext, write)
        if packed:
            mimetype = mimetypes.guess_type(path)[0] or "application/octet-stream"
            response = send_file(packed, mimetype=mimetype, max_age=max_age, conditional=True)
            response.headers["Content-Encoding"] = encoding
            response.headers["Vary"] = "Accept-Encoding"
            return response
        break  # nicht komprimierbar oder zu klein – dann auch keine andere Kodierung
    response = send_from_directory(directory, filename, max_age=max_age)
    if _compressible(path):
        response.headers["Vary"] = "Accept-Encoding"
    return response


def gzip_response(response):
    """after_request: HTML- und JSON-Antworten komprimieren (Brotli bzw. gzip), wenn der Browser es kann und es
    sich lohnt."""
    if (response.status_code != 200 or response.direct_passthrough or response.is_streamed
            or "Content-Encoding" in response.headers or response.mimetype not in DYNAMIC_TYPES):
        return response
    accepted = accepted_encodings()
    encoding = "br" if brotli is not None and "br" in accepted else "gzip" if "gzip" in accepted else None
    if encoding is None:
        return response
    data = response.get_data()
    if len(data) < MIN_SIZE:
        return response
    if encoding == "br":
        response.set_data(brotli.compress(data, quality=BROTLI_DYNAMIC_LEVEL))
    else:
        response.set_data(gzip.compress(data, compresslevel=DYNAMIC_LEVEL, mtime=0))
    response.headers["Content-Encoding"] = encoding
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
            elif not name.endswith((".gz", ".br")) and _compressible(path):
                done = [ensure_compressed(path, ext, write) for _enc, ext, write in ENCODINGS]
                n += any(done)
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

