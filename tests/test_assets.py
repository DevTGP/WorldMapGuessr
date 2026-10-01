import json
import os
import time

import pytest

from worldmapguessr.assets import Assets

MANIFEST = {
    "files": {"fonts/instrument-sans-latin.woff2": "dist/instrument-sans-latin-AAAA.woff2",
              "fonts/cinzel-latin.woff2": "dist/cinzel-latin-BBBB.woff2"},
    "pages": {"game": {"js": "dist/game-CCCC.js", "css": "dist/game-DDDD.css", "modulepreload": ["dist/chunk-EEEE.js"]},
              "stats": {"js": "dist/stats-FFFF.js", "css": "dist/stats-GGGG.css", "modulepreload": []}},
    "build": "abc123",
}


@pytest.fixture()
def static(tmp_path):
    for sub in ("js", "css", "fonts", "dist"):
        (tmp_path / sub).mkdir()
    (tmp_path / "js" / "main.js").write_text("// Quelle")
    old = time.time() - 60
    os.utime(tmp_path / "js" / "main.js", (old, old))
    (tmp_path / "dist" / "manifest.json").write_text(json.dumps(MANIFEST))
    return tmp_path


def test_bundle_when_manifest_is_current(app, static):
    with app.test_request_context():
        page = Assets(str(static), "").page("game")
    assert page["js"] == "/static/dist/game-CCCC.js" and page["css"] == ["/static/dist/game-DDDD.css"]
    assert page["modulepreload"] == ["/static/dist/chunk-EEEE.js"] and page["d3"] is None
    assert page["fonts"] == ["/static/dist/instrument-sans-latin-AAAA.woff2", "/static/dist/cinzel-latin-BBBB.woff2"]


def test_sources_when_bundle_missing_stale_or_disabled(app, static):
    with app.test_request_context():
        assert Assets(str(static), "0").page("game")["js"] == "/static/js/main.js"   # abgeschaltet
        later = time.time() + 5
        os.utime(static / "js" / "main.js", (later, later))                          # Quelle neuer
        page = Assets(str(static), "").page("game")
        assert page["js"] == "/static/js/main.js" and page["d3"] and "/static/css/game.css" in page["css"]
        assert Assets(str(static), "1").page("game")["js"] == "/static/dist/game-CCCC.js"  # erzwungen
        (static / "dist" / "manifest.json").unlink()
        assert Assets(str(static), "1").page("stats")["js"] == "/static/js/stats/stats.js"


def test_service_worker_route(client):
    r = client.get("/sw.js")
    assert r.status_code == 200 and r.mimetype == "text/javascript" and b"caches" in r.data
    assert r.cache_control.no_cache
    assert b"serviceWorker: null" in client.get("/").data  # ohne Bündel kein Service Worker
