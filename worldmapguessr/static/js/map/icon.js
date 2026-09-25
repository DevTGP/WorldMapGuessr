// Kleine Umriss-Icons (Inventar, Menü): eigene, auf das Teil gedrehte Projektion –
// dadurch nie an der Kartenkante zerschnitten.

import { lodPath, LOD_ICON_PX2 } from "./lod.js";

/**
 * SVG-Pfad eines Features, eingepasst in w × h (viewBox "0 0 w h").
 * @param {object} feature  mit feature.geom.centerLon
 */
export function iconPath(feature, w, h, pad = 3) {
  const projection = d3.geoNaturalEarth1()
    .rotate([-feature.geom.centerLon, 0])
    .fitExtent([[pad, pad], [w - pad, h - pad]], feature);
  return lodPath(projection, LOD_ICON_PX2)(feature);
}
