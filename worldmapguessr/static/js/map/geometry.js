// Geografische Kenngrößen eines Features (Kontinent oder Staat) – sphärisch berechnet.

const MAX_ANCHOR_LAT = 78;

/**
 * Ankerpunkt (liegt beim Halten unter dem Mauszeiger), Fläche und Mittel-Länge.
 * Alles sphärisch berechnet und damit unabhängig von Drehung und Zoom der Karte.
 * @param {GeoJSON.Feature} feature
 */
export function featureGeometry(feature) {
  const g = feature.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let largest = null;
  let largestArea = -1;
  for (const c of polys) {
    const poly = { type: "Polygon", coordinates: c };
    const a = d3.geoArea(poly);
    if (a > largestArea) { largestArea = a; largest = poly; }
  }
  // Polnahe Schwerpunkte (Antarktika) liegen auf der Kartenkante und sind schwer zu treffen
  const [lon, lat] = d3.geoCentroid(largest);
  const anchor = [lon, Math.max(-MAX_ANCHOR_LAT, Math.min(MAX_ANCHOR_LAT, lat))];
  return {
    anchor,                        // [lon, lat]
    area: d3.geoArea(feature),     // Steradiant
    centerLon: anchor[0],
  };
}

/**
 * Zerlegt ein Feature in Einzelteile (Polygone bzw. Linien) mit Mittelpunkt und Radius
 * (Bogenmaß). Damit lassen sich beim Zeichnen Teile außerhalb des Bildausschnitts überspringen.
 * @returns {{geometry: object, center: number[]|null, radius: number}[]}
 */
export function splitParts(geometry) {
  const { type, coordinates } = geometry;
  const items = type === "MultiPolygon" ? coordinates.map((c) => ({ type: "Polygon", coordinates: c }))
    : type === "MultiLineString" ? coordinates.map((c) => ({ type: "LineString", coordinates: c }))
    : [geometry];
  return items.map((g) => {
    const pts = g.type === "Polygon" ? g.coordinates[0] : g.coordinates;
    const center = d3.geoCentroid(g);
    const [[lon0], [lon1]] = d3.geoBounds(g); // lon0 > lon1: Teil liegt über ±180°
    if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) {
      return { geometry: g, center: null, radius: Math.PI, lon0: -180, lon1: 180 };
    }
    let radius = 0;
    for (const p of pts) radius = Math.max(radius, d3.geoDistance(center, p));
    // Polygone um einen Pol (Antarktika) oder riesige Teile: immer zeichnen
    return { geometry: g, center: radius > 1.5 ? null : center, radius, lon0, lon1 };
  });
}

/**
 * Berührt ein Teil den Längengrad, an dem die Karte aufgeschnitten wird?
 * @param {number} cut  Längengrad der Schnittlinie (-180…180)
 */
export function touchesCut(part, cut, eps = 0.5) {
  if (part.center === null) return true;
  const { lon0, lon1 } = part;
  const inRange = (x) => (lon0 <= lon1 ? x >= lon0 - eps && x <= lon1 + eps : x >= lon0 - eps || x <= lon1 + eps);
  return inRange(cut) || inRange(cut - 360) || inRange(cut + 360);
}
