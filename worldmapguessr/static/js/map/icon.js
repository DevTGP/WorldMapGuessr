// Kleine Umriss-Icons (Inventar, Menü): eigene, auf das Teil gedrehte Projektion –
// dadurch nie an der Kartenkante zerschnitten.
//
// Inselstaaten aus weit verstreuten Atollen (Kiribati, Tuvalu, Marshallinseln …) wären eingepasst nur
// noch Staub: Ist schon die größte Insel winzig, bekommt jede zu kleine Insel einen Punkt.

import { lodPath, LOD_ICON_PX2 } from "./lod.js";

/** Größte Insel kleiner als so viele Pixel → Streuinsel-Darstellung mit Punkten */
const SCATTERED_MAX_PX = 6;
/** Inseln unter dieser Größe werden als Punkt gezeichnet */
const DOT_BELOW_PX = 2.5;
const DOT_R = 1.4;

/**
 * SVG-Pfad eines Features, eingepasst in w × h (viewBox "0 0 w h").
 * @param {object} feature  mit feature.geom.centerLon (und feature.parts, siehe geometry.js)
 */
export function iconPath(feature, w, h, pad = 3) {
  // je Feature und Größe nur einmal berechnen (Menü, Inventar, Lobby nutzen dieselben Icons)
  const cache = (feature._icons ??= new Map());
  const key = `${w}x${h}x${pad}`;
  if (!cache.has(key)) {
    const projection = d3.geoNaturalEarth1()
      .rotate([-feature.geom.centerLon, 0])
      .fitExtent([[pad, pad], [w - pad, h - pad]], feature);
    cache.set(key, (lodPath(projection, LOD_ICON_PX2)(feature) ?? "") + scatteredDots(feature, projection));
  }
  return cache.get(key);
}

function scatteredDots(feature, projection) {
  const parts = feature.parts;
  if (!parts || parts.length < 2) return "";
  const plain = d3.geoPath(projection);
  const sized = parts.map((p) => {
    const [[x0, y0], [x1, y1]] = plain.bounds(p.geometry);
    return { p, size: Math.max(x1 - x0, y1 - y0) };
  });
  if (Math.max(...sized.map((s) => s.size)) >= SCATTERED_MAX_PX) return "";
  let d = "";
  for (const { p, size } of sized) {
    if (size >= DOT_BELOW_PX) continue;
    const [x, y] = plain.centroid(p.geometry);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    d += `M${(x - DOT_R).toFixed(1)},${y.toFixed(1)}a${DOT_R},${DOT_R} 0 1,0 ${2 * DOT_R},0a${DOT_R},${DOT_R} 0 1,0 ${-2 * DOT_R},0Z`;
  }
  return d;
}
