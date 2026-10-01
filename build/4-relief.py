"""Schritt 4: Geländeschummerung (Relief) als Graustufen-Kacheln für den Browser.

Quelle: Natural Earth „Shaded Relief, High Res“ (SR_HR, gemeinfrei; 21600 × 10800, gleichabständig) – eine
reine Graustufen-Schummerung ohne Höhenfarben, von Natural Earths S3-Spiegel (naturalearth.s3.amazonaws.com;
naturalearthdata.com selbst ist aus der Build-Umgebung nicht erreichbar). Ebenes Gelände (und Meer) hat dort
den Grauwert FLAT; Abweichungen davon werden mit GAIN um 128 (= neutral) gelegt: heller = sonnige Hänge,
dunkler = Schattenseiten. Gilt innerhalb der Landflächen (tmp/pieces.geojson aus Schritt 1).

Meeresboden: Natural Earth „Gray Earth with Shaded Relief and Ocean Bottom“ (GRAY_HR_SR_OB, gemeinfrei, gleiches
Raster). Dort steckt im Meer neben der Schummerung eine Tiefenfärbung (tiefer = dunkler); ein Hochpass (Grauwert
minus weichgezeichnete Umgebung, nur über Meerespixel gemittelt) lässt nur die Schummerung übrig, die mit
OCEAN_GAIN um 128 gelegt wird. Der Browser legt das Bild mit „hard-light“ bzw. „soft-light“ über Land- und
Meeresfarben.

Ausgabe: static/data/map/relief/r{r}/{x}_{y}.jpg – Stufe r hat 2^(r+1) × 2^r Kacheln à 512 px (r0: 1024 px Welt
… r3: 8192 px). Rein neutrale Kacheln fehlen. index.json bekommt "relief" und eine neue Version.
"""
import hashlib
import io
import json
import os
import shutil
import urllib.request
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC_URL = "https://naturalearth.s3.amazonaws.com/10m_raster/SR_HR.zip"
SRC = "tmp/src/SR_HR/SR_HR.tif"
OCEAN_URL = "https://naturalearth.s3.amazonaws.com/10m_raster/GRAY_HR_SR_OB.zip"
OCEAN_SRC = "tmp/src/GRAY_HR_SR_OB/GRAY_HR_SR_OB.tif"
OUT = "../worldmapguessr/static/data/map"
TILE = 512
LEVELS = 4          # r0 … r3
FLAT = 206          # Grauwert der Quelle für ebenes Gelände
GAIN = 1.5          # Kontrast der Schummerung
EDGE_PX = 1         # Küstensaum: Maske so viele Pixel schrumpfen und weich auslaufen lassen
QUALITY = 80
OCEAN_GAIN = 6      # Kontrast der Meeresboden-Schummerung (schwächer als an Land)
OCEAN_SIGMA = 10    # Hochpass: Radius der Umgebung (Pixel bei halber Quellauflösung, ≈ 37 km)


def fetch(url, path):
    if not os.path.exists(path):
        os.makedirs("tmp/src", exist_ok=True)
        name = os.path.splitext(os.path.basename(url))[0]
        print("lade", url)
        urllib.request.urlretrieve(url, f"tmp/src/{name}.zip")
        with zipfile.ZipFile(f"tmp/src/{name}.zip") as zf:
            zf.extractall(f"tmp/src/{name}")
    Image.MAX_IMAGE_PIXELS = None
    return Image.open(path).convert("L")


def source():
    return fetch(SRC_URL, SRC)


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


def ocean_shading(m, size):
    """Schummerung des Meeresbodens (um 0) in voller Auflösung; m = Landmaske (0 … 1)"""
    w, h = size
    half = (w // 2, h // 2)
    g = np.asarray(fetch(OCEAN_URL, OCEAN_SRC).resize(half, Image.BOX)).astype(np.float32)
    sea = np.asarray(Image.fromarray(((m < 0.5) * 255).astype(np.uint8)).resize(half, Image.BOX)) > 250
    sea = ndimage.binary_erosion(sea, iterations=EDGE_PX).astype(np.float32)
    around = ndimage.gaussian_filter(g * sea, OCEAN_SIGMA) / np.maximum(ndimage.gaussian_filter(sea, OCEAN_SIGMA), 1e-3)
    detail = (g - around) * np.clip(ndimage.gaussian_filter(sea, 1.0) * 1.5, 0, 1)
    return np.asarray(Image.fromarray(detail, "F").resize(size, Image.BILINEAR))


def shading(img):
    a = np.asarray(img).astype(np.float32)
    m = land_mask(*img.size)
    inner = ndimage.binary_erosion(m > 0.5, iterations=EDGE_PX).astype(np.float32)
    weight = np.clip(ndimage.gaussian_filter(inner, 1.0) * 1.5, 0, 1)
    shade = 128 + (a - FLAT) * GAIN * weight
    del a, inner
    shade += ocean_shading(m, img.size) * OCEAN_GAIN
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
