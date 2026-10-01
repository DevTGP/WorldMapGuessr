// Namen auslegen – der rechenintensive Teil von map/labels.js, ohne DOM: je Item die möglichen Namen
// (Kandidaten) aus seiner Form. Läuft im Worker (map/labels-worker.js, OffscreenCanvas) oder – ohne Worker –
// im Hauptthread. Verfahren und Toleranzen: Kopf von map/labels.js.

import { PROJECTION_DEFS } from "./projection-defs.js";

export const LABEL_FONT = '"Cinzel", "Cormorant SC", Georgia, "Times New Roman", serif';
const WEIGHT = { continent: 600, country: 700, state: 600 };
/** Sperrung (Anteil der Schriftgröße) je Ebene: [kleinste, größte] */
const TRACK = { continent: [0.3, 1.1], country: [0.08, 0.9], state: [0.06, 0.5] };
/** Anteil der Achsenlänge, den ein Name füllt */
const FILL = 0.8;
/**
 * Inselstaaten (Griechenland, Italien, Dänemark …): Je größer der Inselanteil (Fläche außerhalb des größten
 * Teils), desto mehr Meer zählt zur Form, und desto weiter darf der Name über ihre Enden hinaus aufs Meer
 * laufen (Paradox-Stil). Voll wirksam ab ISLANDS_FULL, unter ISLANDS_MIN gar nicht.
 */
const ISLANDS_MIN = 0.03, ISLANDS_FULL = 0.15;
/** Hülle (Anteil von REF_PX): Meerengen und Buchten bis zu dieser Breite zählen zur Form – ohne / mit Inseln */
const CLOSE = [0.04, 0.36];
/** So viel länger als die Form darf der Name höchstens sein – ohne / mit Inseln */
const OVERRUN = [1, 1.35];
/** Schrifthöhe höchstens dieser Anteil der Dicke des Items */
const THICK = 0.7;
/** Größte Biegung: Pfeilhöhe des Bogens / Länge */
const MAX_BEND = 0.16;
/** Steiler als so (Grad) steht kein Name */
const MAX_ANGLE = 65;
/** Ab diesem Verhältnis der Hauptachsen folgt der Name der Form, darunter liegt er waagerecht */
const ELONGATED = 1.35;
/** Passt der Name auf der Mittellinie nicht, wird sie quer verschoben (Anteile der Dicke) */
const SHIFTS = [0, 0.18, -0.18, 0.34, -0.34];
/**
 * Inselstaaten: außer der Hauptachse probierte Richtungen (Grad dazu) – lange Namen auf runden Inselgruppen
 * laufen schräg; eine schräge Richtung gewinnt nur, wenn der Name dort um TURN_GAIN größer wird
 */
const TURNS = [-40, -20, 20, 40];
const TURN_GAIN = 1.05;
/** Kandidaten je Item höchstens */
const MAX_CANDS = 10;
/** Kleinere Größen, die probiert werden (Faktor je Schritt, Schritte) */
const SHRINK = 0.86, SHRINK_STEPS = 7;
/** Toleranz: so viel der Buchstabenfläche muss insgesamt in der Hülle des Items liegen, … */
const MIN_INSIDE = 0.6;
/** … so viel auf echtem Land, höchstens so viel auf Land anderer Staaten … */
const MIN_LAND = 0.4, MAX_FOREIGN = 0.2;
/** … und kein Buchstabe weiter als so viele Schrifthöhen von der Hülle entfernt */
const MAX_OUT = 0.6;
/** Bezugsansicht: Größe des Items (px) und Rasterzelle der Maske (px) */
const REF_PX = 260, CELL_PX = 2;
/** Inseln gehören zum Namen, wenn sie höchstens so viele „Durchmesser“ des Hauptteils entfernt liegen */
const NEAR = 1.2;
/** Höhe der Versalien (Anteil der Schriftgröße), für den Buchstabenrahmen */
export const CAP = 0.74;

/**
 * Mögliche Namen eines Items, bevorzugte zuerst: [{glyphs: [{ch, ll, dir, hw}], em, rank}]
 * @param {{kind: string, text: string, geometry: object}} f  Item: Ebene, Name (Versalien), Umriss
 * @param {object[]} neighbours  Umrisse der Nachbarstaaten (fremdes Land unter dem Namen)
 * @param {string} projection  Id der Projektion (projection-defs.js)
 * @param {{canvas: (w: number, h: number) => HTMLCanvasElement|OffscreenCanvas,
 *          measure: (font: string, text: string) => number}} env  Rasterfläche und Textbreite
 */
export function candidates(f, neighbours, projection, env) {
  const parts = mainParts(f);
  if (!parts) return [];
  const { geom } = parts;
  // 0 … 1: wie sehr das Item als Inselstaat gilt
  const isl = Math.min(1, Math.max(0, (parts.islands - ISLANDS_MIN) / (ISLANDS_FULL - ISLANDS_MIN)));
  const mix = ([a, b]) => a + (b - a) * isl;
  const lon0 = d3.geoCentroid(geom)[0];
  const proj = PROJECTION_DEFS[projection].d3().rotate([-lon0, 0]).translate([0, 0]).scale(1);
  const [[a0, b0], [a1, b1]] = d3.geoPath(proj).bounds(geom);
  const ext = Math.max(a1 - a0, b1 - b0);
  if (!(ext > 0)) return [];
  const scale = REF_PX / ext;
  proj.scale(scale);
  const mask = makeMask(proj, geom, mix(CLOSE), neighbours, env);
  const main = mask && analyse(mask);
  if (!main) return [];
  const text = [...f.text];
  if (text.length < 2) return [];
  const font = fontFor(f.kind, 100);
  const adv100 = text.map((ch) => env.measure(font, ch));
  const lim = (MAX_ANGLE * Math.PI) / 180;
  const shapes = [main];
  for (const d of isl > 0 ? TURNS : []) {
    const ang = main.ang + (d * Math.PI) / 180;
    if (Math.abs(ang) > lim) continue;
    const sh = analyse(mask, ang);
    if (sh) shapes.push(sh);
  }
  const out = [];
  const overrun = mix(OVERRUN);
  for (const shape of shapes) out.push(...sized(f, text, adv100, shape, mask, proj, scale, shape === main, overrun));
  // größte zuerst
  out.sort((a, b) => b.rank - a.rank);
  return out.slice(0, MAX_CANDS);
}


/** Kandidaten einer Richtung in abnehmender Größe */
function sized(f, text, adv100, shape, mask, proj, scale, isMain, overrun) {
  const [minTr, maxTr] = TRACK[f.kind];
  const w100 = adv100.reduce((a, b) => a + b, 0);
  const gaps = text.length - 1;
  const target = FILL * shape.length;
  let px = Math.min(THICK * shape.thick, Math.max(target, overrun * shape.length) / (w100 / 100 + gaps * minTr));
  const out = [];
  for (let step = 0; step < SHRINK_STEPS; step++, px *= SHRINK) {
    const track = Math.min(maxTr, Math.max(minTr, (target - (w100 * px) / 100) / (gaps * px)));
    const advances = adv100.map((a) => (a * px) / 100);
    for (const shift of SHIFTS) {
      const glyphs = placeOnCurve(shape.curve(shift, Math.max(1, overrun)), advances, track * px);
      if (!glyphs || !fits(glyphs, text, advances, (CAP * px) / 2, mask)) continue;
      const geo = [];
      for (let i = 0; i < glyphs.length; i++) {
        if (text[i] === " ") continue;
        const g = glyphs[i];
        const ll = proj.invert([g.x, g.y]);
        const dir = proj.invert([g.x + Math.cos(g.ang) * px * 0.25, g.y + Math.sin(g.ang) * px * 0.25]);
        if (!ll || !dir || !Number.isFinite(ll[0]) || !Number.isFinite(dir[0])) { geo.length = 0; break; }
        geo.push({ ch: text[i], ll, dir, hw: advances[i] / 2 / scale });
      }
      // Rang fürs Sortieren: schräge Richtungen nur, wenn sie spürbar größer sind als die Hauptachse
      if (geo.length) out.push({ glyphs: geo, em: px / scale, rank: (px / scale) / (isMain ? 1 : TURN_GAIN) });
      break; // je Größe die erste passende Linie
    }
  }
  return out;
}

/**
 * Item in der Bezugsansicht als Maske: Land und Hülle (Land samt Meerengen und Buchten bis zur Breite
 * close · REF_PX, morphologisch geschlossen, ohne fremdes Land), fremdes Land, Abstand zur Hülle
 */
function makeMask(proj, geom, close, neighbours, env) {
  const [[bx0, by0], [bx1, by1]] = d3.geoPath(proj).bounds(geom);
  const r = Math.round((close * REF_PX) / 2 / CELL_PX); // Radius in Zellen (schließt Lücken bis 2 r)
  const pad = 0.15 * REF_PX + (r + 2) * CELL_PX;
  const x0 = bx0 - pad, y0 = by0 - pad;
  const cw = Math.ceil((bx1 - bx0 + 2 * pad) / CELL_PX), ch = Math.ceil((by1 - by0 + 2 * pad) / CELL_PX);
  const canvas = env.canvas(cw, ch);
  const g = canvas.getContext("2d", { willReadFrequently: true });
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cw, ch);
  g.setTransform(1 / CELL_PX, 0, 0, 1 / CELL_PX, -x0 / CELL_PX, -y0 / CELL_PX);
  g.beginPath();
  d3.geoPath(proj, g)(geom);
  g.fillStyle = "#000";
  g.fill();
  const data = g.getImageData(0, 0, cw, ch).data;
  const m = new Uint8Array(cw * ch);
  for (let i = 0; i < m.length; i++) m[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  // fremdes Land (Nachbarstaaten)
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, cw, ch);
  g.setTransform(1 / CELL_PX, 0, 0, 1 / CELL_PX, -x0 / CELL_PX, -y0 / CELL_PX);
  g.beginPath();
  const path = d3.geoPath(proj, g);
  for (const o of neighbours) path(o);
  g.fill();
  const fdata = g.getImageData(0, 0, cw, ch).data;
  const foreign = new Uint8Array(cw * ch);
  for (let i = 0; i < m.length; i++) foreign[i] = !m[i] && fdata[i * 4 + 3] > 127 ? 1 : 0;
  // Hülle = Land, um r ausgedehnt und wieder um r geschrumpft
  const grown = distanceField(m, cw, ch);
  const out = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) out[i] = grown[i] <= r ? 0 : 1;
  const toOut = distanceField(out, cw, ch);
  const hull = new Uint8Array(m.length);
  for (let i = 0; i < m.length; i++) hull[i] = m[i] || (grown[i] <= r && toOut[i] > r && !foreign[i]) ? 1 : 0;
  const dist = distanceField(hull, cw, ch);
  const cell = CELL_PX;
  const idx = (x, y) => {
    const i = Math.floor((x - x0) / cell), j = Math.floor((y - y0) / cell);
    return i >= 0 && j >= 0 && i < cw && j < ch ? j * cw + i : -1;
  };
  return {
    m: hull, cw, ch, x0, y0, cell,
    /** Punkt auf Land des Items */
    at(x, y) { const i = idx(x, y); return i >= 0 && m[i] === 1; },
    /** Punkt auf Land eines anderen Staates */
    onForeign(x, y) { const i = idx(x, y); return i >= 0 && foreign[i] === 1; },
    /** Punkt in der Hülle */
    inHull(x, y) { const i = idx(x, y); return i >= 0 && hull[i] === 1; },
    /** Abstand zur Hülle in px (außerhalb der Maske: unendlich) */
    dist(x, y) { const i = idx(x, y); return i < 0 ? Infinity : dist[i] * cell; },
  };
}

/** Länge/Breite-Rahmen [w, s, e, n] eines Items (zwischengespeichert; über die Datumsgrenze: ganze Breite) */
export function geoBox(f) {
  if (!f._geoBox) {
    const [[w, s], [e, n]] = d3.geoBounds(f.geometry);
    f._geoBox = e >= w ? [w, s, e, n] : [-180, s, 180, n];
  }
  return f._geoBox;
}

export function fontFor(kind, px) {
  return `${WEIGHT[kind]} ${px.toFixed(2)}px ${LABEL_FONT}`;
}

/**
 * Hauptteil des Items samt naher Inseln (Griechenland mit Kreta und den Kykladen; die USA ohne Alaska und
 * Hawaii) als MultiPolygon, dazu der Inselanteil (Fläche außerhalb des größten Teils, 0 … 1)
 */
function mainParts(f) {
  const g = f.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  const parts = polys.map((c) => {
    const p = { type: "Polygon", coordinates: c };
    const a = d3.geoArea(p);
    return a < 2 * Math.PI ? { c, a, center: d3.geoCentroid(p) } : null;
  }).filter(Boolean);
  if (!parts.length) return null;
  const main = parts.reduce((m, p) => (p.a > m.a ? p : m));
  const reach = NEAR * 2 * Math.sqrt(main.a / Math.PI);
  const near = parts.filter((p) => p === main || d3.geoDistance(p.center, main.center) <= reach + 2 * Math.sqrt(p.a / Math.PI));
  const total = near.reduce((sum, p) => sum + p.a, 0);
  return { geom: { type: "MultiPolygon", coordinates: near.map((p) => p.c) }, islands: 1 - main.a / total };
}

/** Abstand jeder Zelle zur nächsten Zelle im Item (Zellen; Chamfer 3-4) */
function distanceField(m, cw, ch) {
  const INF = 1e9, d = new Float32Array(cw * ch);
  for (let i = 0; i < d.length; i++) d[i] = m[i] ? 0 : INF;
  const at = (i, j) => (i < 0 || j < 0 || i >= cw || j >= ch ? INF : d[j * cw + i]);
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    const k = j * cw + i;
    d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.4, at(i + 1, j - 1) + 1.4);
  }
  for (let j = ch - 1; j >= 0; j--) for (let i = cw - 1; i >= 0; i--) {
    const k = j * cw + i;
    d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.4, at(i - 1, j + 1) + 1.4);
  }
  return d;
}

/** Toleranztest: genug der Buchstaben in der Hülle und auf Land, keiner zu weit weg */
function fits(glyphs, text, advances, hh, mask) {
  let inside = 0, land = 0, alien = 0, total = 0;
  for (let i = 0; i < glyphs.length; i++) {
    if (text[i] === " ") continue;
    const g = glyphs[i];
    const c = Math.cos(g.ang), s = Math.sin(g.ang), hw = advances[i] / 2;
    if (mask.dist(g.x, g.y) > MAX_OUT * 2 * hh) return false;
    for (const u of [-hw, 0, hw]) for (const v of [-hh, 0, hh]) {
      total++;
      const x = g.x + u * c - v * s, y = g.y + u * s + v * c;
      if (mask.inHull(x, y)) inside++;
      if (mask.at(x, y)) land++;
      else if (mask.onForeign(x, y)) alien++;
    }
  }
  return total > 0 && inside / total >= MIN_INSIDE && land / total >= MIN_LAND && alien / total <= MAX_FOREIGN;
}

/**
 * Form der Maske: Hauptachse, Länge und Dicke des tragenden Abschnitts und die ausgeglichene Mittellinie
 * als Kurve in Pixeln der Bezugsansicht (65 Punkte, von links nach rechts), quer verschiebbar.
 */
function analyse({ m, cw, ch, x0, y0, cell }, forced) {
  let n = 0, sx = 0, sy = 0;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) if (m[j * cw + i]) { n++; sx += i; sy += j; }
  if (n < 12) return null;
  const mx = sx / n, my = sy / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    if (!m[j * cw + i]) continue;
    const dx = i - mx, dy = j - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  const tr = sxx + syy, det = sxx * syy - sxy * sxy;
  const l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = tr - l1;
  let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  if (l2 <= 0 || Math.sqrt(l1 / l2) < ELONGATED) ang = 0;
  if (forced !== undefined) ang = forced;
  if (Math.cos(ang) < 0) ang += Math.PI; // Leserichtung links → rechts
  if (ang > Math.PI) ang -= 2 * Math.PI;
  const lim = (MAX_ANGLE * Math.PI) / 180;
  ang = Math.max(-lim, Math.min(lim, ang));
  const ax = Math.cos(ang), ay = Math.sin(ang), nx = -ay, ny = ax;

  // Querschnitte senkrecht zur Achse (Einheit: Zellen): je Schnitt der längste zusammenhängende Lauf
  // durch die Fläche – so läuft die Mittellinie bei eingebuchteten Formen (Hudson Bay) nicht übers Meer
  let umin = Infinity, umax = -Infinity, vmin = Infinity, vmax = -Infinity;
  for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
    if (!m[j * cw + i]) continue;
    const u = (i - mx) * ax + (j - my) * ay, v = (i - mx) * nx + (j - my) * ny;
    if (u < umin) umin = u;
    if (u > umax) umax = u;
    if (v < vmin) vmin = v;
    if (v > vmax) vmax = v;
  }
  const K = 32, bw = (umax - umin) / K || 1;
  const thick = new Float64Array(K), mid = new Float64Array(K);
  const inside = (u, v) => {
    const i = Math.round(mx + u * ax + v * nx), j = Math.round(my + u * ay + v * ny);
    return i >= 0 && j >= 0 && i < cw && j < ch && m[j * cw + i] === 1;
  };
  for (let b = 0; b < K; b++) {
    const u = umin + (b + 0.5) * bw;
    let run = 0, start = 0;
    for (let v = vmin - 1; v <= vmax + 1; v += 0.5) {
      if (inside(u, v)) {
        if (run === 0) start = v;
        run += 0.5;
        if (run > thick[b]) { thick[b] = run; mid[b] = start + run / 2; }
      } else run = 0;
    }
  }
  let peak = 0;
  for (let b = 1; b < K; b++) if (thick[b] > thick[peak]) peak = b;
  let lo = peak, hi = peak;
  while (lo > 0 && thick[lo - 1] >= 0.3 * thick[peak]) lo--;
  while (hi < K - 1 && thick[hi + 1] >= 0.3 * thick[peak]) hi++;
  const uLo = umin + lo * bw, uHi = umin + (hi + 1) * bw;
  const uc = (uLo + uHi) / 2, half = (uHi - uLo) / 2;

  // Mittellinie v(t) = a t² + b t + c, t ∈ [-1, 1], gewichtet mit der Dicke
  const S = new Float64Array(5), T = new Float64Array(3);
  const ts = [];
  for (let b = lo; b <= hi; b++) {
    const t = (umin + (b + 0.5) * bw - uc) / half, v = mid[b], wgt = thick[b];
    ts.push(thick[b]);
    for (let k = 0; k < 5; k++) S[k] += wgt * t ** k;
    for (let k = 0; k < 3; k++) T[k] += wgt * v * t ** k;
  }
  let [c, bl, a] = solve3([[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]], [T[0], T[1], T[2]]) ?? [0, 0, 0];
  const bend = MAX_BEND * 2 * half;
  a = Math.max(-bend, Math.min(bend, a));
  bl = Math.max(-half * 0.35, Math.min(half * 0.35, bl));
  ts.sort((p, q) => p - q);
  const med = ts[Math.floor(ts.length / 2)];
  /** Kurve, um `shift` (Anteil der Dicke) quer zur Achse verschoben, auf das `reach`-fache verlängert */
  const curve = (shift, reach = 1) => {
    const pts = [];
    for (let k = 0; k <= 64; k++) {
      const t = reach * (-1 + (2 * k) / 64), u = uc + t * half, v = a * t * t + bl * t + c + shift * med;
      const gx = mx + u * ax + v * nx, gy = my + u * ay + v * ny;
      pts.push([x0 + (gx + 0.5) * cell, y0 + (gy + 0.5) * cell]);
    }
    return pts;
  };
  return { ang, curve, length: 2 * half * cell, thick: med * cell };
}

/** Buchstabenmitten und -winkel entlang der Kurve, mittig; null, wenn der Name länger ist als die Kurve */
function placeOnCurve(curve, advances, track) {
  const cum = [0];
  for (let i = 1; i < curve.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]));
  }
  const total = cum[cum.length - 1];
  const len = advances.reduce((s, a) => s + a, 0) + track * (advances.length - 1);
  if (len > total) return null;
  let s = (total - len) / 2;
  const out = [];
  let k = 1;
  for (const adv of advances) {
    const mid = s + adv / 2;
    while (k < cum.length - 1 && cum[k] < mid) k++;
    const [ax, ay] = curve[k - 1], [bx, by] = curve[k];
    const t = (mid - cum[k - 1]) / (cum[k] - cum[k - 1] || 1);
    out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, ang: Math.atan2(by - ay, bx - ax) });
    s += adv + track;
  }
  return out;
}

/** 3×3-Gleichungssystem (Gauß) */
function solve3(A, bv) {
  const M = A.map((r, i) => [...r, bv[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    if (Math.abs(M[p][i]) < 1e-9) return null;
    [M[i], M[p]] = [M[p], M[i]];
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const q = M[r][i] / M[i][i];
      for (let k = i; k < 4; k++) M[r][k] -= q * M[i][k];
    }
  }
  return M.map((r, i) => r[3] / r[i]);
}
