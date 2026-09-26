// Schnelle Natural-Earth-Projektion für den Kachel-Renderer.
// Gleiche Formel wie d3.geoNaturalEarth1, aber ohne Stream-Pipeline: Die Kacheln speichern je Punkt
// schon die breitenabhängigen Faktoren, beim Zeichnen bleiben pro Punkt zwei Multiplikationen.
// Die Karte dreht nur um die Längsachse (rotate([λ, 0])) – dadurch ist das möglich.

export const RAD = Math.PI / 180;
export const TAU = 2 * Math.PI;

/** x-Faktor: x = λ · fx(φ) */
export function fxOf(phi) {
  const phi2 = phi * phi, phi4 = phi2 * phi2;
  return 0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4));
}

/** y = Y(φ) */
export function yOf(phi) {
  const phi2 = phi * phi, phi4 = phi2 * phi2;
  return phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
}

/**
 * Punkte [lon°, lat°, …] → Float64Array [λ, fx, Y, λ, fx, Y, …] (λ in Bogenmaß, noch ungedreht)
 * @param {number[]|Float64Array} lonlat
 */
export function prepare(lonlat) {
  const n = lonlat.length / 2;
  const out = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    const lam = lonlat[2 * i] * RAD, phi = lonlat[2 * i + 1] * RAD;
    out[3 * i] = lam;
    out[3 * i + 1] = fxOf(phi);
    out[3 * i + 2] = yOf(phi);
  }
  return out;
}

/** Aktuelle Ansicht aus der d3-Projektion übernehmen */
export function viewOf(projection) {
  const [tx, ty] = projection.translate();
  return { s: projection.scale(), tx, ty, rot: projection.rotate()[0] * RAD };
}

/** Verschiebung (Vielfaches von 2π), mit der λ + rot + off für lon0 in [-π, π) liegt */
export function wrapOffset(lon0Rad, rot) {
  const v = lon0Rad + rot;
  return -TAU * Math.floor((v + Math.PI) / TAU);
}

/**
 * Sichtbares Gebiet eines Bildschirmrechtecks (Kartenkoordinaten) als Test für Längen-/Breiten-Boxen.
 * Die Karte dreht nur um die Längsachse: sichtbar ist ein Breitenband, und auf jeder Breite φ ein
 * Längenbereich, der umso breiter ist, je dichter die Längengrade dort liegen (polnah). Für eine Box zählt
 * daher die Breite ihres sichtbaren Teils mit dem größten |φ|.
 * @returns {(lon0: number, lon1: number, lat0: number, lat1: number) => boolean}  Box in Bogenmaß
 */
export function boxTest(projection, [[x0, y0], [x1, y1]], marginPx = 4) {
  const s = projection.scale(), [tx, ty] = projection.translate(), rot = projection.rotate()[0] * RAD;
  const margin = marginPx / s;
  const yMax = yOf(Math.PI / 2);
  const latAt = (y) => {
    const Y = (ty - y) / s;
    if (Y >= yMax) return Math.PI / 2;
    if (Y <= -yMax) return -Math.PI / 2;
    let phi = Y; // Newton: yOf(phi) = Y
    for (let i = 0; i < 8; i++) phi -= (yOf(phi) - Y) / ((yOf(phi + 1e-6) - yOf(phi - 1e-6)) / 2e-6);
    return phi;
  };
  const phiMax = Math.min(Math.PI / 2, latAt(y0) + margin);
  const phiMin = Math.max(-Math.PI / 2, latAt(y1) - margin);
  return (lon0, lon1, lat0, lat1) => {
    const a = Math.max(lat0, phiMin), b = Math.min(lat1, phiMax);
    if (a > b) return false;
    const far = a <= 0 && b >= 0 ? Math.max(-a, b) : Math.max(Math.abs(a), Math.abs(b));
    const fx = fxOf(far);
    const l0 = Math.max(-Math.PI, (x0 - tx) / (s * fx) - margin);
    const l1 = Math.min(Math.PI, (x1 - tx) / (s * fx) + margin);
    if (l1 < l0) return false;
    if (l1 - l0 >= TAU - 1e-9) return true;
    // Box [lon0, lon1] (gedreht) gegen [l0, l1], mit Umlauf
    const start = l0 - rot;
    const d = lon0 - start - TAU * Math.floor((lon0 - start) / TAU);
    return d <= l1 - l0 || d + (lon1 - lon0) >= TAU;
  };
}
