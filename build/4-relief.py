"""Schritt 4: Geländeschummerung (Relief) als Graustufen-Kacheln für den Browser.

Quelle: Natural Earth „Shaded Relief“ (gemeinfrei) in der Fassung aus dem PyPI-Paket basemap-data
(shadedrelief.jpg, 10800 × 5400, gleichabständig; Farbverlauf nach Höhe mit Schummerung). Die
naturalearthdata.com-Downloads sind hier nicht erreichbar, PyPI schon.

Aus dem Bild wird nur die Schummerung gewonnen: Helligkeit geteilt durch ihr weichgezeichnetes Mittel (nur über
Land gemittelt) – der großräumige Farbverlauf fällt weg, Hänge und Täler bleiben. 128 = neutral, heller =
sonnige Hänge, dunkler = Schattenseiten. Meer und alles außerhalb der Landflächen (tmp/pieces.geojson aus
Schritt 1) ist neutral; der Browser legt das Bild mit „hard-light“ über die Landfarben.

Ausgabe: static/data/map/relief/r{r}/{x}_{y}.jpg – Stufe r hat 2^(r+1) × 2^r Kacheln à 512 px (r0: 1024 px Welt
… r3: 8192 px). Rein neutrale Kacheln (Meer) fehlen. index.json bekommt "relief" und eine neue Version.
"""
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC = "tmp/src/shadedrelief.jpg"
WHEEL = "basemap_data-2.0.0-py3-none-any.whl"
OUT = "../worldmapguessr/static/data/map"
TILE = 512
LEVELS = 4          # r0 … r3
SIGMA = 6           # Weichzeichner in Quellpixeln (≈ 0,2°): größere Formen gelten als Farbverlauf
GAIN = 2.5          # Kontrast der Schummerung
EDGE_PX = 2         # Küstensaum der Quelle (heller Schein) ausblenden
QUALITY = 80


def source():
    if not os.path.exists(SRC):
        os.makedirs("tmp/src", exist_ok=True)
        print("Lade basemap-data (PyPI) …")
        subprocess.run([sys.executable, "-m", "pip", "download", "basemap-data==2.0.0", "--no-deps", "-d", "tmp/src"],
                       check=True)
        with zipfile.ZipFile(f"tmp/src/{WHEEL}") as zf, open(SRC, "wb") as fh:
            fh.write(zf.read("mpl_toolkits/basemap_data/shadedrelief.jpg"))
    Image.MAX_IMAGE_PIXELS = None
    return Image.open(SRC).convert("RGB")


def land_mask(w, h):
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    with open("tmp/pieces.geojson", encoding="utf-8") as fh:
        features = json.load(fh)["features"]
    px = lambda ring: [((lon + 180) / 360 * w, (90 - lat) / 180 * h) for lon, lat in ring]
    for f in features:
        g = f["geometry"]
        for poly in [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]:
            draw.polygon(px(poly[0]), fill=255)
            for hole in poly[1:]:
                draw.polygon(px(hole), fill=0)
    return np.asarray(mask).astype(np.float32) / 255


def shading(img):
    a = np.asarray(img).astype(np.float32)
    lum = 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]
    m = land_mask(*img.size)
    mean = ndimage.gaussian_filter(lum * m, SIGMA) / np.maximum(ndimage.gaussian_filter(m, SIGMA), 1e-3)
    ratio = lum / np.maximum(mean, 1)
    # Küste: Maske schrumpfen und weich auslaufen lassen (die Quelle hat dort einen hellen Schein)
    inner = ndimage.binary_erosion(m > 0.5, iterations=EDGE_PX).astype(np.float32)
    weight = np.clip(ndimage.gaussian_filter(inner, 1.0) * 1.5, 0, 1)
    shade = 128 + (ratio - 1) * 128 * GAIN * weight
    return Image.fromarray(np.clip(shade, 0, 255).astype(np.uint8), "L")


def main():
    img = source()
    print(f"Quelle {img.size[0]} × {img.size[1]}")
    shade = shading(img)
    shutil.rmtree(f"{OUT}/relief", ignore_errors=True)
    digest, total, levels = hashlib.sha1(), 0, []
    for r in range(LEVELS):
        cols, rows = 2 ** (r + 1), 2 ** r
        level = shade.resize((cols * TILE, rows * TILE), Image.LANCZOS)
        os.makedirs(f"{OUT}/relief/r{r}", exist_ok=True)
        keys = []
        for x in range(cols):
            for y in range(rows):
                # y zählt wie bei den Landkacheln von Süden (y = 0: 90° S … )
                tile = level.crop((x * TILE, (rows - 1 - y) * TILE, (x + 1) * TILE, (rows - y) * TILE))
                arr = np.asarray(tile)
                if np.abs(arr.astype(np.int16) - 128).max() <= 2:
                    continue
                buf = io.BytesIO()
                tile.save(buf, "JPEG", quality=QUALITY, optimize=True)
                data = buf.getvalue()
                with open(f"{OUT}/relief/r{r}/{x}_{y}.jpg", "wb") as fh:
                    fh.write(data)
                digest.update(data)
                total += len(data)
                keys.append(f"{x}_{y}")
        levels.append({"r": r, "cols": cols, "rows": rows, "tiles": keys})
        print(f"Relief r{r}: {len(keys)} / {cols * rows} Kacheln")

    with open(f"{OUT}/index.json", encoding="utf-8") as fh:
        index = json.load(fh)
    index["relief"] = {"tile": TILE, "levels": levels}
    versions = index.setdefault("versions", {"tiles": index["version"]})
    versions["relief"] = digest.hexdigest()[:10]
    index["version"] = hashlib.sha1(json.dumps(versions, sort_keys=True).encode()).hexdigest()[:10]
    with open(f"{OUT}/index.json", "w", encoding="utf-8") as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(",", ":"))
    print(f"Relief: {round(total / 1024)} kB, Version {index['version']}")


if __name__ == "__main__":
    main()
