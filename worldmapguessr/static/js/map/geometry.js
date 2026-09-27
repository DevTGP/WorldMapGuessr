// Zerlegung eines Features (Kontinent oder Staat) in Einzelteile – sphärisch berechnet, damit beim
// Einsetzen (game/held-piece.js) Teile außerhalb der Reichweite übersprungen werden können.
// Anker, Fläche und Mittel-Länge eines Items berechnet schon der Build (build/2-tiles.mjs, index.json).

/**
 * Teil für Teil (der Ladebildschirm kann zwischendurch Fortschritt zeigen): Polygone bzw. Linien mit
 * Mittelpunkt und Radius (Bogenmaß); center null = immer berücksichtigen (Pol-Polygone, riesige Teile).
 * @returns {Generator<{geometry: object, center: number[]|null, radius: number}>}
 */
export function* partsOf(geometry) {
  const { type, coordinates } = geometry;
  const items = type === "MultiPolygon" ? coordinates.map((c) => ({ type: "Polygon", coordinates: c }))
    : type === "MultiLineString" ? coordinates.map((c) => ({ type: "LineString", coordinates: c }))
    : [geometry];
  for (const g of items) yield describePart(g);
}

function describePart(g) {
  const pts = g.type === "Polygon" ? g.coordinates[0] : g.coordinates;
  const center = d3.geoCentroid(g);
  if (!Number.isFinite(center[0]) || !Number.isFinite(center[1])) return { geometry: g, center: null, radius: Math.PI };
  let radius = 0;
  for (const p of pts) radius = Math.max(radius, d3.geoDistance(center, p));
  // Polygone um einen Pol (Antarktika) oder riesige Teile: immer berücksichtigen
  return { geometry: g, center: radius > 1.5 ? null : center, radius };
}
