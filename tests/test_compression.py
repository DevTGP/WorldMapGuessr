import gzip
import os
import time

from worldmapguessr.compression import ensure_gz, send_compressed

BIG = ('{"a": ' + "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], " * 200 + '"b": 1}').encode()


def test_gzip_when_accepted_plain_otherwise(app, tmp_path):
    (tmp_path / "d.json").write_bytes(BIG)
    (tmp_path / "small.json").write_bytes(b"{}")
    (tmp_path / "img.jpg").write_bytes(b"\xff\xd8" + b"x" * 2000)
    with app.test_request_context(headers={"Accept-Encoding": "gzip, br"}):
        r = send_compressed(str(tmp_path), "d.json")
        r.direct_passthrough = False
        assert r.headers["Content-Encoding"] == "gzip" and r.mimetype == "application/json"
        assert gzip.decompress(r.get_data()) == BIG and len(r.get_data()) < len(BIG) / 3
        assert "Content-Encoding" not in send_compressed(str(tmp_path), "small.json").headers  # lohnt nicht
        assert "Content-Encoding" not in send_compressed(str(tmp_path), "img.jpg").headers     # schon komprimiert
    with app.test_request_context():
        r = send_compressed(str(tmp_path), "d.json")
        r.direct_passthrough = False
        assert "Content-Encoding" not in r.headers and r.get_data() == BIG


def test_gz_rebuilt_when_source_changes(tmp_path):
    src = tmp_path / "d.json"
    src.write_bytes(BIG)
    gz = ensure_gz(str(src))
    first = open(gz, "rb").read()
    assert ensure_gz(str(src)) == gz and open(gz, "rb").read() == first  # unverändert: nicht neu
    later = time.time() + 5
    src.write_bytes(BIG + b" ")
    os.utime(src, (later, later))
    assert gzip.decompress(open(ensure_gz(str(src)), "rb").read()) == BIG + b" "


def test_map_data_route_uses_gzip(client):
    version = client.application.extensions["map_index"]["version"]
    r = client.get(f"/data/{version}/index.json", headers={"Accept-Encoding": "gzip"})
    assert r.status_code == 200 and r.headers["Content-Encoding"] == "gzip"
    assert b'"levels"' in gzip.decompress(r.data)
    assert client.get(f"/data/{version}/../../routes.py").status_code == 404


def test_precompress_removes_stale_temp_files(tmp_path):
    from worldmapguessr.compression import precompress
    (tmp_path / "d.json").write_bytes(BIG)
    stale = tmp_path / "d.json.gz.4711.tmp"
    stale.write_bytes(b"half")
    old = time.time() - 3600
    os.utime(stale, (old, old))
    assert precompress(str(tmp_path)) == 1
    assert not stale.exists() and (tmp_path / "d.json.gz").exists()
