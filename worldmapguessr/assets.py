"""JS, CSS und Schriften der Seiten: gebündelt oder einzeln.

- **Gebündelt** (static/dist/, erzeugt von web/build.mjs, im Docker-Build automatisch): je Seite eine JS- und
  eine CSS-Datei mit Inhalts-Hash im Namen, d3 nur mit den genutzten Funktionen. Der Server liefert dist/ mit
  „immutable“ aus (ein Jahr), die Seite lädt die geteilten Teile per modulepreload gleich mit.
- **Einzeln** (ohne Build, z. B. lokal in PyCharm): die Quelldateien aus pages.json, d3 vom CDN.

Gebündelt wird, wenn static/dist/manifest.json existiert und nicht älter ist als die Quellen (sonst wäre nach
einer Änderung am JS noch das alte Bündel zu sehen). WMG_BUNDLE=1 erzwingt das Bündel, WMG_BUNDLE=0 die
Quelldateien.
"""
from __future__ import annotations

import json
import os

from flask import current_app, url_for

PAGES_FILE = os.path.join(os.path.dirname(__file__), "pages.json")
DIST = "dist"
D3_CDN = "https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"
SOURCE_DIRS = ("js", "css", "fonts")


class Assets:
    def __init__(self, static_folder: str, mode: str | None = None):
        self.static = static_folder
        self.mode = mode if mode is not None else os.environ.get("WMG_BUNDLE", "")
        with open(PAGES_FILE, encoding="utf-8") as fh:
            self.pages = {k: v for k, v in json.load(fh).items() if not k.startswith("_")}
        self._manifest: dict | None = None
        self._manifest_mtime = 0.0

    @property
    def manifest_path(self) -> str:
        return os.path.join(self.static, DIST, "manifest.json")

    def manifest(self) -> dict | None:
        """Manifest des Bündels oder None (kein Bündel, abgeschaltet oder älter als die Quellen)."""
        if self.mode == "0":
            return None
        try:
            mtime = os.stat(self.manifest_path).st_mtime
        except OSError:
            return None
        if self.mode != "1" and self._newest_source() > mtime:
            return None
        if mtime != self._manifest_mtime:
            with open(self.manifest_path, encoding="utf-8") as fh:
                self._manifest = json.load(fh)
            self._manifest_mtime = mtime
        return self._manifest

    def _newest_source(self) -> float:
        newest = 0.0
        for sub in SOURCE_DIRS:
            for base, _dirs, files in os.walk(os.path.join(self.static, sub)):
                for name in files:
                    if name.endswith((".js", ".css", ".woff2")):
                        newest = max(newest, os.stat(os.path.join(base, name)).st_mtime)
        return newest

    @property
    def build(self) -> str | None:
        """Kennung des Bündels (für den Service Worker) oder None"""
        m = self.manifest()
        return m["build"] if m else None

    def page(self, name: str) -> dict:
        """URLs für eine Seite: css (Liste), js, modulepreload (Liste), fonts (Vorladen), d3 (CDN-URL oder None),
        workers ({Name: URL})."""
        page = self.pages[name]
        m = self.manifest()
        static = lambda path: url_for("static", filename=path)  # noqa: E731
        if m:
            built = m["pages"][name]
            return {
                "css": [static(built["css"])],
                "js": static(built["js"]),
                "modulepreload": [static(p) for p in built["modulepreload"]],
                "fonts": [static(m["files"].get(f, f)) for f in page.get("preloadFonts", [])],
                "d3": None,
                "workers": {k: static(v) for k, v in built.get("workers", {}).items()},
            }
        return {
            "css": [static(p) for p in page["css"]],
            "js": static(page["js"]),
            "modulepreload": [],
            "fonts": [static(f) for f in page.get("preloadFonts", [])],
            "d3": D3_CDN if name == "game" else None,
            "workers": {k: static(v) for k, v in page.get("workers", {}).items()},
        }


def page_assets(name: str) -> dict:
    """Für Vorlagen: page_assets("game")"""
    return current_app.extensions["assets"].page(name)
