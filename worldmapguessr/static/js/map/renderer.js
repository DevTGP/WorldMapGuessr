// Canvas-Renderer auf Kachelbasis: Meer, Gradnetz, Schelf-Saum, Landflächen (je Zelle), Grenzen.
//
// Land ist in Zellen zerlegt (Kontinent × Staat, siehe build/1-cells.py). Jede Zelle bekommt ihre Farbe
// aus dem Spielstand: Das Land startet fast schwarz (--land); jede eingesetzte Ebene, die die Zelle
// enthält (Kontinent, Staat …), hellt sie um eine Stufe auf, bis fast weiß (--land-top). Zellen gleicher
// Farbe werden in einem Pfad gefüllt – so gibt es an Kachelrändern keine Haarlinien.
//
// Linien: Küsten und Kontinentgrenzen immer; Staatsgrenzen erst, wenn einer der beiden Staaten
// eingesetzt ist (Grenzen sind bis dahin unsichtbar – das macht es schwerer).
//
// Pro Punkt wird nur noch gedreht und skaliert (vorberechnete Faktoren, siehe project.js). Kacheln an der
// Schnittlinie der Karte (Längengrad gegenüber der Mitte) werden dort aufgetrennt.

import { TAU, viewOf, wrapOffset } from "./project.js";

const PLACED_FADE_MS = 500;
const TOKENS = ["outside", "sea", "sea-shelf", "land", "land-top", "coast", "border"];
/** Eingesetzte Items, die kleiner als so viele Pixel erscheinen, bekommen einen Ring */
const TINY_PX = 5;
const TINY_RING_R = 3.5;
/** Mindestabstand zweier gezeichneter Punkte (Pixel) */
const MIN_STEP_PX = 0.75;
/** Für den breiten Schelf-Saum reicht ein gröberer Pfad */
const SHELF_STEP_PX = 2.5;
/** Strichbreite gegen Haarlinien zwischen Zellen */
const SEAM_PX = 1.2;

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{cells: [string, string|null][]}} index
   * @param {(key: string) => object|undefined} itemOf  Item-Metadaten (geom.anchor, geom.area)
   */
  constructor(canvas, index, itemOf) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = 1;
    this.colors = {};
    this.placed = new Map(); // Item-Key → Startzeit der Aufhell-Animation
    this.levels = 2;         // Ebenen (Kontinente, Staaten …) → Schrittweite der Aufhellung
    this.showGraticule = false;
    this.graticule = d3.geoGraticule10();
    this.itemOf = itemOf;
    // Zelle → Keys der Ebenen, die sie enthalten
    this.cells = index.cells.map(([continent, item]) => ({ continent: `continent:${continent}`, item }));
    this.readColors();

    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.readColors());
    new MutationObserver(() => this.readColors())
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const t of TOKENS) this.colors[t] = cs.getPropertyValue(`--${t}`).trim();
    this.land = d3.rgb(this.colors.land);
    this.top = d3.rgb(this.colors["land-top"]);
    this.onColorsChanged?.();
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.w = w;
    this.h = h;
  }

  setPlaced(key, placed, animate = true) {
    if (placed) this.placed.set(key, animate ? performance.now() : -Infinity);
    else this.placed.delete(key);
  }

  /** true, solange noch eine Aufhell-Animation läuft */
  get animating() {
    const now = performance.now();
    for (const t of this.placed.values()) if (now - t < PLACED_FADE_MS) return true;
    return false;
  }

  /** 0…1: wie weit das Item eingesetzt (eingeblendet) ist */
  _fraction(key, now) {
    const t0 = this.placed.get(key);
    return t0 === undefined ? 0 : Math.min(1, (now - t0) / PLACED_FADE_MS);
  }

  /** Farbe je Zelle für diesen Frame */
  _cellColors(now) {
    const { land: a, top: b } = this;
    return this.cells.map((c) => {
      const f = (this._fraction(c.continent, now) + (c.item ? this._fraction(c.item, now) : 0)) / this.levels;
      if (f === 0) return this.colors.land;
      return `rgb(${Math.round(a.r + (b.r - a.r) * f)},${Math.round(a.g + (b.g - a.g) * f)},${Math.round(a.b + (b.b - a.b) * f)})`;
    });
  }

  /**
   * @param {d3.GeoProjection} projection  vollständige d3-Projektion der aktuellen Ansicht
   * @param {object[]} tiles  zu zeichnende Kacheln (TileStore.select)
   * @param {boolean} moving  während Interaktion: ohne Schelf-Saum
   */
  draw(projection, tiles, moving) {
    const { ctx, colors: c } = this;
    const now = performance.now();
    const v = viewOf(projection);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = c.outside;
    ctx.fillRect(0, 0, this.w, this.h);

    // Meer (und Gradnetz) über d3 – wenige Punkte
    const plain = d3.geoPath(projection, ctx);
    ctx.beginPath();
    plain({ type: "Sphere" });
    ctx.fillStyle = c.sea;
    ctx.fill();
    if (this.showGraticule) {
      ctx.beginPath();
      plain(this.graticule);
      ctx.strokeStyle = c["sea-shelf"];
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    // Pfade sammeln: Flächen je Farbe, Linien je Art
    const colors = this._cellColors(now);
    const fills = new Map();
    const coast = new Path2D();
    const shelf = moving ? null : new Path2D();
    const borders = new Path2D();
    const seams = new Map(); // Farbe → Pfad
    const itemPlaced = (cell) => cell >= 0 && this.cells[cell].item && this.placed.has(this.cells[cell].item);
    for (const t of tiles) {
      const off = wrapOffset(t.lon0, v.rot);
      const cut = t.lon1 + v.rot + off > Math.PI + 1e-9; // Kachel liegt über der Schnittlinie
      for (const f of t.fills) {
        const color = colors[f.cell];
        let p = fills.get(color);
        if (!p) fills.set(color, (p = new Path2D()));
        for (const ring of f.rings) addRing(p, ring, v, off, cut, true, MIN_STEP_PX);
      }
      for (const l of t.lines) {
        let target;
        if (l.b < 0 || this.cells[l.a].continent !== this.cells[l.b].continent) target = coast;
        else if (this.cells[l.a].item !== this.cells[l.b].item && (itemPlaced(l.a) || itemPlaced(l.b))) target = borders;
        else if (colors[l.a] === colors[l.b]) {
          target = seams.get(colors[l.a]);
          if (!target) seams.set(colors[l.a], (target = new Path2D()));
        } else continue;
        addRing(target, l.pts, v, off, cut, false, MIN_STEP_PX);
        if (shelf && target === coast) addRing(shelf, l.pts, v, off, cut, false, SHELF_STEP_PX);
      }
    }

    ctx.lineJoin = "round";
    // Heller Saum entlang der Küste (Schelf); beim Bewegen weggelassen
    if (!moving) {
      ctx.strokeStyle = c["sea-shelf"];
      ctx.lineWidth = 5;
      ctx.stroke(shelf);
    }
    for (const [color, p] of fills) {
      ctx.fillStyle = color;
      ctx.fill(p);
    }
    // Unsichtbare Grenzen zwischen gleichfarbigen Zellen: Die Kantenglättung ließe an der gemeinsamen
    // Kante eine Haarlinie – ein Strich in der Flächenfarbe deckt sie ab.
    ctx.lineWidth = SEAM_PX;
    for (const [color, p] of seams) {
      ctx.strokeStyle = color;
      ctx.stroke(p);
    }
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.6;
    ctx.stroke(borders);
    ctx.strokeStyle = c.coast;
    ctx.lineWidth = 0.7;
    ctx.stroke(coast);

    this._drawTinyMarkers(projection, now);
  }

  /** Ringe für eingesetzte Items, die in der aktuellen Ansicht kaum sichtbar wären */
  _drawTinyMarkers(projection, now) {
    const { ctx, colors: c } = this;
    const scale = projection.scale();
    ctx.lineWidth = 1;
    for (const key of this.placed.keys()) {
      const item = this.itemOf(key);
      if (!item || Math.sqrt(item.geom.area) * scale >= TINY_PX) continue;
      const p = projection(item.geom.anchor);
      if (!p || p[0] < -10 || p[1] < -10 || p[0] > this.w + 10 || p[1] > this.h + 10) continue;
      const f = this._fraction(key, now) / this.levels;
      const a = this.land, b = this.top;
      ctx.beginPath();
      ctx.arc(p[0], p[1], TINY_RING_R, 0, 2 * Math.PI);
      ctx.fillStyle = `rgb(${Math.round(a.r + (b.r - a.r) * f)},${Math.round(a.g + (b.g - a.g) * f)},${Math.round(a.b + (b.b - a.b) * f)})`;
      ctx.fill();
      ctx.strokeStyle = c.coast;
      ctx.stroke();
    }
  }
}

/**
 * Punkte (λ, fx, Y je Punkt) projiziert in einen Pfad schreiben.
 * @param {boolean} cut     Kachel liegt über der Schnittlinie (λ' = π) → dort auftrennen
 * @param {boolean} closed  Ring (Fläche) statt Linie
 * @param {number} step     Punkte näher als so viele Pixel am vorigen werden übersprungen
 */
function addRing(path, pts, { s, tx, ty, rot }, off, cut, closed, step) {
  const n = pts.length / 3;
  if (n < 2) return;
  const shift = rot + off;
  if (!cut) {
    // Punkte, die weniger als MIN_STEP_PX vom zuletzt gezeichneten entfernt liegen, überspringen:
    // Die Canvas-Aufrufe sind das Teure, die Schleife selbst kostet kaum etwas.
    let lx = tx + s * (pts[0] + shift) * pts[1], ly = ty - s * pts[2];
    path.moveTo(lx, ly);
    for (let i = 1; i < n; i++) {
      const x = tx + s * (pts[3 * i] + shift) * pts[3 * i + 1], y = ty - s * pts[3 * i + 2];
      if (Math.abs(x - lx) < step && Math.abs(y - ly) < step && (closed || i < n - 1)) continue;
      path.lineTo(x, y);
      lx = x; ly = y;
    }
    if (closed) path.closePath();
    return;
  }
  // Über der Schnittlinie: Teil diesseits (λ' ≤ π) und jenseits (λ' > π, um 2π zurückgeschoben)
  for (const side of [0, 1]) {
    const keep = side === 0 ? (l) => l <= Math.PI : (l) => l > Math.PI;
    const back = side === 0 ? 0 : -TAU;
    let started = false;
    let prevL = pts[0] + shift, prevIn = keep(prevL);
    const emit = (l, fx, Y) => {
      const x = tx + s * (l + back) * fx, y = ty - s * Y;
      if (!started) { path.moveTo(x, y); started = true; } else path.lineTo(x, y);
    };
    if (prevIn) emit(prevL, pts[1], pts[2]);
    const last = closed ? n : n - 1;
    for (let k = 1; k <= last; k++) {
      const i = k % n;
      const l = pts[3 * i] + shift, inside = keep(l);
      if (inside !== prevIn) {
        // Schnittpunkt mit λ' = π linear einfügen
        const j = (k - 1) % n;
        const t = (Math.PI - prevL) / (l - prevL);
        const fx = pts[3 * j + 1] + (pts[3 * i + 1] - pts[3 * j + 1]) * t;
        const Y = pts[3 * j + 2] + (pts[3 * i + 2] - pts[3 * j + 2]) * t;
        if (!closed && !inside) { emit(Math.PI, fx, Y); started = false; }
        else emit(Math.PI, fx, Y);
      }
      if (inside && !(closed && k === n)) emit(l, pts[3 * i + 1], pts[3 * i + 2]);
      prevL = l; prevIn = inside;
    }
    if (closed && started) path.closePath();
  }
}
