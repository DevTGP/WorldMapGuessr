// Schnelle Projektion für den Kachel-Renderer (Natural Earth oder Equal Earth, siehe map/projections.js).
// Gleiche Formeln wie d3, aber ohne Stream-Pipeline: Die Kacheln speichern je Punkt schon die
// breitenabhängigen Faktoren, beim Zeichnen bleiben pro Punkt zwei Multiplikationen.
// Die Karte dreht nur um die Längsachse (rotate([λ, 0])) – dadurch ist das möglich.
// Jeder Punkt behält seine Breite (φ), damit ein Wechsel der Projektion die Faktoren neu rechnen kann.

import { projectionDef } from "./projections.js";

export const RAD = Math.PI / 180;
export const TAU = 2 * Math.PI;

let raw = projectionDef();
/** Projektion für neue und neu gerechnete Punkte umstellen (vor reproject) */
export function useProjection(def) { raw = def; }

/** x-Faktor: x = λ · fx(φ) */
export function fxOf(phi) { return raw.fx(phi); }

/** y = Y(φ) */
export function yOf(phi) { return raw.y(phi); }

/**
 * Punkte [lon°, lat°, …] → Float64Array [λ, fx, Y, λ, fx, Y, …] (λ in Bogenmaß, noch ungedreht)
 * @param {number[]|Float64Array} lonlat
 */
export function prepare(lonlat) {
  const n = lonlat.length / 2;
  const out = new Float64Array(n * 3);
  out.phi = new Float32Array(n);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const lam = lonlat[2 * i] * RAD, phi = lonlat[2 * i + 1] * RAD;
    out.phi[i] = phi;
    const fx = fxOf(phi), y = yOf(phi);
    out[3 * i] = lam;
    out[3 * i + 1] = fx;
    out[3 * i + 2] = y;
    const x = lam * fx;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  // Ausdehnung in Karteneinheiten (× Skala = Pixel): winzige Ringe lässt der Renderer weg
  out.ext = n ? Math.max(x1 - x0, y1 - y0) : 0;
  return out;
}

/** Vorbereitete Punkte (prepare) mit der aktuellen Projektion neu rechnen */
export function reproject(pts) {
  const n = pts.length / 3;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    const phi = pts.phi[i], fx = fxOf(phi), y = yOf(phi);
    pts[3 * i + 1] = fx;
    pts[3 * i + 2] = y;
    const x = pts[3 * i] * fx;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  pts.ext = n ? Math.max(x1 - x0, y1 - y0) : 0;
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
