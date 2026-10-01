// Schritt 5: Land- und Wasserkacheln (Schritte 2 und 3, JSON) in ein Binärformat umwandeln und die Flächen
// dabei in Dreiecke zerlegen (earcut). Der Browser muss so weder JSON parsen noch triangulieren: Die
// Koordinaten kommen als Int32-Felder, die Dreiecke kann der WebGL-Renderer direkt hochladen
// (worldmapguessr/static/js/map/tile-format.js liest das Format).
//
//   tiles/z{z}/{x}_{y}.bin   Landflächen je Zelle (Ringe + Dreiecke), Linien (Küsten/Grenzen, Zellen a/b)
//   water/z{z}/{x}_{y}.bin   Seen je sMin (Ringe + Dreiecke), Flüsse (sMin)
//
// Format (little-endian):
//   Kopf (u32 × 8): Kennung "WMT2", Art (1 Land, 2 Wasser), Gruppen, Ringe, Flächenpunkte, Dreiecksindizes,
//                   Linien, Linienpunkte
//   f32 groupAttr[Gruppen]   Land: Zelle · Wasser: sMin des Sees
//   u32 groupRings[Gruppen]  Ringe je Gruppe
//   u32 ringPoints[Ringe]    Punkte je Ring
//   f32 lineA[Linien]        Land: Zelle a · Wasser: sMin des Flusses
//   f32 lineB[Linien]        Land: Zelle b (−1: Küste) · Wasser: 0
//   u32 linePoints[Linien]
//   danach Varints (LEB128, vorzeichenbehaftet als Zickzack):
//   polyXY[2 × Flächenpunkte]   je Ring Differenzen in 1/q der Kachelseite (wie im JSON), ab (0, 0)
//   lineXY[2 × Linienpunkte]    ebenso je Linie
//   triangles[Dreiecksindizes]  Punktnummern (über alle Ringe der Kachel gezählt) als Differenz zur vorigen
// Mit Brotli: Koordinaten kleiner als im JSON, mit Dreiecken insgesamt ≈ 20 % größer.
//
// Die JSON-Kacheln werden danach gelöscht; index.json bekommt "tileFormat": "bin" und eine neue Version.
// Ringe: Außenringe und Löcher haben entgegengesetzten Umlaufsinn (Canvas füllt „nonzero“). Je Gruppe gilt
// der Umlaufsinn des größten Rings als außen; jedes Loch gehört zum kleinsten Außenring, der es enthält.
// Ein Ring mit Loch-Umlaufsinn ohne passenden Außenring wird – wie beim Füllen mit „nonzero“ – selbst gefüllt.

import fs from "node:fs";
import crypto from "node:crypto";
import earcut from "earcut";

const OUT = "../worldmapguessr/static/data/map";
const MAGIC = 0x32544d57; // "WMT2"

const index = JSON.parse(fs.readFileSync(`${OUT}/index.json`, "utf8"));
if (index.tileFormat === "bin") {
  console.log("Kacheln sind schon binär – erst Schritt 2 und 3 neu ausführen.");
  process.exit(0);
}

/** Differenzen → absolute Punkte [x, y, x, y, …] */
function absolute(ints) {
  const out = new Array(ints.length);
  let x = 0, y = 0;
  for (let i = 0; i < ints.length; i += 2) {
    x += ints[i]; y += ints[i + 1];
    out[i] = x; out[i + 1] = y;
  }
  return out;
}

function signedArea(p) {
  let a = 0;
  for (let i = 0, n = p.length / 2, j = n - 1; i < n; j = i++) a += p[2 * j] * p[2 * i + 1] - p[2 * i] * p[2 * j + 1];
  return a / 2;
}

function contains(ring, x, y) {
  let inside = false;
  for (let i = 0, n = ring.length / 2, j = n - 1; i < n; j = i++) {
    const xi = ring[2 * i], yi = ring[2 * i + 1], xj = ring[2 * j], yj = ring[2 * j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Ringe einer Gruppe triangulieren
 * @param {number[][]} rings  absolute Punkte je Ring
 * @param {number[]} first    Nummer des ersten Punkts je Ring (in der ganzen Kachel)
 * @returns {number[]} Dreiecksindizes
 */
function triangulate(rings, first) {
  const areas = rings.map(signedArea);
  let big = 0;
  for (let i = 1; i < rings.length; i++) if (Math.abs(areas[i]) > Math.abs(areas[big])) big = i;
  const outerSign = Math.sign(areas[big]) || 1;
  const outers = [], holes = [];
  rings.forEach((r, i) => {
    if (r.length < 6 || areas[i] === 0) return;
    (Math.sign(areas[i]) === outerSign ? outers : holes).push(i);
  });
  const holesOf = new Map(outers.map((i) => [i, []]));
  for (const h of holes) {
    const [x, y] = rings[h];
    let best = -1;
    for (const o of outers) {
      if (contains(rings[o], x, y) && (best < 0 || Math.abs(areas[o]) < Math.abs(areas[best]))) best = o;
    }
    if (best >= 0) holesOf.get(best).push(h);
    else holesOf.set(h, []); // ohne Außenring: wird selbst gefüllt
  }
  const out = [];
  for (const [o, hs] of holesOf) {
    const parts = [o, ...hs];
    const flat = [], holeStarts = [], map = [];
    for (const r of parts) {
      if (r !== o) holeStarts.push(flat.length / 2);
      for (let k = 0; k < rings[r].length / 2; k++) map.push(first[r] + k);
      flat.push(...rings[r]);
    }
    for (const i of earcut(flat, holeStarts, 2)) out.push(map[i]);
  }
  return out;
}

/** Ganze Zahlen als Zickzack-Varints (LEB128) */
function varints(values) {
  const out = [];
  for (const v of values) {
    let z = v >= 0 ? 2 * v : -2 * v - 1;
    while (z >= 0x80) { out.push((z % 0x80) | 0x80); z = Math.floor(z / 0x80); }
    out.push(z);
  }
  return Buffer.from(out);
}

/** Eine Kachel kodieren. groups: [{attr, rings: [ints]}], lines: [{a, b, ints}] */
function encodeTile(kind, groups, lines) {
  const groupAttr = [], groupRings = [], ringPoints = [], polyXY = [], triangles = [];
  let point = 0;
  for (const g of groups) {
    groupAttr.push(g.attr);
    groupRings.push(g.rings.length);
    const abs = [], first = [];
    for (const ints of g.rings) {
      ringPoints.push(ints.length / 2);
      for (const v of ints) polyXY.push(v);
      first.push(point);
      abs.push(absolute(ints));
      point += ints.length / 2;
    }
    for (const i of triangulate(abs, first)) triangles.push(i);
  }
  const lineA = [], lineB = [], linePoints = [], lineXY = [];
  for (const l of lines) {
    lineA.push(l.a); lineB.push(l.b); linePoints.push(l.ints.length / 2);
    for (const v of l.ints) lineXY.push(v);
  }
  const head = [MAGIC, kind, groups.length, ringPoints.length, polyXY.length / 2, triangles.length, lines.length, lineXY.length / 2];
  const fixed = [
    new Uint32Array(head), new Float32Array(groupAttr), new Uint32Array(groupRings), new Uint32Array(ringPoints),
    new Float32Array(lineA), new Float32Array(lineB), new Uint32Array(linePoints),
  ];
  const triDeltas = triangles.map((v, i) => v - (i ? triangles[i - 1] : 0));
  return Buffer.concat([...fixed.map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength)),
    varints(polyXY), varints(lineXY), varints(triDeltas)]);
}

const digest = crypto.createHash("sha1");
const stats = [];
function convert(dir, kind, tiles, toParts) {
  for (const [z, keys] of Object.entries(tiles)) {
    let jsonBytes = 0, binBytes = 0, tris = 0;
    for (const key of keys) {
      const file = `${OUT}/${dir}/z${z}/${key}.json`;
      const text = fs.readFileSync(file, "utf8");
      const { groups, lines } = toParts(JSON.parse(text));
      const bin = encodeTile(kind, groups, lines);
      fs.writeFileSync(`${OUT}/${dir}/z${z}/${key}.bin`, bin);
      for (const ext of ["", ".gz", ".br"]) fs.rmSync(file + ext, { force: true });
      digest.update(bin);
      jsonBytes += text.length;
      binBytes += bin.length;
      tris += bin.readUInt32LE(20) / 3;
    }
    stats.push({ dir, z, tiles: keys.length, json_kB: Math.round(jsonBytes / 1024), bin_kB: Math.round(binBytes / 1024), triangles: tris });
  }
}

convert("tiles", 1, index.tiles, (raw) => ({
  groups: raw.f.map(([cell, ...rings]) => ({ attr: cell, rings })),
  lines: raw.l.map(([a, b, ints]) => ({ a, b, ints })),
}));
if (index.water) {
  convert("water", 2, index.water.tiles, (raw) => ({
    groups: raw.k.map(([sMin, ...rings]) => ({ attr: sMin, rings })),
    lines: raw.r.map(([sMin, ints]) => ({ a: sMin, b: 0, ints })),
  }));
}

index.tileFormat = "bin";
const versions = index.versions ?? { tiles: index.version };
versions.binary = digest.digest("hex").slice(0, 10);
index.versions = versions;
index.version = crypto.createHash("sha1").update(JSON.stringify(versions, Object.keys(versions).sort())).digest("hex").slice(0, 10);
fs.writeFileSync(`${OUT}/index.json`, JSON.stringify(index));
console.table(stats);
console.log(`Version ${index.version}`);
