// Namen eingesetzter Items auf der Karte (Kontinente, Staaten, Bundesländer) – im Stil der Paradox-Karten
// (Victoria 3): Versalien einer Antiqua, gesperrt, entlang der Form des Items gebogen, so groß, wie das Item
// es hergibt – und fest auf der Erde: Ein Name wird einmal ausgelegt und wächst beim Zoomen mit der Karte,
// er springt nicht und wird nicht kleiner. Zu klein zum Lesen wird er ausgeblendet (kleine Länder zeigen ihren
// Namen erst beim Hineinzoomen), sehr groß blendet er aus (ganz nah sieht man die Landschaft).
//
// Auslegen je Item in einer eigenen Bezugsansicht (Projektion auf das Item gedreht, Item ≈ REF_PX groß):
// Hauptteil und nahe Inseln werden in eine Maske gerastert; die Hauptachse der Fläche gibt die Richtung, die
// Mitten der längsten Querschnitte die Mittellinie (quadratisch ausgeglichen, Biegung begrenzt). Die Schrift
// füllt einen festen Anteil der Länge: Die Höhe begrenzt die Dicke des Items, den Rest füllt die Sperrung.
// Toleranz wie in den Paradox-Spielen: Der Name darf über Meer, Buchten und Nachbarn laufen, solange
// genug seiner Fläche in der Hülle (Land samt Meerengen) und auf eigenem Land liegt, wenig auf fremdem Land,
// und jeder Buchstabe nahe an der Hülle bleibt. Inselstaaten (Griechenland, Italien …) bekommen eine weitere
// Hülle, schräge Richtungen und dürfen über die Enden ihrer Form hinaus aufs Meer laufen.
// Die Kandidaten (Größen, quer verschobene Linien) je Item werden zwischengespeichert; welche Namen stehen,
// entscheidet ein Überschneidungstest in einer gemeinsamen Weltansicht – nur, wenn sich die eingesetzten
// Items ändern, nicht beim Bewegen. Vorrang: Staaten (größere zuerst), Bundesländer untereinander,
// Kontinente nur, wo sie keinen Staatsnamen berühren.

//
// Die Kandidaten je Item rechnet labels-core.js – im Worker (labels-worker.js), damit das Auslegen vieler
// Namen auf einmal (Lobby-Beitritt: alle Staaten ≈ 1,5 s) die Seite nicht anhält; ohne Worker im Hauptthread.
// Solange Kandidaten fehlen, bleibt die bisherige Auslegung stehen.

import { stageColor, stopsFor } from "./schemes.js";
import { makeProjection, projectionId } from "./projections.js";
import { CAP, LABEL_FONT, candidates, fontFor, geoBox } from "./labels-core.js";

export { LABEL_FONT };

/** Sichtbar ab / bis zu dieser Schriftgröße auf dem Bildschirm (px), dazwischen weich ein- und ausgeblendet */
const VISIBLE_PX = { continent: [10, 90], country: [7.5, 170], state: [7, 140] };
const FADE = 0.3; // Anteil der Grenze, über den ein- bzw. ausgeblendet wird
/** Gemeinsame Weltansicht für den Überschneidungstest: Maßstab und Abstand (Anteil der Schriftgröße) */
const WORLD_SCALE = 1000, GAP = 0.25;

export class LabelLayer {
  /** @param {(key: string) => object|undefined} itemOf */
  constructor(itemOf) {
    this.itemOf = itemOf;
    /** [{item, glyphs: [{ch, ll, dir}], em, color, halo}] – em: Schriftgröße je Einheit Kartenmaßstab */
    this.layout = [];
    this.layoutKey = "";
    /** Kandidaten je Item (unabhängig von der Ansicht) */
    this.cands = new Map();
    /** alle Items (für die Nachbarn in der Maske); setzt map.js */
    this.items = () => [];
    /** Kandidaten sind angekommen: neu zeichnen (setzt map.js) */
    this.onChange = () => {};
    this.source = new CandidateSource((key, cands, gen) => {
      if (cands === undefined) { this.layoutKey = ""; this.onChange(); return; } // Worker gescheitert
      if (gen !== this.gen) return; // Projektion inzwischen gewechselt
      this.cands.set(key, cands);
      if (!this.source.busy) { this.layoutKey = ""; this.onChange(); }
    });
    this.gen = 0;
  }

  /** Neu auslegen (z. B. wenn die Schrift nachgeladen wurde) */
  invalidate() { this.layoutKey = ""; this.cands.clear(); this.gen++; }

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
    const key = `${keys.join(",")}|${projectionId()}|${scheme.label}`;
    if (key !== this.layoutKey && (!moving || !this.layout.length)) {
      if (this._projection !== projectionId()) { this.cands.clear(); this.gen++; this._projection = projectionId(); }
      this._request(keys);
      if (this.source.busy) {
        // Kandidaten kommen noch (Worker): bisherige Namen behalten, nur nicht mehr eingesetzte weglassen
        const now = new Set(keys);
        this.layout = this.layout.filter((l) => now.has(l.item.key));
      } else {
        this.layout = this._layout(keys, stageOf, scheme);
        this.layoutKey = key;
      }
    }
    const scale = projection.scale();
    // sichtbare Bundesländer eines Staates: dessen Name tritt zurück
    const statesShown = new Set();
    for (const l of this.layout) {
      if (l.item.kind === "state" && visibility("state", l.em * scale) > 0.5) statesShown.add(l.item.properties.country);
    }
    ctx.save();
    const base = ctx.getTransform();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    for (const l of this.layout) {
      const px = l.em * scale;
      let alpha = visibility(l.item.kind, px);
      if (alpha <= 0.02) continue;
      if (l.item.kind === "country" && statesShown.has(l.item.id)) alpha *= 0.3;
      ctx.font = fontFor(l.item.kind, px);
      ctx.lineWidth = Math.min(4, Math.max(2, px / 5));
      ctx.strokeStyle = l.halo;
      ctx.fillStyle = l.color;
      // große Namen liegen wie gedruckt auf der Karte, kleine bleiben kräftig
      ctx.globalAlpha = alpha * (px > 22 ? 0.72 : px > 14 ? 0.84 : 0.95);
      for (const g of l.glyphs) {
        const p = projection(g.ll), q = projection(g.dir);
        if (!p || !q || p[0] < -px * 2 || p[1] < -px * 2 || p[0] > size.w + px * 2 || p[1] > size.h + px * 2) continue;
        ctx.setTransform(base); // Grundtransformation (Pixeldichte) behalten
        ctx.translate(p[0], p[1]);
        ctx.rotate(Math.atan2(q[1] - p[1], q[0] - p[0]));
        ctx.strokeText(g.ch, 0, 0);
        ctx.fillText(g.ch, 0, 0);
      }
      ctx.setTransform(base);
    }
    ctx.restore();
  }

  /** Kandidaten der Items anfordern, die noch keine haben */
  _request(keys) {
    for (const k of keys) {
      const f = this.itemOf(k);
      if (!f || !(f.kind in RANK) || this.cands.has(k)) continue;
      const cands = this.source.request(f, this._neighbours(f), projectionId(), this.gen);
      if (cands) this.cands.set(k, cands);
    }
  }

  _layout(keys, stageOf, scheme) {
    const items = keys.map((k) => this.itemOf(k)).filter((f) => f && RANK[f.kind] !== undefined)
      .sort((a, b) => RANK[a.kind] - RANK[b.kind] || b.geom.area - a.geom.area);
    const world = makeProjection().rotate([0, 0]).translate([0, 0]).scale(WORLD_SCALE);
    const taken = { country: [], state: [], continent: [] };
    // gegen welche Namen eine Ebene geprüft wird
    const against = { country: ["country"], state: ["state"], continent: ["country", "continent"] };
    const out = [];
    for (const f of items) {
      const cands = this.cands.get(f.key) ?? [];
      const pick = cands.find((c) => {
        c.boxes ??= worldBoxes(c, world);
        return !against[f.kind].some((k) => taken[k].some((b) => c.boxes.some((x) => overlaps(b, x))));
      });
      if (!pick) continue;
      taken[f.kind].push(...pick.boxes);
      labelPointOf(f);
      const bg = d3.rgb(stageColor(stopsFor(scheme, f.kind === "continent" ? f.key : `continent:${f.properties.region}`),
        stageOf(f.key) + (f.kind === "continent" && this._placedUnder(f, keys) ? 1 : 0)));
      const dark = luminance(bg) > 0.42;
      out.push({
        item: f, glyphs: pick.glyphs, em: pick.em,
        color: dark ? "rgb(28, 24, 20)" : "rgb(250, 244, 230)",
        halo: dark ? "rgba(255, 250, 238, 0.45)" : "rgba(10, 12, 16, 0.55)",
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

  /** Staaten, deren Land unter einem Namen des Items liegen könnte (nicht der eigene Staat) */
  _neighbours(f) {
    if (f.kind === "continent") return [];
    const b = geoBox(f), mx = (b[2] - b[0]) * 0.6 + 1, my = (b[3] - b[1]) * 0.6 + 1;
    return this.items().filter((o) => {
      if (o.kind !== "country" || o === f || o.id === f.properties.country) return false;
      const c = geoBox(o);
      return c[0] < b[2] + mx && c[2] > b[0] - mx && c[1] < b[3] + my && c[3] > b[1] - my;
    });
  }
}

/** Vorrang beim Auslegen: Staaten, Bundesländer, Kontinente */
const RANK = { country: 0, state: 1, continent: 2 };

/**
 * Kandidaten je Item: im Worker (labels-worker.js, OffscreenCanvas), sonst – ohne Worker oder wenn er
 * scheitert – im Hauptthread. Umrisse schickt sie dem Worker nur, wenn er sie noch nicht (in dieser
 * Detailstufe) hat.
 */
class CandidateSource {
  /** @param {(key: string, cands: object[], gen: number) => void} onResult */
  constructor(onResult) {
    this.onResult = onResult;
    this.pending = new Map(); // key → gen
    this.sent = new Map();    // key → zuletzt geschickter Umriss
    this.worker = null;
    this._canvas = null;
    this._measure = null;
    const url = window.WMG?.workers?.labels;
    if (!url || typeof OffscreenCanvas === "undefined") return;
    try {
      this.worker = new Worker(url, { type: "module" });
    } catch (err) {
      console.warn("Namen-Worker nicht verfügbar:", err.message);
      return;
    }
    this.worker.onmessage = ({ data }) => {
      if (data.type === "error") return this._fail(data.message);
      this.pending.delete(data.key);
      this.onResult(data.key, data.cands, data.gen);
    };
    this.worker.onerror = (e) => { e.preventDefault?.(); this._fail(e.message); };
    const d3Script = [...document.scripts].find((sc) => /\/d3(\.min)?\.js$/.test(sc.src))?.src;
    this.worker.postMessage({ type: "init", fonts: labelFonts(), d3: d3Script });
  }

  /** Werden noch Kandidaten gerechnet? */
  get busy() { return this.pending.size > 0; }

  /**
   * Kandidaten eines Items: gleich (Hauptthread) oder später über onResult (Worker → undefined)
   * @param {object} f  Item
   * @param {object[]} neighbours  Nachbar-Items
   */
  request(f, neighbours, projection, gen) {
    const item = { kind: f.kind, text: displayName(f), geometry: f.fitGeometry ?? f.geometry };
    if (!this.worker) {
      return candidates(item, neighbours.map((o) => o.geometry), projection, this._env());
    }
    if (this.pending.get(f.key) === gen) return undefined;
    this._send(f.key, item.geometry);
    for (const o of neighbours) this._send(o.key, o.geometry);
    this.pending.set(f.key, gen);
    this.worker.postMessage({ type: "candidates", key: f.key, gen, kind: f.kind, text: item.text, projection,
      neighbours: neighbours.map((o) => o.key) });
    return undefined;
  }

  _send(key, geometry) {
    if (this.sent.get(key) === geometry) return;
    this.sent.set(key, geometry);
    this.worker.postMessage({ type: "geometry", key, geometry });
  }

  /** Worker gescheitert: ab jetzt im Hauptthread; offene Anfragen kommen beim nächsten Bild erneut */
  _fail(message) {
    console.warn("Namen-Worker:", message);
    this.worker?.terminate();
    this.worker = null;
    const keys = [...this.pending.keys()];
    this.pending.clear();
    for (const k of keys) this.onResult(k, undefined, -1);
  }

  /** Rasterfläche und Textbreite im Hauptthread */
  _env() {
    return {
      canvas: (w, h) => {
        const c = this._canvas ??= document.createElement("canvas");
        if (c.width < w) c.width = w;
        if (c.height < h) c.height = h;
        return c;
      },
      measure: (font, text) => {
        const g = this._measure ??= document.createElement("canvas").getContext("2d");
        g.font = font;
        return g.measureText(text).width;
      },
    };
  }
}

/** Schriftdateien der Namen (Cinzel) aus den @font-face-Regeln der Seite – für den Worker */
function labelFonts() {
  const out = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) {
      if (!(r instanceof CSSFontFaceRule) || !/Cinzel/.test(r.style.getPropertyValue("font-family"))) continue;
      const m = /url\(\s*["']?([^"')]+)/.exec(r.style.getPropertyValue("src"));
      if (!m) continue;
      out.push({
        family: "Cinzel", url: new URL(m[1], sheet.href ?? location.href).href,
        weight: r.style.getPropertyValue("font-weight") || "normal",
        unicodeRange: r.style.getPropertyValue("unicode-range") || undefined,
      });
    }
  }
  return out;
}

function displayName(f) {
  return f.properties.name.toLocaleUpperCase();
}

/** 0 … 1: Sichtbarkeit eines Namens dieser Ebene bei dieser Schriftgröße */
function visibility(kind, px) {
  const [lo, hi] = VISIBLE_PX[kind];
  const a = Math.min(1, Math.max(0, (px - lo) / (lo * FADE)));
  const b = Math.min(1, Math.max(0, (hi * (1 + FADE) - px) / (hi * FADE)));
  return a * b;
}

/** Buchstabenrahmen in der gemeinsamen Weltansicht (für den Überschneidungstest) */
function worldBoxes(c, world) {
  const boxes = [];
  for (const g of c.glyphs) {
    const p = world(g.ll), q = world(g.dir);
    if (!p || !q) continue;
    const ang = Math.atan2(q[1] - p[1], q[0] - p[0]);
    const k = world.scale();
    const hw = g.hw * k, hh = (CAP * c.em * k) / 2 + GAP * c.em * k;
    const co = Math.abs(Math.cos(ang)), si = Math.abs(Math.sin(ang));
    const ex = hw * co + hh * si, ey = hw * si + hh * co;
    boxes.push([p[0] - ex, p[1] - ey, p[0] + ex, p[1] + ey]);
  }
  return boxes;
}

function overlaps(a, b) {
  return a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
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
