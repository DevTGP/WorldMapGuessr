// Namen eingesetzter Items auf der Karte (Kontinente, Staaten, später Bundesländer) – im Stil der
// Paradox-Karten (Victoria 3): Versalien einer Antiqua, gesperrt, entlang der Form des Items gebogen und so
// groß, wie das Item es hergibt.
//
// Je Item wird sein größter Teil in eine kleine Maske gerastert (nur der sichtbare Ausschnitt). Die
// Hauptachse der Fläche gibt die Richtung, die Mitten der Querschnitte entlang dieser Achse die Biegung
// (quadratisch ausgeglichen, Biegung begrenzt). Die Schrift füllt einen festen Anteil der Länge: Die Höhe
// begrenzt die Dicke des Items, den Rest füllt die Sperrung. Jeder Buchstabe muss in der Maske liegen und
// darf keinen anderen Namen berühren – sonst wird die Schrift kleiner. Passt der gebogene Name gar nicht,
// bleibt die gerade Beschriftung am „Pol der Unerreichbarkeit“ (ggf. zweizeilig). Reihenfolge der Vergabe:
// Kontinente vor Staaten vor Bundesländern, innerhalb einer Ebene größere Items zuerst.
//
// Das Rechnen kostet etwas – es läuft nur im Stillstand. Während die Karte bewegt wird, bleiben die zuletzt
// gewählten Namen stehen: Jeder Buchstabe hängt an seinem Punkt in Länge/Breite, die Schrift wächst mit dem
// Zoom mit.

import { stageColor, stopsFor } from "./schemes.js";

const KIND_RANK = { continent: 0, country: 1, state: 2 };
export const LABEL_FONT = '"Cinzel", "Cormorant SC", Georgia, "Times New Roman", serif';
const WEIGHT = { continent: 600, country: 700, state: 600 };
/** Schriftgröße (px) je Ebene: [kleinste, größte] */
const FONT_PX = { continent: [11, 26], country: [9, 46], state: [8.5, 26] };
/** Sperrung (Anteil der Schriftgröße) je Ebene: [kleinste, größte] */
const TRACK = { continent: [0.3, 1.1], country: [0.08, 0.9], state: [0.06, 0.5] };
/** Anteil der Achsenlänge, den ein gebogener Name füllt */
const FILL = 0.74;
/** Schrifthöhe höchstens dieser Anteil der Dicke des Items */
const THICK = 0.52;
/** Größte Biegung: Pfeilhöhe des Bogens / Länge */
const MAX_BEND = 0.16;
/** Steiler als so (Grad) steht kein Name */
const MAX_ANGLE = 65;
/** Passt der Name auf der Mittellinie nicht, wird sie quer verschoben (Anteile der Dicke) */
const SHIFTS = [0, 0.18, -0.18, 0.34, -0.34];
/** Ab diesem Verhältnis der Hauptachsen folgt der Name der Form, darunter liegt er waagerecht */
const ELONGATED = 1.35;
/** Längste Seite der Maske in Zellen */
const MASK_CELLS = 110;
/** Höhe der Versalien (Anteil der Schriftgröße), für den Buchstabenrahmen */
const CAP = 0.74;
/** Gerade Beschriftung: Schrittweite und Zeilenhöhe */
const FONT_STEP = 1.5;
const LINE_HEIGHT = 1.15;
/** Abstand zwischen zwei Namen (px) */
const GAP_PX = 3;
/** Kontinentnamen entfallen, wenn der Kontinent mehr als so viele Bildschirmgrößen überspannt */
const CONTINENT_MAX_SCREENS = 1.6;
/** Rand des Textrahmens, der noch im Item liegen muss (px) */
const INSET_PX = 1;

export class LabelLayer {
  /** @param {(key: string) => object|undefined} itemOf */
  constructor(itemOf) {
    this.itemOf = itemOf;
    /** [{kind: "arc", glyphs: [{ch, ll, ang}], …} | {kind: "lines", lines, …}] */
    this.layout = [];
    this.layoutKey = "";
    this._canvas = null;
  }

  /** Neu auslegen (z. B. wenn die Schrift nachgeladen wurde) */
  invalidate() { this.layoutKey = ""; }

  /**
   * Namen zeichnen
   * @param {CanvasRenderingContext2D} ctx
   * @param {d3.GeoProjection} projection
   * @param {{w: number, h: number}} size
   * @param {Iterable<string>} placed  eingesetzte Item-Keys
   * @param {(key: string) => number} stageOf  Einsetz-Stufe der Landfläche unter dem Namen (0 … 3)
   * @param {object} scheme  aktuelles Farbschema
   * @param {boolean} moving
   */
  draw(ctx, projection, size, placed, stageOf, scheme, moving) {
    const keys = [...placed];
    const [tx, ty] = projection.translate();
    const key = `${keys.join(",")}|${projection.scale()}|${tx}|${ty}|${projection.rotate()[0]}|${size.w}x${size.h}|${scheme.label}`;
    if (!moving && key !== this.layoutKey) {
      this.layout = this._layout(ctx, projection, size, keys, stageOf, scheme);
      this.layoutKey = key;
    }
    const scale = projection.scale();
    ctx.save();
    const base = ctx.getTransform();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const l of this.layout) {
      const px = l.px * (scale / l.scale);
      ctx.font = fontFor(l.item.kind, px);
      ctx.lineWidth = Math.min(4, Math.max(2, px / 5));
      ctx.strokeStyle = l.halo;
      ctx.fillStyle = l.color;
      ctx.globalAlpha = l.alpha;
      if (l.type === "arc") {
        for (const g of l.glyphs) {
          const p = projection(g.ll);
          if (!p) continue;
          ctx.setTransform(base); // Grundtransformation (Pixeldichte) behalten
          ctx.translate(p[0], p[1]);
          ctx.rotate(g.ang);
          ctx.strokeText(g.ch, 0, 0);
          ctx.fillText(g.ch, 0, 0);
        }
        ctx.setTransform(base);
      } else {
        const p = projection(l.item.labelPoint);
        if (!p) continue;
        const lh = px * LINE_HEIGHT;
        l.lines.forEach((text, i) => {
          const y = p[1] + (i - (l.lines.length - 1) / 2) * lh;
          ctx.strokeText(text, p[0], y);
          ctx.fillText(text, p[0], y);
        });
      }
    }
    ctx.restore();
  }

  _layout(ctx, projection, { w, h }, keys, stageOf, scheme) {
    const scale = projection.scale();
    const items = keys.map((k) => this.itemOf(k)).filter((f) => f && KIND_RANK[f.kind] !== undefined)
      .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.geom.area - a.geom.area);
    const taken = []; // belegte Rahmen [x0, y0, x1, y1]
    const out = [];
    ctx.save();
    for (const f of items) {
      const extent = Math.sqrt(f.geom.area) * scale;
      if (extent < 12) continue; // winzig: kein Platz für einen Namen
      if (f.kind === "continent" && extent > CONTINENT_MAX_SCREENS * Math.max(w, h)) continue;
      labelPointOf(f);
      const placed = this._arc(ctx, projection, f, taken, w, h) ?? this._straight(ctx, projection, f, taken, w, h);
      if (!placed) continue;
      taken.push(...placed.boxes);
      const bg = d3.rgb(stageColor(stopsFor(scheme, f.kind === "continent" ? f.key : `continent:${f.properties.region}`),
        stageOf(f.key) + (f.kind === "continent" && this._placedUnder(f, keys) ? 1 : 0)));
      const dark = luminance(bg) > 0.42;
      out.push({
        ...placed, item: f, scale,
        // große Namen liegen wie gedruckt auf der Karte, kleine bleiben kräftig
        alpha: placed.px > 22 ? 0.72 : placed.px > 14 ? 0.84 : 0.95,
        color: dark ? "rgb(28, 24, 20)" : "rgb(250, 244, 230)",
        halo: dark ? "rgba(255, 250, 238, 0.45)" : "rgba(10, 12, 16, 0.55)",
      });
    }
    ctx.restore();
    return out;
  }

  /** Liegt unter dem Kontinentnamen ein eingesetzter Staat (hellere Stufe → andere Schriftfarbe)? */
  _placedUnder(continent, keys) {
    return keys.some((k) => {
      const c = this.itemOf(k);
      return c?.kind === "country" && c.properties.region === continent.id &&
        d3.geoContains(c.fitGeometry ?? c.geometry, continent.labelPoint);
    });
  }

  /** Gebogener Name entlang der Form; null, wenn er nicht passt */
  _arc(ctx, projection, f, taken, w, h) {
    const mask = this._mask(projection, f, w, h);
    if (!mask) return null;
    const shape = analyse(mask);
    if (!shape) return null;
    const text = [...displayName(f)];
    if (text.length < 2) return null;
    const [minPx, maxPx] = FONT_PX[f.kind];
    const [minTr, maxTr] = TRACK[f.kind];
    ctx.font = fontFor(f.kind, 100);
    const adv100 = text.map((ch) => ctx.measureText(ch).width);
    const w100 = adv100.reduce((a, b) => a + b, 0);
    const gaps = text.length - 1;
    const target = FILL * shape.length;
    // Kleine Items: lieber fast die ganze Länge füllen als gar kein Name
    const fill = target / (w100 / 100 + gaps * minTr), most = (0.95 * shape.length) / (w100 / 100 + gaps * minTr);
    let px = Math.min(maxPx, THICK * shape.thick, Math.max(fill, Math.min(most, minPx)));
    for (; px >= minPx; px *= 0.86) {
      const track = Math.min(maxTr, Math.max(minTr, (target - (w100 * px) / 100) / (gaps * px)));
      const advances = adv100.map((a) => (a * px) / 100);
      for (const shift of SHIFTS) {
        const glyphs = placeOnCurve(shape.curve(shift), advances, track * px);
        if (!glyphs) break;
        const boxes = glyphBoxes(glyphs, text, advances, (CAP * px) / 2, mask, taken);
        if (!boxes) continue;
        const out = [];
        for (let i = 0; i < glyphs.length; i++) {
          if (text[i] === " ") continue;
          const ll = projection.invert([glyphs[i].x, glyphs[i].y]);
          if (!ll || !Number.isFinite(ll[0])) return null;
          out.push({ ch: text[i], ll, ang: glyphs[i].ang });
        }
        return { type: "arc", glyphs: out, px, boxes };
      }
    }
    return null;
  }

  /** Größter Teil des Items als Maske im sichtbaren Ausschnitt */
  _mask(projection, f, w, h) {
    const [[bx0, by0], [bx1, by1]] = d3.geoPath(projection).bounds(f.labelPoly);
    if (bx1 < 0 || by1 < 0 || bx0 > w || by0 > h) return null;
    // Ganze Fläche, solange sie nicht viel größer als das Bild ist – so steht der Name fest und darf über
    // den Rand ragen; sonst nur der sichtbare Ausschnitt
    const whole = bx1 - bx0 <= 1.5 * w && by1 - by0 <= 1.5 * h;
    const x0 = whole ? bx0 : Math.max(bx0, 0), y0 = whole ? by0 : Math.max(by0, 0);
    const x1 = whole ? bx1 : Math.min(bx1, w), y1 = whole ? by1 : Math.min(by1, h);
    if (!(x1 - x0 > 10 && y1 - y0 > 6)) return null;
    const cell = Math.max(1, Math.max(x1 - x0, y1 - y0) / MASK_CELLS);
    const cw = Math.ceil((x1 - x0) / cell), ch = Math.ceil((y1 - y0) / cell);
    const canvas = this._canvas ??= document.createElement("canvas");
    if (canvas.width < cw) canvas.width = cw;
    if (canvas.height < ch) canvas.height = ch;
    const g = canvas.getContext("2d", { willReadFrequently: true });
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.setTransform(1 / cell, 0, 0, 1 / cell, -x0 / cell, -y0 / cell);
    g.beginPath();
    d3.geoPath(projection, g)(f.labelPoly);
    g.fillStyle = "#000";
    g.fill();
    const data = g.getImageData(0, 0, cw, ch).data;
    const m = new Uint8Array(cw * ch);
    for (let i = 0; i < m.length; i++) m[i] = data[i * 4 + 3] > 127 ? 1 : 0;
    return {
      m, cw, ch, x0, y0, cell,
      at(x, y) {
        const i = Math.floor((x - x0) / cell), j = Math.floor((y - y0) / cell);
        return i >= 0 && j >= 0 && i < cw && j < ch && m[j * cw + i] === 1;
      },
    };
  }

  /** Gerade Beschriftung: größte Schrift (ein- oder zweizeilig), deren Rahmen im Item liegt und frei ist */
  _straight(ctx, projection, f, taken, w, h) {
    const p = projection(f.labelPoint);
    if (!p || p[0] < -50 || p[1] < -50 || p[0] > w + 50 || p[1] > h + 50) return null;
    const [x, y] = p;
    const [min] = FONT_PX[f.kind];
    const max = Math.max(min, FONT_PX[f.kind][0] + 4);
    const name = displayName(f);
    const variants = [[name], ...splitTwo(name)];
    for (let px = max; px >= min; px -= FONT_STEP) {
      ctx.font = fontFor(f.kind, px);
      for (const lines of variants) {
        const tw = Math.max(...lines.map((s) => ctx.measureText(s).width));
        const th = lines.length * px * LINE_HEIGHT;
        const box = [x - tw / 2, y - th / 2, x + tw / 2, y + th / 2];
        if (box[2] < 0 || box[3] < 0 || box[0] > w || box[1] > h) return null; // außerhalb des Bildes
        if (taken.some((b) => overlaps(b, box))) continue;
        if (!insideBox(projection, f, box)) continue;
        return { type: "lines", lines, px, boxes: [box] };
      }
    }
    return null;
  }
}

function fontFor(kind, px) {
  return `${WEIGHT[kind]} ${px}px ${LABEL_FONT}`;
}

function displayName(f) {
  return f.properties.name.toLocaleUpperCase();
}

/**
 * Form der Maske: Hauptachse, Länge und Dicke des tragenden Abschnitts und die ausgeglichene Mittellinie
 * als Kurve in Bildschirm-Pixeln (64 Punkte, von links nach rechts).
 */
function analyse({ m, cw, ch, x0, y0, cell }) {
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
  /** Kurve, um `shift` (Anteil der Dicke) quer zur Achse verschoben */
  const curve = (shift) => {
    const pts = [];
    for (let k = 0; k <= 64; k++) {
      const t = -1 + (2 * k) / 64, u = uc + t * half, v = a * t * t + bl * t + c + shift * med;
      const gx = mx + u * ax + v * nx, gy = my + u * ay + v * ny;
      pts.push([x0 + (gx + 0.5) * cell, y0 + (gy + 0.5) * cell]);
    }
    return pts;
  };
  return { curve, length: 2 * half * cell, thick: med * cell };
}

/** Rahmen der Buchstaben; null, wenn einer aus der Fläche ragt oder einen anderen Namen berührt */
function glyphBoxes(glyphs, text, advances, hh, mask, taken) {
  const boxes = [];
  for (let i = 0; i < glyphs.length; i++) {
    if (text[i] === " ") continue;
    const g = glyphs[i];
    const c = Math.cos(g.ang), s = Math.sin(g.ang), hw = advances[i] / 2;
    const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh], [0, 0]]
      .map(([u, v]) => [g.x + u * c - v * s, g.y + u * s + v * c]);
    if (!pts.every(([x, y]) => mask.at(x, y))) return null;
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    if (taken.some((b) => overlaps(b, box))) return null;
    boxes.push(box);
  }
  return boxes;
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

/** Zweizeilige Varianten: an Leerzeichen bzw. Bindestrich, die Trennstelle nahe der Mitte zuerst */
function splitTwo(name) {
  const cuts = [];
  for (let i = 1; i < name.length - 1; i++) {
    if (name[i] === " ") cuts.push([name.slice(0, i), name.slice(i + 1)]);
    else if (name[i] === "-") cuts.push([name.slice(0, i + 1), name.slice(i + 1)]);
  }
  return cuts.sort((a, b) => Math.abs(a[0].length - a[1].length) - Math.abs(b[0].length - b[1].length)).slice(0, 2);
}

function overlaps(a, b) {
  return a[0] - GAP_PX < b[2] && b[0] - GAP_PX < a[2] && a[1] - GAP_PX < b[3] && b[1] - GAP_PX < a[3];
}

/** Liegen Ecken, Kantenmitten und Mitte des Rahmens im größten Teil des Items? */
function insideBox(projection, f, [x0, y0, x1, y1]) {
  x0 += INSET_PX; y0 += INSET_PX; x1 -= INSET_PX; y1 -= INSET_PX;
  const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  const pts = [[x0, y0], [xm, y0], [x1, y0], [x0, ym], [xm, ym], [x1, ym], [x0, y1], [xm, y1], [x1, y1]];
  // lange Namen: zusätzliche Punkte entlang der Ober- und Unterkante
  const extra = Math.floor((x1 - x0) / 40);
  for (let i = 1; i <= extra; i++) {
    const x = x0 + ((x1 - x0) * i) / (extra + 1);
    pts.push([x, y0], [x, y1]);
  }
  for (const p of pts) {
    const ll = projection.invert(p);
    if (!ll || !Number.isFinite(ll[0])) return false;
    const back = projection(ll);
    if (!back || Math.hypot(back[0] - p[0], back[1] - p[1]) > 0.5) return false; // außerhalb der Weltkugel
    if (!d3.geoContains(f.labelPoly, ll)) return false;
  }
  return true;
}

/** Relative Helligkeit (0 … 1) */
function luminance({ r, g, b }) {
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Namenspunkt eines Items (einmalig, aus der Startstufe): Pol der Unerreichbarkeit des größten Teils,
 * gerechnet in Länge × cos(Breite) / Breite. Setzt feature.labelPoint und feature.labelPoly.
 */
export function labelPointOf(f) {
  if (f.labelPoint) return f.labelPoint;
  const polys = (f.fitGeometry ?? f.geometry).coordinates;
  let best = null, bestArea = -1;
  for (const poly of polys) {
    const a = d3.geoArea({ type: "Polygon", coordinates: poly });
    if (a > bestArea && a < 2 * Math.PI) { bestArea = a; best = poly; }
  }
  if (!best) { f.labelPoint = f.geom.anchor; f.labelPoly = f.geometry; return f.labelPoint; }
  f.labelPoly = { type: "Polygon", coordinates: best };
  // Über die Datumsgrenze (Russland, Fidschi): westliche Längen um 360° verschieben. Pol-Polygone
  // (Antarktika) sind in Länge/Breite nicht sinnvoll eben – dort bleibt der Anker.
  const span = (rings) => { const l = rings[0].map((q) => q[0]); return Math.max(...l) - Math.min(...l); };
  let rings = best;
  if (span(rings) > 180) rings = rings.map((r) => r.map(([x, y]) => [x < 0 ? x + 360 : x, y]));
  let p = span(rings) > 300 ? null : polylabel(rings, 0.05);
  if (p && p[0] > 180) p = [p[0] - 360, p[1]];
  f.labelPoint = p && d3.geoContains(f.labelPoly, p) ? p : f.geom.anchor;
  return f.labelPoint;
}

/**
 * Pol der Unerreichbarkeit (Algorithmus von Mapbox „polylabel“, ISC-Lizenz) für einen Ring-Satz in
 * Länge/Breite; Länge wird mit cos(mittlere Breite) gestaucht, damit Abstände ungefähr stimmen.
 */
function polylabel(rings, precision) {
  const outer = rings[0];
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of outer) { if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
  const pr = rings.map((r) => r.map(([x, y]) => [x * k, y]));
  let minX = Infinity, maxX = -Infinity;
  for (const [x] of pr[0]) { if (x < minX) minX = x; if (x > maxX) maxX = x; }
  const width = maxX - minX, height = maxY - minY;
  const cellSize = Math.min(width, height);
  if (cellSize === 0) return [minX / k, minY];
  let h = cellSize / 2;

  const queue = [];
  const push = (c) => { queue.push(c); };
  const pop = () => {
    let bi = 0;
    for (let i = 1; i < queue.length; i++) if (queue[i].max > queue[bi].max) bi = i;
    return queue.splice(bi, 1)[0];
  };
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) push(cell(x + h, y + h, h, pr));
  }
  let best = centroidCell(pr);
  const bbox = cell(minX + width / 2, minY + height / 2, 0, pr);
  if (bbox.d > best.d) best = bbox;
  let guard = 0;
  while (queue.length && guard++ < 5000) {
    const c = pop();
    if (c.d > best.d) best = c;
    if (c.max - best.d <= precision) continue;
    h = c.h / 2;
    push(cell(c.x - h, c.y - h, h, pr));
    push(cell(c.x + h, c.y - h, h, pr));
    push(cell(c.x - h, c.y + h, h, pr));
    push(cell(c.x + h, c.y + h, h, pr));
  }
  return [best.x / k, best.y];
}

function cell(x, y, h, rings) {
  const d = pointToPolygonDist(x, y, rings);
  return { x, y, h, d, max: d + h * Math.SQRT2 };
}

function centroidCell(rings) {
  const pts = rings[0];
  let area = 0, x = 0, y = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j], f = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * f; y += (a[1] + b[1]) * f; area += f * 3;
  }
  return area === 0 ? cell(pts[0][0], pts[0][1], 0, rings) : cell(x / area, y / area, 0, rings);
}

/** Vorzeichenbehafteter Abstand zum Rand (positiv innen) */
function pointToPolygonDist(x, y, rings) {
  let inside = false, minSq = Infinity;
  for (const ring of rings) {
    for (let i = 0, len = ring.length, j = len - 1; i < len; j = i++) {
      const a = ring[i], b = ring[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
      minSq = Math.min(minSq, segDistSq(x, y, a, b));
    }
  }
  return minSq === 0 ? 0 : (inside ? 1 : -1) * Math.sqrt(minSq);
}

function segDistSq(px, py, a, b) {
  let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
  if (dx !== 0 || dy !== 0) {
    const t = ((px - x) * dx + (py - y) * dy) / (dx * dx + dy * dy);
    if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; }
  }
  dx = px - x; dy = py - y;
  return dx * dx + dy * dy;
}
