// Schritt 2: Aus den Zellen (Schritt 1) die Kartendaten für den Browser bauen – mit Detailstufen (LOD).
//
//   Kacheln   static/data/map/tiles/z{z}/{x}_{y}.json – je Detailstufe ein Raster aus Längen-/Breitengrad-
//             Kacheln (Stufe 0: 90°, jede weitere halbiert). Inhalt: Landflächen (je Zelle, auf die Kachel
//             zugeschnitten) und Linien (Küsten, Kontinent- und Staatsgrenzen). Der Browser lädt nur die
//             Kacheln des sichtbaren Ausschnitts in der Stufe, die zum Zoom passt.
//   Items     static/data/map/items/i0.json – alle Items grob (Menü-Icons, Start);
//             static/data/map/items/i{1..4}/{kind}-{id}.json – feinere Stufen, bei Bedarf geladen.
//   Index     static/data/map/index.json – Stufen, Zellen, Items (Name, Gruppe, Anker, Fläche), Kachelliste.
//
// Vereinfachung: Visvalingam mit sphärischer Dreiecksfläche (topojson presimplify). Gemeinsame Grenzen
// werden in allen Zellen gleich vereinfacht (Topologie), es entstehen keine Lücken. Stufe z wird bis zur
// Kartenskala sMax (Pixel pro Bogenmaß) benutzt; Punkte, deren Dreieck auf dem Bildschirm kleiner als
// PX2 Pixel² wäre, fallen weg. Die feinste Stufe enthält alle Punkte der Quelle.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { geoArea, geoBounds, geoCentroid } from "d3-geo";

const require = createRequire(import.meta.url);
const { topology } = require("topojson-server");
const { presimplify, sphericalTriangleArea } = require("topojson-simplify");
const { merge } = require("topojson-client");

const OUT = "../worldmapguessr/static/data/map";
const PX2 = 4;            // kleinstes sichtbares Dreieck in Pixel² (bei sMax der Stufe)
const MIN_RING_PX = 1;    // Inseln unter so vielen Pixeln (bei sMax) fallen in dieser Stufe weg
// Kacheln überlappen leicht (Anteil der Kachelseite): Flächen benachbarter Kacheln haben so keine
// gemeinsame Kante, an der Kantenglättung eine Haarlinie hinterlässt.
const OVERLAP = 1 / 512;
// Kanten entlang eines Meridians (Kachelrand, ±180°) werden so fein unterteilt (Anteil der Kachelseite) –
// in der Projektion sind Meridiane gekrümmt, eine lange gerade Kante ließe einen Spalt.
const MERIDIAN_STEP = 1 / 32;
// Genauigkeit: je Stufe so fein, dass Rundungsfehler bei sMax unter ~0,1 Pixel bleiben
//   q      Kachelkoordinaten als ganze Zahlen 0…q je Kachelseite
//   itemQ  Item-Umrisse in Schritten von 1/itemQ Grad
const ITEM_START_SMAX = 250; // i0.json (Start): mindestens so fein wie für diese Kartenskala nötig …
// … und so fein, dass das Item als Inventar-Icon (ICON_PX, eingepasst) scharf bleibt
const ICON_PX = [130, 70];
const ICON_PX2 = 1;
export const LEVELS = [
  { z: 0, tile: 90, sMax: 450, q: 8192, itemQ: 1e3 },
  { z: 1, tile: 45, sMax: 1100, q: 8192, itemQ: 1e3 },
  { z: 2, tile: 22.5, sMax: 2800, q: 16384, itemQ: 1e3 },
  { z: 3, tile: 11.25, sMax: 7000, q: 32768, itemQ: 1e4 },
  { z: 4, tile: 5.625, sMax: Infinity, q: 65536, itemQ: 1e5 },
];
const ITEM_START_Q = 100;
const MAX_ANCHOR_LAT = 78;

const pieces = JSON.parse(fs.readFileSync("tmp/pieces.geojson"));
const { cells, items } = JSON.parse(fs.readFileSync("tmp/cells.json"));
const itemKeys = Object.keys(items);

// ---------- Topologie + Gewichte ----------
console.time("Topologie");
let topo = topology({ land: pieces }, 1e7);
topo = presimplify(topo, sphericalTriangleArea); // Bögen absolut (lon, lat, Gewicht)
const land = topo.objects.land.geometries;
console.timeEnd("Topologie");

// Welche Zellen grenzen an jeden Bogen? (eine Zelle = Küste, zwei verschiedene = Grenze)
const arcSides = topo.arcs.map(() => []);
land.forEach((g) => {
  const polysOf = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : [];
  for (const poly of polysOf) for (const ring of poly) for (const a of ring) arcSides[a < 0 ? ~a : a].push(g.properties.cell);
});

// Künstliche Kanten: Schnitt der Quelldaten an ±180° und der Südpol-Rand der Antarktis
const artificial = (p, q) =>
  (Math.abs(p[0]) > 179.99999 && Math.abs(q[0]) > 179.99999) || (p[1] < -89.9999 && q[1] < -89.9999);

// ---------- Hilfen ----------
const degPerRad = 180 / Math.PI;
function levelArcs(level) {
  const minW = Number.isFinite(level.sMax) ? PX2 / (level.sMax * level.sMax) : -1;
  return topo.arcs.map((arc) => arc.filter((p, i) => i === 0 || i === arc.length - 1 || p[2] >= minW).map((p) => [p[0], p[1]]));
}
function ringFromArcs(arcs, ring) {
  const out = [];
  for (const a of ring) {
    const pts = a < 0 ? arcs[~a].slice().reverse() : arcs[a];
    for (let i = out.length ? 1 : 0; i < pts.length; i++) out.push(pts[i]);
  }
  return out;
}
function bbox(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}

// Sutherland–Hodgman: Ring an einem achsparallelen Rechteck zuschneiden
function clipRing(ring, [x0, y0, x1, y1]) {
  const edges = [
    [(p) => p[0] >= x0, (p, q) => [x0, p[1] + (q[1] - p[1]) * (x0 - p[0]) / (q[0] - p[0])]],
    [(p) => p[0] <= x1, (p, q) => [x1, p[1] + (q[1] - p[1]) * (x1 - p[0]) / (q[0] - p[0])]],
    [(p) => p[1] >= y0, (p, q) => [p[0] + (q[0] - p[0]) * (y0 - p[1]) / (q[1] - p[1]), y0]],
    [(p) => p[1] <= y1, (p, q) => [p[0] + (q[0] - p[0]) * (y1 - p[1]) / (q[1] - p[1]), y1]],
  ];
  let pts = ring;
  for (const [inside, cut] of edges) {
    if (!pts.length) break;
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const pin = inside(p), qin = inside(q);
      if (pin) out.push(p);
      if (pin !== qin) out.push(cut(p, q));
    }
    pts = out;
  }
  return pts.length >= 3 ? pts : null;
}

/** Ring an ±180° um e nach außen schieben (Überlappung auch an der Datumsgrenze) */
function pushAntimeridian(ring, e) {
  return ring.map((p) => (p[0] <= -179.99999 ? [-180 - e, p[1]] : p[0] >= 179.99999 ? [180 + e, p[1]] : p));
}

/** Kanten mit konstanter Länge (Meridianstücke) in Schritte ≤ step unterteilen */
function densifyMeridians(ring, step) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i], q = ring[(i + 1) % ring.length];
    out.push(p);
    const d = q[1] - p[1];
    if (p[0] === q[0] && Math.abs(d) > step) {
      const n = Math.ceil(Math.abs(d) / step);
      for (let j = 1; j < n; j++) out.push([p[0], p[1] + (d * j) / n]);
    }
  }
  return out;
}

// Liang–Barsky: Linie an einem Rechteck zuschneiden → Teilstücke
function clipLine(line, [x0, y0, x1, y1]) {
  const parts = [];
  let cur = null;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i], [bx, by] = line[i + 1];
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, ax - x0], [dx, x1 - ax], [-dy, ay - y0], [dy, y1 - ay]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok) { cur = null; continue; }
    const s = [ax + t0 * dx, ay + t0 * dy], e = [ax + t1 * dx, ay + t1 * dy];
    if (!cur || t0 > 0) { cur = [s]; parts.push(cur); }
    cur.push(e);
    if (t1 < 1) cur = null;
  }
  return parts.filter((p) => p.length >= 2);
}

/** Kacheln (x, y), deren um e erweitertes Rechteck die Box b berührt */
function tilesFor(b, size, e = 0) {
  const out = [];
  const cols = Math.round(360 / size), rows = Math.round(180 / size);
  const xa = Math.max(0, Math.floor((b[0] - e + 180) / size)), xb = Math.min(cols - 1, Math.floor((b[2] + e + 180) / size));
  const ya = Math.max(0, Math.floor((b[1] - e + 90) / size)), yb = Math.min(rows - 1, Math.floor((b[3] + e + 90) / size));
  for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) out.push([x, y]);
  return out;
}

/** Punkte → ganze Zahlen relativ zum Kachelursprung, als Differenzen */
function encode(pts, ox, oy, size, Q) {
  const out = [];
  let px = 0, py = 0;
  for (const [x, y] of pts) {
    const qx = Math.round((x - ox) / size * Q), qy = Math.round((y - oy) / size * Q);
    if (out.length && qx === px && qy === py) continue;
    out.push(qx - px, qy - py);
    px = qx; py = qy;
  }
  return out;
}
function encodeItem(pts, q) {
  const out = [];
  let px = 0, py = 0;
  for (const [x, y] of pts) {
    const qx = Math.round(x * q), qy = Math.round(y * q);
    if (out.length && qx === px && qy === py) continue;
    out.push(qx - px, qy - py);
    px = qx; py = qy;
  }
  return out;
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = JSON.stringify(data);
  fs.writeFileSync(file, text);
  return text.length;
}

// ---------- Ausgabe ----------
fs.rmSync(OUT, { recursive: true, force: true });
const tileIndex = {};
const stats = [];
const itemGeoms = {}; // key → [Geometrie je Stufe]
const piecesOf = (key) => {
  const [kind, id] = key.split(":");
  return land.filter((g) => {
    const c = cells[g.properties.cell];
    return kind === "continent" ? c.continent === id : c.item === key;
  });
};
const itemPieces = Object.fromEntries(itemKeys.map((k) => [k, piecesOf(k)]));

for (const level of LEVELS) {
  console.time(`Stufe ${level.z}`);
  const arcs = levelArcs(level);
  const minRingDeg = Number.isFinite(level.sMax) ? (MIN_RING_PX / level.sMax) * degPerRad : 0;
  const e = level.tile * OVERLAP, step = level.tile * MERIDIAN_STEP;
  const boxOf = (x, y) => {
    const ox = -180 + x * level.tile, oy = -90 + y * level.tile;
    return [ox - e, oy - e, ox + level.tile + e, oy + level.tile + e];
  };
  const fillRing = (ring, box, ox, oy) => {
    const c = clipRing(ring, box);
    return c ? encode(densifyMeridians(pushAntimeridian(c, e), step), ox, oy, level.tile, level.q) : [];
  };
  const tiles = new Map(); // "x_y" → {f: [], l: []}
  const tile = (x, y) => {
    const k = `${x}_${y}`;
    if (!tiles.has(k)) tiles.set(k, { f: [], l: [] });
    return tiles.get(k);
  };
  let fillPts = 0, linePts = 0;

  // Flächen
  for (const g of land) {
    const polysOf = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : [];
    for (const poly of polysOf) {
      const rings = poly.map((r) => ringFromArcs(arcs, r)).filter((r) => r.length >= 4);
      if (!rings.length) continue;
      const b = bbox(rings[0]);
      if (Math.max(b[2] - b[0], b[3] - b[1]) < minRingDeg) continue; // zu klein für diese Stufe
      for (const [x, y] of tilesFor(b, level.tile, e)) {
        const ox = -180 + x * level.tile, oy = -90 + y * level.tile;
        const box = boxOf(x, y);
        const encOuter = fillRing(rings[0], box, ox, oy);
        if (encOuter.length < 6) continue;
        const holes = rings.slice(1).map((r) => fillRing(r, box, ox, oy)).filter((r) => r.length >= 6);
        const enc = [encOuter, ...holes];
        tile(x, y).f.push([g.properties.cell, ...enc]);
        fillPts += enc.reduce((n, r) => n + r.length / 2, 0);
      }
    }
  }

  // Linien: Küsten (Zelle | Meer) und Grenzen (Zelle | Zelle), ohne innere Bögen einer Zelle
  arcs.forEach((arc, i) => {
    const [a, b = -1] = arcSides[i];
    if (a === b) return;
    // an künstlichen Kanten auftrennen
    const lines = [];
    let cur = [arc[0]];
    for (let j = 1; j < arc.length; j++) {
      if (artificial(arc[j - 1], arc[j])) { if (cur.length > 1) lines.push(cur); cur = [arc[j]]; }
      else cur.push(arc[j]);
    }
    if (cur.length > 1) lines.push(cur);
    for (const line of lines) {
      const b0 = bbox(line);
      for (const [x, y] of tilesFor(b0, level.tile, e)) {
        const ox = -180 + x * level.tile, oy = -90 + y * level.tile;
        for (const part of clipLine(line, boxOf(x, y))) {
          const enc = encode(part, ox, oy, level.tile, level.q);
          if (enc.length < 4) continue;
          tile(x, y).l.push([a, b, enc]);
          linePts += enc.length / 2;
        }
      }
    }
  });

  let bytes = 0;
  for (const [k, t] of tiles) bytes += writeJson(`${OUT}/tiles/z${level.z}/${k}.json`, t);
  tileIndex[level.z] = Object.fromEntries([...tiles.keys()].map((k) => [k, 1]));

  // Items dieser Stufe: Zellen zu einem Umriss vereinigen
  const levelTopo = { ...topo, arcs: arcs, transform: undefined };
  for (const key of itemKeys) {
    const g = merge(levelTopo, itemPieces[key]);
    const polys = (g.coordinates || [])
      .map((poly) => poly.filter((r) => r.length >= 4))
      .filter((poly) => poly.length);
    (itemGeoms[key] ??= [])[level.z] = polys;
  }
  stats.push({ z: level.z, tiles: tiles.size, fillPts, linePts, kB: Math.round(bytes / 1024) });
  console.timeEnd(`Stufe ${level.z}`);
}

// ---------- Items: Kenngrößen aus voller Genauigkeit, Umrisse je Stufe ----------
const top = LEVELS.length - 1;
const itemList = itemKeys.map((key) => {
  const full = { type: "MultiPolygon", coordinates: itemGeoms[key][top] };
  let largest = null, largestArea = -1;
  for (const poly of full.coordinates) {
    const a = geoArea({ type: "Polygon", coordinates: poly });
    if (a > largestArea) { largestArea = a; largest = poly; }
  }
  const [lon, lat] = geoCentroid({ type: "Polygon", coordinates: largest });
  const anchor = [+lon.toFixed(5), +Math.max(-MAX_ANCHOR_LAT, Math.min(MAX_ANCHOR_LAT, lat)).toFixed(5)];
  const it = items[key];
  return { key, ...it, anchor, area: geoArea(full), centerLon: anchor[0] };
});

/** Umriss kodieren: [q, Polygone]. Gehen bei der Rundung auf 1/q Grad Ringe verloren (Kleinststaaten),
 *  wird für dieses Item feiner gerundet. */
function encPolys(polys, q) {
  for (const qq of [q, 1e4, 1e5]) {
    const out = polys
      .map((poly) => {
        const rings = poly.map((r) => encodeItem(r, qq));
        return rings[0].length >= 8 ? rings.filter((r) => r.length >= 8) : null;
      })
      .filter(Boolean);
    if (out.length || qq === 1e5) return [qq, out];
  }
}
// Startstufe für alle Items in einer Datei (Menü- und Inventar-Icons, Spiel bei kleinem Zoom). Jedes
// Item wird für sich vereinfacht: so fein, wie sein Icon (klein oder groß eingepasst) oder die
// Startskala der Karte es braucht – je nachdem, was mehr Detail verlangt.
/** Kartenskala, bei der das Item gerade ins Icon passt (Natural Earth ≈ 0,87 · cos φ in x) */
function iconScale(polys) {
  const [[x0, y0], [x1, y1]] = geoBounds({ type: "MultiPolygon", coordinates: polys });
  const dLon = (x1 >= x0 ? x1 - x0 : x1 + 360 - x0) / degPerRad, dLat = (y1 - y0) / degPerRad;
  const w = dLon * 0.87 * Math.cos(((y0 + y1) / 2) / degPerRad), h = dLat;
  return Math.min(ICON_PX[0] / Math.max(w, 1e-9), ICON_PX[1] / Math.max(h, 1e-9));
}
/** Rundung: 1/q Grad klein gegenüber der Ausdehnung des Items */
function startQ(polys) {
  const [[x0, y0], [x1, y1]] = geoBounds({ type: "MultiPolygon", coordinates: polys });
  const ext = Math.max(x1 >= x0 ? x1 - x0 : x1 + 360 - x0, y1 - y0);
  return [ITEM_START_Q, 1e3, 1e4, 1e5].find((q) => 1 / q <= ext / 2000) ?? 1e5;
}
/** Item-Umriss aus den Bögen mit Gewicht ≥ minW (nur die Bögen des Items werden gefiltert) */
function mergeItem(key, minW) {
  const arcs = [];
  for (const g of itemPieces[key]) {
    const polysOf = g.type === "Polygon" ? [g.arcs] : g.type === "MultiPolygon" ? g.arcs : [];
    for (const poly of polysOf) for (const ring of poly) for (const a of ring) {
      const i = a < 0 ? ~a : a;
      if (arcs[i]) continue;
      const arc = topo.arcs[i];
      arcs[i] = arc.filter((p, j) => j === 0 || j === arc.length - 1 || p[2] >= minW).map((p) => [p[0], p[1]]);
    }
  }
  return (merge({ ...topo, arcs, transform: undefined }, itemPieces[key]).coordinates || [])
    .map((poly) => poly.filter((r) => r.length >= 4)).filter((poly) => poly.length);
}
/** Erste Geometrie der Liste, die nach dem Kodieren noch Fläche hat (sonst die feinere nächste Stufe) */
function encodeFirst(candidates, q) {
  let last = [q, []];
  for (const polys of candidates) {
    if (!polys?.length) continue;
    last = encPolys(polys, q);
    if (last[1].length) return last;
  }
  return last;
}
const i0 = {};
for (const key of itemKeys) {
  const full = itemGeoms[key][top];
  const s = Math.max(ITEM_START_SMAX, iconScale(full));
  const minW = Math.min(ICON_PX2, PX2) / (s * s);
  i0[key] = encodeFirst([mergeItem(key, minW), full], startQ(full));
}
const i0Bytes = writeJson(`${OUT}/items/i0.json`, i0);
const itemFileName = (key) => key.replace(":", "-");
let itemBytes = 0;
for (const level of LEVELS.slice(1)) {
  for (const key of itemKeys) {
    const enc = encodeFirst(itemGeoms[key].slice(level.z), level.itemQ);
    itemBytes += writeJson(`${OUT}/items/i${level.z}/${itemFileName(key)}.json`, enc);
  }
}

// ---------- Index ----------
const z0Bytes = Object.keys(tileIndex[0]).reduce((n, k) => n + fs.statSync(`${OUT}/tiles/z0/${k}.json`).size, 0);
const index = {
  levels: LEVELS.map(({ z, tile, sMax, q, itemQ }) => ({ z, tile, overlap: tile * OVERLAP, sMax: Number.isFinite(sMax) ? sMax : null, q, itemQ })),
  itemStart: { sMax: ITEM_START_SMAX, itemQ: ITEM_START_Q },
  cells: cells.map((c) => [c.continent, c.item]),
  items: itemList,
  tiles: Object.fromEntries(Object.entries(tileIndex).map(([z, t]) => [z, Object.keys(t)])),
  startBytes: { i0: i0Bytes, z0: z0Bytes },
};
const hash = crypto.createHash("sha1");
for (const z of Object.keys(tileIndex)) for (const k of Object.keys(tileIndex[z]).sort()) hash.update(fs.readFileSync(`${OUT}/tiles/z${z}/${k}.json`));
hash.update(JSON.stringify(i0));
index.version = hash.digest("hex").slice(0, 10);
const indexBytes = writeJson(`${OUT}/index.json`, index);

console.table(stats);
console.log(`Items: ${itemList.length}, i0 ${Math.round(i0Bytes / 1024)} kB, Stufen 1–4 ${Math.round(itemBytes / 1024)} kB, Index ${Math.round(indexBytes / 1024)} kB, Version ${index.version}`);
