// Weltkarte: Daten, Projektion und Ansicht (Drehung um die Längsachse, Zoom, vertikale Verschiebung).
// Globale Abhängigkeit (CDN): d3. Kartendaten: Kacheln + Items mit Detailstufen (tiles.js, items.js).

import { Renderer } from "./renderer.js";
import { Gestures } from "./gestures.js";
import { yielder } from "../ui/loading-screen.js";
import { TileStore } from "./tiles.js";
import { ItemStore } from "./items.js";
import { boxTest } from "./project.js";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 40; // feinste Kachelstufe: Natural Earth 1:10m in voller Genauigkeit
const IDLE_AFTER_MS = 140;   // so lange nach der letzten Bewegung wird in voller Qualität gezeichnet
const PAN_MARGIN = 0.22;     // vertikaler Spielraum beim Zoomen (Anteil der Fensterhöhe), z. B. für Antarktika über dem Inventar
const PAN_MARGIN_RAMP = 0.5; // Spielraum wächst von Zoom 1 bis 1 + RAMP stetig an (kein Sprung beim Herauszoomen)
export const ROTATE_STEP_DEG = 45; // Dreh-Pfeile: π/4

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Lädt die Kartendaten (Index, grobe Items, Kacheln der Stufe 0) und liefert die fertige Karte.
 * Feinere Kacheln und Item-Stufen kommen später bei Bedarf (siehe tiles.js, items.js).
 * @param {{canvas: HTMLCanvasElement, base: string, startBytes?: number,
 *          loading?: import("../ui/loading-screen.js").LoadingScreen}} opts
 *   base:       URL-Präfix der Kartendaten (…/data/<version>)
 *   startBytes: Summe der Startdateien (vom Server) – für einen genauen Download-Fortschritt
 *   loading:    Ladebildschirm mit den Phasen "download" und "shapes"
 * @returns {Promise<WorldMap>}
 */
export async function createMap({ canvas, base, startBytes = 0, loading = null }) {
  const report = (f, detail) => loading?.report(f, detail);
  loading?.enter("download");
  let got = 0;
  const onBytes = (n) => {
    got += n;
    report(startBytes ? Math.min(1, got / startBytes) : null,
      startBytes ? `${mb(Math.min(got, startBytes))} / ${mb(startBytes)} MB` : `${mb(got)} MB`);
  };
  const index = await fetchJson(`${base}/index.json`, onBytes);
  const tiles = new TileStore(base, index, () => {});
  const items = new ItemStore(base, index);
  const [start] = await Promise.all([fetchJson(`${base}/items/i0.json`, onBytes), tiles.loadLevel(0, onBytes)]);

  loading?.enter("shapes", `0 / ${items.features.length} Umrisse`);
  const tick = yielder();
  items.setStart(start);
  await tick(true);
  report(1, `${items.features.length} / ${items.features.length} Umrisse`);
  return new WorldMap(canvas, { index, tiles, items });
}

/** JSON laden und dabei die Bytes melden (Stream, falls der Browser ihn anbietet) */
async function fetchJson(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.body?.getReader) {
    const text = await res.text();
    onBytes(text.length);
    return JSON.parse(text);
  }
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
    onBytes(value.length);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

const mbFmt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mb = (bytes) => mbFmt.format(bytes / 1e6);

export class WorldMap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{index: object, tiles: TileStore, items: ItemStore}} data
   */
  constructor(canvas, { index, tiles, items }) {
    this.canvas = canvas;
    this.tiles = tiles;
    this.items = items;
    /** Alle Items (Kontinente + Staaten) als GeoJSON-Features mit Metadaten */
    this.features = items.features;
    this.byKey = items.byKey;
    // d3-Projektion: Umrechnungen (Klick, gehaltenes Item, Meer, Gradnetz); das Land zeichnet der
    // Kachel-Renderer mit derselben Formel selbst
    this.projection = d3.geoNaturalEarth1().precision(0.5);
    this.view = { lambda: 0, k: 1, ty: 0 }; // lambda: Drehung in Grad (positiv = Karte nach rechts)
    this.size = { w: 0, h: 0 };
    this.renderer = new Renderer(canvas, index, (key) => this.byKey.get(key));
    this.renderer.levels = 2; // Kontinente + Staaten = 2 Stufen bis fast weiß
    this.renderer.onColorsChanged = () => this.requestRender();
    tiles.onLoad = () => this.requestRender();
    items.onUpgrade = () => this.requestRender();
    this._listeners = { view: [], click: [], contextmenu: [] };
    this._moving = false;
    this._frame = 0;

    this.gestures = new Gestures(this);
    this.layout();

    let timer;
    addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(() => this.layout(), 120);
    });
  }

  // ---------- Ereignisse ----------
  /** Ansicht hat sich geändert (einmal pro gezeichnetem Frame) */
  onView(fn) { this._listeners.view.push(fn); }
  onClick(fn) { this._listeners.click.push(fn); }
  onContextMenu(fn) { this._listeners.contextmenu.push(fn); }
  _emit(type, arg) { this._listeners[type].forEach((fn) => fn(arg)); }

  // ---------- Layout & Projektion ----------
  layout() {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.size = { w: width, h: height };
    this.renderer.resize(width, height);
    const pad = Math.min(width, height) * 0.04;
    const p = d3.geoNaturalEarth1().fitExtent([[pad, pad], [width - pad, height - pad]], { type: "Sphere" });
    this.baseScale = p.scale();
    const [[, y0], [, y1]] = d3.geoPath(p).bounds({ type: "Sphere" });
    this.baseHeight = y1 - y0;
    this.setView(this.view);
  }

  _apply(v, projection = this.projection) {
    const { w, h } = this.size;
    return projection.scale(this.baseScale * v.k).translate([w / 2, h / 2 + v.ty]).rotate([v.lambda, 0]);
  }

  /** Ansicht auf gültige Werte begrenzen */
  clamp(v) {
    const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.k));
    // Bei 100 % ist die Y-Achse fest; erst beim Hineinzoomen darf senkrecht verschoben werden
    const ramp = Math.min(1, (k - MIN_ZOOM) / PAN_MARGIN_RAMP);
    const maxTy = (Math.max(0, (this.baseHeight * k - this.size.h) / 2) + this.size.h * PAN_MARGIN) * ramp;
    const lambda = ((((v.lambda + 180) % 360) + 360) % 360) - 180;
    return { lambda, k, ty: Math.max(-maxTy, Math.min(maxTy, v.ty)) };
  }

  setView(v) {
    this.view = this.clamp(v);
    this._apply(this.view);
    this.requestRender();
  }

  // ---------- Umrechnungen ----------
  _rect() { return this.canvas.getBoundingClientRect(); }

  /** [lon, lat] → Bildschirmpunkt (clientX/Y) */
  toScreen(lonLat) {
    const r = this._rect();
    const [x, y] = this.projection(lonLat);
    return [x + r.left, y + r.top];
  }

  /** Bildschirmpunkt → [lon, lat] oder null außerhalb der Weltkugel */
  invert(clientX, clientY, projection = this.projection) {
    const r = this._rect();
    const p = [clientX - r.left, clientY - r.top];
    const ll = projection.invert(p);
    if (!ll) return null;
    const back = projection(ll);
    return back && Math.hypot(back[0] - p[0], back[1] - p[1]) < 0.5 ? ll : null;
  }

  /** Grad Drehung pro Bildschirmpixel an einem Punkt (hängt von der Breite ab) */
  degPerPx(lonLat, projection = this.projection) {
    const ll = lonLat ?? [-this.view.lambda, 0];
    const x0 = projection(ll)[0];
    let d = 0.01;
    let dx = projection([ll[0] + d, ll[1]])[0] - x0;
    if (!(dx > 0 && dx < 50)) { d = -0.01; dx = projection([ll[0] + d, ll[1]])[0] - x0; }
    return d / dx;
  }

  /** Neue Ansicht, bei der der Punkt unter (clientX, clientY) nach Zoom um factor dort bleibt */
  zoomedView(from, clientX, clientY, factor) {
    const tmp = this._apply(from, d3.geoNaturalEarth1());
    const r = this._rect();
    const anchor = this.invert(clientX, clientY, tmp) ?? tmp.invert([this.size.w / 2, this.size.h / 2]);
    const to = this.clamp({ ...from, k: from.k * factor });
    this._apply(to, tmp);
    const [px, py] = tmp(anchor);
    to.ty += clientY - r.top - py;
    to.lambda += (clientX - r.left - px) * this.degPerPx(anchor, tmp);
    return this.clamp(to);
  }

  // ---------- Steuerung ----------
  zoomAt(clientX, clientY, factor) {
    this.setView(this.zoomedView(this.view, clientX, clientY, factor));
  }

  zoomBy(factor, ms = 280) {
    const r = this._rect();
    const from = this.view;
    this.animate((t) => {
      const f = Math.pow(factor, t);
      return this.zoomedView(from, r.left + this.size.w / 2, r.top + this.size.h / 2, f);
    }, ms);
  }

  resetZoom(ms = 450) {
    const from = this.view;
    this.animate((t) => ({
      lambda: from.lambda,
      k: from.k + (1 - from.k) * t,
      ty: from.ty * (1 - t),
    }), ms);
  }

  /** Längengrad in der Kartenmitte */
  get centerLon() { return -this.view.lambda; }

  /**
   * Zum nächsten Vielfachen von 45° (π/4) nach Westen (dir = -1) oder Osten (dir = +1) drehen.
   * Liegt die Mitte schon auf einem Vielfachen, geht es genau 45° weiter.
   */
  rotateStep(dir, ms = 380) {
    const c = this.centerLon;
    const eps = 0.5;
    const target = dir > 0
      ? Math.ceil((c + eps) / ROTATE_STEP_DEG) * ROTATE_STEP_DEG
      : Math.floor((c - eps) / ROTATE_STEP_DEG) * ROTATE_STEP_DEG;
    const from = this.view;
    const delta = c - target; // lambda = -Mitte
    this.animate((t) => ({ ...from, lambda: from.lambda + delta * t }), ms);
  }

  panYBy(px, ms = 160) {
    const from = this.view;
    this.animate((t) => ({ ...from, ty: from.ty + px * t }), ms);
  }

  /** Ansicht über fn(t ∈ [0,1]) animieren */
  animate(fn, ms) {
    cancelAnimationFrame(this._anim);
    if (reduceMotion || ms <= 0) return this.setView(fn(1));
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms);
      this.markMoving();
      this.setView(fn(d3.easeCubicInOut(t)));
      if (t < 1) this._anim = requestAnimationFrame(step);
    };
    this._anim = requestAnimationFrame(step);
  }

  // ---------- Zeichnen ----------
  markMoving() {
    this._moving = true;
    clearTimeout(this._idleTimer);
    this._idleTimer = setTimeout(() => { this._moving = false; this.requestRender(); }, IDLE_AFTER_MS);
  }

  requestRender() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = 0;
      const z = this.tiles.levelFor(this.projection.scale());
      this.renderer.draw(this.projection, this.tiles.select(z, this.projection, this.size), this._moving);
      this._emit("view", this.view);
      if (this.renderer.animating) this.requestRender();
    });
  }

  /**
   * SVG-Pfad eines Features in der aktuellen Ansicht (für das gehaltene Teil)
   * @param {[[number, number], [number, number]]|null} clip  nur dieses Bildschirmrechteck (+ Rand)
   */
  svgPath(feature, clip = null) {
    const ctx = new ThinPath(PIECE_STEP_PX);
    let shape = feature;
    if (clip && feature.boxes) {
      // Polygone außerhalb gar nicht erst projizieren (z. B. Kanadas Inseln bei starkem Zoom)
      const inClip = boxTest(this.projection, clip);
      const polys = feature.geometry.coordinates.filter((_, i) => inClip(...feature.boxes[i]));
      shape = { type: "MultiPolygon", coordinates: polys };
    }
    this.projection.clipExtent(clip);
    try {
      d3.geoPath(this.projection, ctx)(shape);
    } finally {
      this.projection.clipExtent(null);
    }
    return ctx.toString();
  }

  /** Detailstufe, die für ein Item bei der aktuellen Skala passt (Kontinente höchstens Stufe 3) */
  itemLevel(feature) {
    const z = this.items.levelFor(this.projection.scale());
    return feature.kind === "continent" ? Math.min(z, 3) : z;
  }

  // ---------- Spielzustand ----------
  setPlaced(key, placed, animate = true) {
    this.renderer.setPlaced(key, placed, animate);
    this.requestRender();
  }

  isPlaced(key) { return this.renderer.placed.has(key); }
  get placedKeys() { return [...this.renderer.placed.keys()]; }

  resetPlaced() {
    this.renderer.placed.clear();
    this.requestRender();
  }

  showGraticule(on) {
    this.renderer.showGraticule = on;
    this.requestRender();
  }

  setDblClickZoom(enabled) { this.gestures.dblClickZoom = enabled; }
}

/** Punkte, die näher als so viele Pixel am vorigen liegen, lässt das gehaltene Teil aus */
const PIECE_STEP_PX = 0.5;

/** Pfad-Kontext für d3.geoPath, der einen SVG-Pfad baut und zu dichte Punkte überspringt */
class ThinPath {
  constructor(step) { this.step = step; this.parts = []; this.x = NaN; this.y = NaN; this.pending = null; }
  moveTo(x, y) { this._flush(); this.parts.push(`M${x.toFixed(1)},${y.toFixed(1)}`); this.x = x; this.y = y; }
  lineTo(x, y) {
    if (Math.abs(x - this.x) < this.step && Math.abs(y - this.y) < this.step) { this.pending = [x, y]; return; }
    this.pending = null;
    this.parts.push(`L${x.toFixed(1)},${y.toFixed(1)}`); this.x = x; this.y = y;
  }
  closePath() { this.pending = null; this.parts.push("Z"); }
  arc() {}
  _flush() { if (this.pending) this.parts.push(`L${this.pending[0].toFixed(1)},${this.pending[1].toFixed(1)}`); this.pending = null; }
  toString() { this._flush(); return this.parts.join(""); }
}
