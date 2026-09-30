// Namen eingesetzter Items auf der Karte (Kontinente, Staaten, später Bundesländer).
//
// Ein Name steht nur, wenn er ganz in seinem Item liegt und keinen anderen Namen berührt. Platz sucht er
// am „Pol der Unerreichbarkeit“ des größten Teils (Punkt mit dem größten Abstand zum Rand, einmal je Item
// berechnet); passt er dort nicht, wird die Schrift kleiner bzw. der Name zweizeilig. Reihenfolge der
// Vergabe: Kontinente vor Staaten vor Bundesländern, innerhalb einer Ebene größere Items zuerst.
//
// Das Prüfen (Punkte des Textrahmens in der Fläche?) kostet etwas – es läuft nur im Stillstand. Während
// die Karte bewegt wird, bleiben die zuletzt gewählten Namen stehen und wandern nur mit.

import { stageColor, stopsFor } from "./schemes.js";

const KIND_RANK = { continent: 0, country: 1, state: 2 };
/** Schriftgröße (px) je Ebene: [größte, kleinste] */
const FONT_PX = { continent: [15, 11], country: [12.5, 9], state: [11, 8.5] };
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
    this.layout = [];   // [{key, feature, lines, px, font, color, halo}]
    this.layoutKey = "";
  }

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
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const l of this.layout) {
      const p = projection(l.feature.labelPoint);
      if (!p) continue;
      ctx.font = l.font;
      ctx.lineWidth = Math.max(2, l.px / 4);
      ctx.strokeStyle = l.halo;
      ctx.fillStyle = l.color;
      const lh = l.px * LINE_HEIGHT;
      l.lines.forEach((text, i) => {
        const y = p[1] + (i - (l.lines.length - 1) / 2) * lh;
        ctx.strokeText(text, p[0], y);
        ctx.fillText(text, p[0], y);
      });
    }
  }

  _layout(ctx, projection, { w, h }, keys, stageOf, scheme) {
    const scale = projection.scale();
    const items = keys.map((k) => this.itemOf(k)).filter((f) => f && KIND_RANK[f.kind] !== undefined)
      .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.geom.area - a.geom.area);
    const taken = []; // belegte Rahmen [x0, y0, x1, y1]
    const out = [];
    for (const f of items) {
      const extent = Math.sqrt(f.geom.area) * scale;
      if (extent < 12) continue; // winzig: kein Platz für einen Namen
      if (f.kind === "continent" && extent > CONTINENT_MAX_SCREENS * Math.max(w, h)) continue;
      labelPointOf(f);
      const p = projection(f.labelPoint);
      if (!p || p[0] < -50 || p[1] < -50 || p[0] > w + 50 || p[1] > h + 50) continue;
      const fit = this._fit(ctx, projection, f, p, taken, w, h);
      if (!fit) continue;
      taken.push(fit.box);
      const bg = d3.rgb(stageColor(stopsFor(scheme, f.kind === "continent" ? f.key : `continent:${f.properties.region}`),
        stageOf(f.key) + (f.kind === "continent" && this._placedUnder(f, keys) ? 1 : 0)));
      const dark = luminance(bg) > 0.42;
      out.push({
        key: f.key, feature: f, lines: fit.lines, px: fit.px, font: fit.font,
        color: dark ? "rgba(20, 22, 26, 0.92)" : "rgba(255, 255, 255, 0.95)",
        halo: dark ? "rgba(255, 255, 255, 0.55)" : "rgba(10, 12, 16, 0.6)",
      });
    }
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

  /** Größte Schrift (ein- oder zweizeilig), deren Rahmen im Item liegt und frei ist */
  _fit(ctx, projection, f, [x, y], taken, w, h) {
    const [max, min] = FONT_PX[f.kind];
    const name = f.kind === "continent" ? f.properties.name.toUpperCase() : f.properties.name;
    const variants = [[name], ...splitTwo(name)];
    for (let px = max; px >= min; px -= FONT_STEP) {
      const font = fontFor(f.kind, px);
      ctx.font = font;
      for (const lines of variants) {
        const tw = Math.max(...lines.map((s) => ctx.measureText(s).width)) + spacing(f.kind, px, lines);
        const th = lines.length * px * LINE_HEIGHT;
        const box = [x - tw / 2, y - th / 2, x + tw / 2, y + th / 2];
        if (box[2] < 0 || box[3] < 0 || box[0] > w || box[1] > h) return null; // außerhalb des Bildes
        if (taken.some((b) => overlaps(b, box))) continue;
        if (!insideBox(projection, f, box)) continue;
        return { lines, px, font, box };
      }
    }
    return null;
  }
}

function fontFor(kind, px) {
  const weight = kind === "state" ? 500 : 600;
  return `${weight} ${px}px "Instrument Sans", system-ui, sans-serif`;
}

/** Kontinentnamen: gesperrt (letterSpacing wird nicht überall unterstützt, daher nur als Breitenzuschlag) */
function spacing(kind, px, lines) {
  return kind === "continent" ? Math.max(...lines.map((s) => s.length)) * px * 0.02 : 0;
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
