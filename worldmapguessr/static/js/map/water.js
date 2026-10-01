// Flüsse und Seen (Natural Earth 1:10m, build/3-water.py): eigene Kacheln im Raster der Landkacheln, mit
// denselben Detailstufen. Jedes Objekt hat eine Kartenskala sMin, ab der es erscheint (aus Natural Earths
// min_zoom) – beim Hineinzoomen kommen kleinere Flüsse und Seen dazu. Gezeichnet in der Wasserfarbe des
// Farbschemas über Land und Relief (map/renderer.js).

import { TileStore, tileObject } from "./tiles.js";

/** Kachel-Speicher für Flüsse und Seen oder null (Daten fehlen) */
export function createWaterStore(base, index, onLoad) {
  if (!index.water) return null;
  return new TileStore(base, index, onLoad, { dir: "water", tiles: index.water.tiles, decode: decodeWater });
}

function decodeWater(level, key, buf) {
  return tileObject(level, key, buf, (parts) => ({
    lakes: parts.groups.map((g) => ({ sMin: g.attr, rings: g.rings })),
    rivers: parts.lines.map((l) => ({ sMin: l.a, pts: l.pts })),
  }));
}

/** Strichbreite eines Flusses (px): dünn beim Erscheinen, breiter, je weiter man hineinzoomt */
export function riverWidth(sMin, s) {
  const t = Math.min(1, Math.max(0, Math.log2(s / sMin) / 3));
  const major = sMin < 400 ? 0.35 : 0; // große Ströme (schon in der Weltansicht) etwas kräftiger
  return 0.45 + major + t * 0.9;
}
