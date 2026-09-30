// Canvas-Renderer auf Kachelbasis: Meer, Gradnetz, Schelf-Saum, Landflächen (je Zelle), Grenzen.
//
// Land ist in Zellen zerlegt (Kontinent × Staat, siehe build/1-cells.py). Jede Zelle bekommt ihre Farbe
// aus dem Spielstand: Jede eingesetzte Ebene, die die Zelle enthält (Kontinent, Staat …), setzt sie eine
// Stufe weiter; die Farben je Stufe kommen aus dem Farbschema (map/schemes.js). Zellen gleicher Farbe
// werden in einem Pfad gefüllt – so gibt es an Kachelrändern keine Haarlinien.
//
// Linien: Küsten immer; Kontinentgrenzen, sobald einer der beiden Kontinente eingesetzt ist; Staatsgrenzen
// erst, wenn einer der beiden Staaten eingesetzt ist (Grenzen sind bis dahin unsichtbar – das macht es
// schwerer). Die Ebenen unterscheiden sich in der Strichstärke (BORDER_PX): Auch wenn alle Staaten eines
// Kontinents eingesetzt sind, bleibt die Kontinentgrenze erkennbar.
//
// Namen eingesetzter Items zeichnet map/labels.js obenauf.
//
// Pro Punkt wird nur noch gedreht und skaliert (vorberechnete Faktoren, siehe project.js). Kacheln an der
// Schnittlinie der Karte (Längengrad gegenüber der Mitte) werden dort aufgetrennt.

import { TAU, viewOf, wrapOffset } from "./project.js";
import { scheme, stageColor, stopsFor } from "./schemes.js";
import { riverWidth } from "./water.js";
import { LabelLayer } from "./labels.js";
import { prefs } from "../settings/prefs.js";

const PLACED_FADE_MS = 500;
/** Eingesetzte Items, die kleiner als so viele Pixel erscheinen, bekommen einen Ring */
const TINY_PX = 5;
const TINY_RING_R = 3.5;
/** Mindestabstand zweier gezeichneter Punkte (Pixel) */
/** Kleinere Ringe (Inseln) und Linienstücke werden nicht gezeichnet */
const MIN_SIZE_PX = 0.5;
const MIN_STEP_PX = 0.75; // Standard (Qualität „Niedrig“); setQuality ändert step/shelfStep
/** Für den breiten Schelf-Saum reicht ein gröberer Pfad */
const SHELF_STEP_PX = 2.5;
/** Strichbreite gegen Haarlinien zwischen Zellen */
const SEAM_PX = 1.2;
/** Grenzen je Ebene (px): deutlich abgestuft, damit übergeordnete Grenzen zwischen eingesetzten
 *  Unterteilungen sichtbar bleiben. Küste: COAST_PX in der Küstenfarbe. */
const BORDER_PX = { continent: 2.2, country: 0.8 };
const COAST_PX = 0.7;

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
    this.showGraticule = false;
    this.step = MIN_STEP_PX;
    this.shelfStep = SHELF_STEP_PX;
    this.graticule = d3.geoGraticule10();
    this.itemOf = itemOf;
    this.labels = new LabelLayer(itemOf);
    this.showLabels = true;
    // Zelle → Keys der Ebenen, die sie enthalten
    this.cells = index.cells.map(([continent, item]) => ({ continent: `continent:${continent}`, item }));
    this.readColors();

    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.readColors());
    new MutationObserver(() => this.readColors())
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    prefs.onChange((key) => { if (key === "scheme") this.readColors(); });
  }

  /** Farben aus dem Farbschema (Hintergrund außerhalb der Erde aus dem Seiten-Thema) */
  readColors() {
    const s = scheme();
    const cs = getComputedStyle(document.documentElement);
    this.colors = {
      outside: s.map.outside ?? cs.getPropertyValue("--outside").trim(),
      sea: s.map.sea, "sea-shelf": s.map.shelf, coast: s.map.coast, border: s.map.border, water: s.map.water,
    };
    this.scheme = s;
    this.cellStops = this.cells.map((c) => stopsFor(s, c.continent));
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

  /** Einsetz-Stufe der Landfläche eines eingesetzten Items (ohne Animation): Kontinent + Item */
  _stage(key) {
    if (key.startsWith("continent:")) return 1;
    const region = this.itemOf(key)?.properties?.region;
    return 1 + (this.placed.has(`continent:${region}`) ? 1 : 0);
  }

  /** Farbe je Zelle für diesen Frame: Stufe = Summe der eingesetzten Ebenen (mit Einblend-Anteil) */
  _cellColors(now) {
    return this.cells.map((c, i) =>
      stageColor(this.cellStops[i], this._fraction(c.continent, now) + (c.item ? this._fraction(c.item, now) : 0)));
  }

  /**
   * @param {d3.GeoProjection} projection  vollständige d3-Projektion der aktuellen Ansicht
   * @param {object[]} tiles  zu zeichnende Kacheln (TileStore.select)
   * @param {boolean} moving  während Interaktion: ohne Schelf-Saum
   * @param {{water?: object[], relief?: {layer: import("./relief.js").ReliefLayer, passes: [string, number][]}}} [extras]
   *   Flüsse/Seen-Kacheln und Relief (je nach Einstellung)
   */
  draw(projection, tiles, moving, extras = {}) {
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
    // Flächen je Kachel und Farbe getrennt füllen: ein Pfad über den ganzen Bildschirm mit Tausenden
    // Teilpfaden ist beim Rastern deutlich teurer als viele kleine (jeder nur so groß wie seine Kachel).
    // Kacheln überlappen leicht (build/2-tiles.mjs), daher keine Nahtlinien.
    const fills = []; // [Farbe, Pfad]
    const coast = new Path2D();
    const shelf = moving ? null : new Path2D();
    const borders = new Path2D();
    const continentBorders = new Path2D();
    const seams = new Map(); // Farbe → Pfad
    const itemPlaced = (cell) => cell >= 0 && this.cells[cell].item && this.placed.has(this.cells[cell].item);
    for (const t of tiles) {
      const off = wrapOffset(t.lon0, v.rot);
      const cut = t.lon1 + v.rot + off > Math.PI + 1e-9; // Kachel liegt über der Schnittlinie
      const byColor = new Map();
      for (const f of t.fills) {
        const color = colors[f.cell];
        let p = byColor.get(color);
        if (!p) byColor.set(color, (p = new Path2D()));
        for (const ring of f.rings) addRing(p, ring, v, off, cut, true, this.step);
      }
      for (const entry of byColor) fills.push(entry);
      for (const l of t.lines) {
        let target;
        const ca = this.cells[l.a], cb = l.b < 0 ? null : this.cells[l.b];
        if (!cb) target = coast;
        // Grenze zwischen Kontinenten (Ural, Sinai, Panama …): erst sichtbar, wenn einer davon eingesetzt ist
        else if (ca.continent !== cb.continent && (this.placed.has(ca.continent) || this.placed.has(cb.continent))) target = continentBorders;
        else if (ca.item !== cb.item && (itemPlaced(l.a) || itemPlaced(l.b))) target = borders;
        else if (colors[l.a] === colors[l.b]) {
          target = seams.get(colors[l.a]);
          if (!target) seams.set(colors[l.a], (target = new Path2D()));
        } else continue;
        addRing(target, l.pts, v, off, cut, false, this.step);
        if (shelf && target === coast) addRing(shelf, l.pts, v, off, cut, false, this.shelfStep);
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
    // Relief über die Landfarben, darüber Seen und Flüsse; Grenzen und Küsten bleiben obenauf
    if (extras.relief) extras.relief.layer.draw(ctx, projection, { w: this.w, h: this.h }, extras.relief.passes, moving);
    if (extras.water?.length) this._drawWater(extras.water, v);
    ctx.strokeStyle = c.border;
    ctx.lineWidth = BORDER_PX.country;
    ctx.stroke(borders);
    ctx.lineCap = "round";
    ctx.lineWidth = BORDER_PX.continent;
    ctx.stroke(continentBorders);
    ctx.lineCap = "butt";
    ctx.strokeStyle = c.coast;
    ctx.lineWidth = COAST_PX;
    ctx.stroke(coast);

    this._drawTinyMarkers(projection, now);
    if (this.showLabels) {
      this.labels.draw(ctx, projection, { w: this.w, h: this.h }, this.placed.keys(),
        (key) => this._stage(key), this.scheme, moving);
    }
  }

  /** Seen füllen, Flüsse als Linien (Breite nach Bedeutung und Zoom) – in der Wasserfarbe des Schemas */
  _drawWater(tiles, v) {
    const { ctx } = this;
    const lakes = new Path2D();
    const rivers = new Map(); // Breite (auf 0,25 px gerundet) → Pfad
    for (const t of tiles) {
      const off = wrapOffset(t.lon0, v.rot);
      const cut = t.lon1 + v.rot + off > Math.PI + 1e-9;
      for (const lake of t.lakes) {
        if (lake.sMin > v.s) continue;
        for (const ring of lake.rings) addRing(lakes, ring, v, off, cut, true, this.step);
      }
      for (const r of t.rivers) {
        if (r.sMin > v.s) continue;
        const w = Math.round(riverWidth(r.sMin, v.s) * 4) / 4;
        let p = rivers.get(w);
        if (!p) rivers.set(w, (p = new Path2D()));
        addRing(p, r.pts, v, off, cut, false, this.step);
      }
    }
    ctx.fillStyle = this.colors.water;
    ctx.fill(lakes);
    ctx.strokeStyle = this.colors.water;
    ctx.lineCap = "round";
    for (const [w, p] of rivers) {
      ctx.lineWidth = w;
      ctx.stroke(p);
    }
    ctx.lineCap = "butt";
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
      const cont = key.startsWith("continent:") ? key : `continent:${item.properties?.region}`;
      const k = this._fraction(key, now) + (cont === key ? 0 : this._fraction(cont, now));
      ctx.beginPath();
      ctx.arc(p[0], p[1], TINY_RING_R, 0, 2 * Math.PI);
      ctx.fillStyle = stageColor(stopsFor(this.scheme, cont), k);
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
  // Ringe/Linien kleiner als ein halber Pixel sind unsichtbar – ihre Canvas-Aufrufe kosten aber trotzdem
  if (pts.ext !== undefined && pts.ext * s < MIN_SIZE_PX) return;
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
