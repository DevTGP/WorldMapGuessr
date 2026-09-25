// Weltkarte: Daten, Projektion und Ansicht (Drehung um die Längsachse, Zoom, vertikale Verschiebung).
// Globale Abhängigkeiten (CDN): d3, topojson (inkl. presimplify).

import { Renderer } from "./renderer.js";
import { Gestures } from "./gestures.js";
import { lodPath, LOD_PIECE_PX2 } from "./lod.js";
import { featureGeometry, splitParts } from "./geometry.js";

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 40; // Europa liegt in 1:10m vor; für Kleinststaaten weit hineinzoomen
const IDLE_AFTER_MS = 140;   // so lange nach der letzten Bewegung wird in voller Qualität gezeichnet
const VIEW_RADIUS_SAFETY = 1.8;
const PAN_MARGIN = 0.22;     // vertikaler Spielraum beim Zoomen (Anteil der Fensterhöhe), z. B. für Antarktika über dem Inventar
const PAN_MARGIN_RAMP = 0.5; // Spielraum wächst von Zoom 1 bis 1 + RAMP stetig an (kein Sprung beim Herauszoomen)
export const ROTATE_STEP_DEG = 45; // Dreh-Pfeile: π/4

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Lädt die Kartendaten und liefert die fertige Karte.
 * @returns {Promise<WorldMap>}
 */
export async function createMap({ canvas, dataUrl }) {
  const res = await fetch(dataUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const topo = topojson.presimplify(await res.json(), topojson.sphericalTriangleArea);
  const layer = (object, kind) => topojson.feature(topo, topo.objects[object]).features.map((f) => {
    f.kind = kind;
    f.key = `${kind}:${f.id}`;
    f.geom = featureGeometry(f); // Anker, Fläche, Mittel-Länge
    f.parts = splitParts(f.geometry); // für das Überspringen unsichtbarer Teile beim Zeichnen
    return f;
  });
  return new WorldMap(canvas, {
    continents: layer("continents", "continent"),
    countries: layer("countries", "country"),
  });
}

export class WorldMap {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{continents: object[], countries: object[]}} layers
   */
  constructor(canvas, layers) {
    this.canvas = canvas;
    this.layers = layers;
    /** Alle Features, die als Spielteil taugen (Kontinente + Staaten) */
    this.features = [...layers.continents, ...layers.countries];
    this.byKey = new Map(this.features.map((f) => [f.key, f]));
    // Vollständige Projektion: Schnitt an der Datumsgrenze, Nachverdichtung langer Kanten (Kartenrand)
    this.projection = d3.geoNaturalEarth1().precision(0.5);
    // Schnelle Variante ohne Schnitt und ohne Nachverdichtung – für alle Teile, die die Schnittlinie
    // nicht berühren. Spart die teure Polygon-Klippung von d3 für den Großteil der Daten.
    this.fastProjection = d3.geoNaturalEarth1().precision(0).preclip((stream) => stream);
    this.view = { lambda: 0, k: 1, ty: 0 }; // lambda: Drehung in Grad (positiv = Karte nach rechts)
    this.size = { w: 0, h: 0 };
    this.renderer = new Renderer(canvas);
    this.renderer.levels = Object.keys(layers).length; // Kontinente + Staaten = 2 Stufen bis fast weiß
    this.renderer.onColorsChanged = () => this.requestRender();
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
    this._apply(this.view, this.fastProjection);
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
      this.renderer.draw(this.projection, this.fastProjection, this.layers, this._moving, this.visibleTest());
      this._emit("view", this.view);
      if (this.renderer.animating) this.requestRender();
    });
  }

  /**
   * Schneller Test, ob ein Teil (Mittelpunkt + Radius) im Bild liegen kann.
   * Großzügig gerechnet: Natural Earth verzerrt lokal höchstens um etwa Faktor 1,6.
   */
  visibleTest() {
    const { w, h } = this.size;
    const center = this.projection.invert([w / 2, h / 2]);
    const viewRadius = (Math.hypot(w, h) / 2 / this.projection.scale()) * VIEW_RADIUS_SAFETY;
    if (!center || viewRadius >= Math.PI / 2) return () => true;
    return (part) => part.center === null || d3.geoDistance(center, part.center) - part.radius < viewRadius;
  }

  /** SVG-Pfad eines Features in der aktuellen Ansicht (für das gehaltene Teil) */
  svgPath(feature) {
    return lodPath(this.projection, LOD_PIECE_PX2)(feature);
  }

  // ---------- Spielzustand ----------
  setPlaced(key, placed) {
    this.renderer.setPlaced(key, placed);
    this.requestRender();
  }

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
