// Level of Detail: Punkte nach ihrer Wichtigkeit (sphärische Dreiecksfläche aus
// topojson.presimplify) filtern, bevor sie projiziert werden. So bleibt das Neuzeichnen
// beim Drehen und Zoomen flüssig, ohne dass Küsten sichtbar gröber werden.

/** Mindest-Dreiecksfläche in Bildschirmpixeln², damit ein Punkt gezeichnet wird */
export const LOD_IDLE_PX2 = 0.4;
export const LOD_MOVING_PX2 = 2.0;
export const LOD_ICON_PX2 = 0.6;
export const LOD_PIECE_PX2 = 0.05; // gehaltenes Teil: fein, damit auch Kleinststaaten eine Form behalten

/**
 * Pfadgenerator, der Punkte mit Gewicht < minPx2 / scale² überspringt.
 * Punkte ohne Gewicht (Gradnetz, Kugelrand) werden immer gezeichnet.
 * @param {d3.GeoProjection} projection
 * @param {number} minPx2
 * @param {CanvasRenderingContext2D|Path2D|null} context  null → SVG-Pfadstring
 */
export function lodPath(projection, minPx2, context = null) {
  const s = projection.scale();
  const minZ = minPx2 / (s * s);
  const filtered = {
    stream(out) {
      const ps = projection.stream(out);
      return {
        point(x, y, z) { if (z === undefined || z >= minZ) ps.point(x, y); },
        lineStart() { ps.lineStart(); },
        lineEnd() { ps.lineEnd(); },
        polygonStart() { ps.polygonStart(); },
        polygonEnd() { ps.polygonEnd(); },
        sphere() { ps.sphere(); },
      };
    },
  };
  return d3.geoPath(filtered, context);
}
