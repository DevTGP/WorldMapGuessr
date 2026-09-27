// Flüsse und Seen (Natural Earth 1:10m, build/3-water.py): eigene Kacheln im Raster der Landkacheln, mit
// denselben Detailstufen. Jedes Objekt hat eine Kartenskala sMin, ab der es erscheint (aus Natural Earths
// min_zoom) – beim Hineinzoomen kommen kleinere Flüsse und Seen dazu. Gezeichnet in der Wasserfarbe des
// Farbschemas über Land und Relief (map/renderer.js).

import { TileStore, tileDecoder } from "./tiles.js";

/** Kachel-Speicher für Flüsse und Seen oder null (Daten fehlen) */
export function createWaterStore(base, index, onLoad) {
  if (!index.water) return null;
  return new TileStore(base, index, onLoad, { dir: "water", tiles: index.water.tiles, decode: decodeWater });
}

function decodeWater(level, key, raw) {
  const { tile, pts, count } = tileDecoder(level, key);
  return {
    ...tile,
    rivers: raw.r.map(([sMin, ints]) => ({ sMin, pts: pts(ints) })),
    lakes: raw.k.map(([sMin, ...rings]) => ({ sMin, rings: rings.map(pts) })),
    get points() { return count(); },
    *all() {
      for (const r of this.rivers) yield r.pts;
      for (const l of this.lakes) yield* l.rings;
    },
  };
}

/** Strichbreite eines Flusses (px): dünn beim Erscheinen, breiter, je weiter man hineinzoomt */
export function riverWidth(sMin, s) {
  const t = Math.min(1, Math.max(0, Math.log2(s / sMin) / 3));
  const major = sMin < 400 ? 0.35 : 0; // große Ströme (schon in der Weltansicht) etwas kräftiger
  return 0.45 + major + t * 0.9;
}
