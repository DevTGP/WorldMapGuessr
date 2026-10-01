// Binäre Kacheln lesen (build/5-binary.mjs): Land (Flächen je Zelle + Linien) und Wasser (Seen + Flüsse).
//
// Ergebnis je Kachel: Punkte als Float32 [λ, φ] in Bogenmaß (für WebGL direkt hochladbar), die Dreiecke der
// Flächen und die Gliederung in Gruppen (Zelle bzw. sMin), Ringe und Linien. Der Canvas-Renderer braucht
// stattdessen vorbereitete Ringe (project.js prepare) – die entstehen erst, wenn er danach fragt.

import { RAD, prepare } from "./project.js";

const MAGIC = 0x32544d57; // "WMT2"
export const LAND = 1;
export const WATER = 2;

/**
 * @param {ArrayBuffer} buffer
 * @param {{tile: number, q: number}} level  Stufe aus index.json
 * @param {number} x
 * @param {number} y
 */
export function readTile(buffer, level, x, y) {
  const head = new Uint32Array(buffer, 0, 8);
  if (head[0] !== MAGIC) throw new Error("Kachelformat unbekannt");
  const [, kind, nGroups, nRings, nPoly, nTri, nLines, nLinePts] = head;
  let o = 32;
  const f32 = (n) => { const a = new Float32Array(buffer, o, n); o += 4 * n; return a; };
  const u32 = (n) => { const a = new Uint32Array(buffer, o, n); o += 4 * n; return a; };
  const groupAttr = f32(nGroups), groupRings = u32(nGroups), ringPoints = u32(nRings);
  const lineA = f32(nLines), lineB = f32(nLines), linePoints = u32(nLines);

  // Varints: Koordinaten (Differenzen je Ring/Linie) und Dreiecke (Differenz zum vorigen Index)
  const bytes = new Uint8Array(buffer, o);
  let p = 0;
  const next = () => {
    let v = 0, mul = 1, b;
    do { b = bytes[p++]; v += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80);
    return v % 2 ? -(v + 1) / 2 : v / 2;
  };
  const size = level.tile, q = level.q;
  const lon0 = -180 + x * size, lat0 = -90 + y * size;
  const k = (size / q) * RAD;
  const coords = (counts, total) => {
    const out = new Float32Array(2 * total);
    let i = 0;
    for (const n of counts) {
      let qx = 0, qy = 0;
      for (let j = 0; j < n; j++, i += 2) {
        qx += next(); qy += next();
        out[i] = lon0 * RAD + qx * k;
        out[i + 1] = lat0 * RAD + qy * k;
      }
    }
    return out;
  };
  const poly = coords(ringPoints, nPoly);
  const line = coords(linePoints, nLinePts);
  const triangles = new Uint32Array(nTri);
  for (let i = 0, prev = 0; i < nTri; i++) triangles[i] = prev += next();
  return { kind, groupAttr, groupRings, ringPoints, poly, triangles, lineA, lineB, linePoints, line };
}

/** Punkte [λ, φ] (Bogenmaß) eines Abschnitts → vorbereitete Punkte für den Canvas-Renderer */
function prepared(src, start, n) {
  const deg = new Float64Array(2 * n);
  for (let i = 0; i < 2 * n; i++) deg[i] = src[2 * start + i] / RAD;
  return prepare(deg);
}

/**
 * Für den Canvas-Renderer: Gruppen mit ihren Ringen und Linien als vorbereitete Punktfolgen
 * @returns {{groups: {attr: number, rings: Float64Array[]}[], lines: {a: number, b: number, pts: Float64Array}[]}}
 */
export function canvasParts(t) {
  const groups = [];
  let ring = 0, point = 0;
  for (let g = 0; g < t.groupAttr.length; g++) {
    const rings = [];
    for (let r = 0; r < t.groupRings[g]; r++, ring++) {
      const n = t.ringPoints[ring];
      rings.push(prepared(t.poly, point, n));
      point += n;
    }
    groups.push({ attr: t.groupAttr[g], rings });
  }
  const lines = [];
  for (let l = 0, start = 0; l < t.lineA.length; l++) {
    const n = t.linePoints[l];
    lines.push({ a: t.lineA[l], b: t.lineB[l], pts: prepared(t.line, start, n) });
    start += n;
  }
  return { groups, lines };
}
