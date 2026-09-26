// Kleine Umriss-Icons (Inventar, Menü): eigene, auf das Teil gedrehte Projektion –
// dadurch nie an der Kartenkante zerschnitten.
//
// Inselstaaten aus weit verstreuten Atollen (Kiribati, Tuvalu, Marshallinseln …) wären eingepasst nur
// noch Staub: Ist schon die größte Insel winzig, bekommt jede zu kleine Insel einen Punkt.

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
  // je Feature, Größe und Detailstufe nur einmal berechnen (Menü, Inventar, Lobby nutzen dieselben Icons)
  const cache = (feature._icons ??= new Map());
  const key = `${w}x${h}x${pad}@${feature.level}`;
  if (!cache.has(key)) {
    const projection = iconProjection(feature, w, h, pad);
    const path = d3.geoPath(projection);
    const extra = missingIslands(feature, path);
    const parts = extra.length ? [...feature.parts, ...extra] : feature.parts;
    cache.set(key, (path(feature) ?? "") + extra.map((p) => path(p.geometry) ?? "").join("") +
      scatteredDots(parts, projection));
  }
  return cache.get(key);
}

/** Kartenskala (Pixel je Bogenmaß), mit der das Icon gezeichnet wird – für die passende Detailstufe */
export function iconScale(feature, w, h, pad = 3) {
  return iconProjection(feature, w, h, pad).scale();
}

/**
 * Projektion des Icons: eingepasst auf die Startstufe (feature.fitGeometry), damit das Icon bei jeder
 * Detailstufe gleich groß und gleich ausgerichtet bleibt; was feinere Stufen außerhalb zeigen, wird abgeschnitten.
 */
function iconProjection(feature, w, h, pad) {
  const fits = (feature._iconFit ??= new Map());
  const key = `${w}x${h}x${pad}`;
  if (!fits.has(key)) {
    fits.set(key, d3.geoNaturalEarth1()
      .rotate([-feature.geom.centerLon, 0])
      .fitExtent([[pad, pad], [w - pad, h - pad]], feature.fitGeometry ?? feature)
      .clipExtent([[0, 0], [w, h]]));
  }
  return fits.get(key);
}

/**
 * Feinere Stufen lassen Inseln unter 1 px ihrer Skala weg (Atolle von Kiribati, Malediven …), die die
 * Startstufe noch hat. Solche Inseln der Startstufe, die in keinem Teil der aktuellen Stufe liegen, ergänzen.
 */
function missingIslands(feature, path) {
  const start = feature.fitParts;
  if (feature.level === -1 || !start?.length) return [];
  const boxes = feature.parts.map((p) => path.bounds(p.geometry)).filter(([[x0]]) => Number.isFinite(x0));
  return start.filter((p) => {
    const [x, y] = path.centroid(p.geometry);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return !boxes.some(([[x0, y0], [x1, y1]]) => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1);
  });
}

function scatteredDots(parts, projection) {
  if (!parts || parts.length < 2) return "";
  const plain = d3.geoPath(projection);
  const sized = parts.map((p) => {
    const [[x0, y0], [x1, y1]] = plain.bounds(p.geometry);
    return { p, size: Math.max(x1 - x0, y1 - y0) };
  }).filter((s) => Number.isFinite(s.size)); // ganz außerhalb des Icons (abgeschnitten)
  if (!sized.length || Math.max(...sized.map((s) => s.size)) >= SCATTERED_MAX_PX) return "";
  let d = "";
  for (const { p, size } of sized) {
    if (size >= DOT_BELOW_PX) continue;
    const [x, y] = plain.centroid(p.geometry);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    d += `M${(x - DOT_R).toFixed(1)},${y.toFixed(1)}a${DOT_R},${DOT_R} 0 1,0 ${2 * DOT_R},0a${DOT_R},${DOT_R} 0 1,0 ${-2 * DOT_R},0Z`;
  }
  return d;
}
