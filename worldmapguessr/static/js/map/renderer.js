// Canvas-Renderer: Meer, Gradnetz, Schelf-Saum, Kontinente und eingesetzte Teile.
// Staaten sind bis zum Einsetzen unsichtbar (keine Grenzen, keine Markierung) – erst ein richtig
// eingesetzter Staat erscheint aufgehellt mit seinem Umriss.
//
// Helligkeitsstufen: Das Land startet fast schwarz (--land). Jedes eingesetzte Teil addiert eine
// Stufe (Canvas "lighter" = additive Mischung), unabhängig von der Reihenfolge. Wo alle Ebenen
// eingesetzt sind (Kontinent + Staat …), ist das Land fast weiß (--land-top).

import { lodPath, LOD_IDLE_PX2, LOD_MOVING_PX2 } from "./lod.js";
import { touchesCut } from "./geometry.js";

const PLACED_FADE_MS = 500;
const TOKENS = ["outside", "sea", "sea-shelf", "land", "land-top", "coast", "border"];
/** Eingesetzte Staaten, die kleiner als so viele Pixel erscheinen, bekommen einen Ring */
const TINY_PX = 5;
const TINY_RING_R = 3.5;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.dpr = 1;
    this.colors = {};
    this.placed = new Map(); // Feature-Key → Startzeit der Aufhell-Animation
    this.levels = 2;         // Anzahl der Ebenen (Kontinente, Staaten …) → Schrittweite der Aufhellung
    this.showGraticule = false;
    this.graticule = d3.geoGraticule10();
    this.readColors();

    // Theme-Wechsel (System oder data-theme) → Farben neu lesen
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => this.readColors());
    new MutationObserver(() => this.readColors())
      .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const t of TOKENS) this.colors[t] = cs.getPropertyValue(`--${t}`).trim();
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

  /**
   * Additive Farbe für eine Stufe: (land-top − land) / Ebenen, beim Einblenden anteilig.
   * Mit globalCompositeOperation "lighter" summieren sich überlappende Teile zu Stufen.
   */
  _placedStep(key, now) {
    const t0 = this.placed.get(key);
    if (t0 === undefined) return null;
    const t = Math.min(1, (now - t0) / PLACED_FADE_MS);
    const a = d3.rgb(this.colors.land);
    const b = d3.rgb(this.colors["land-top"]);
    const f = t / this.levels;
    return d3.rgb((b.r - a.r) * f, (b.g - a.g) * f, (b.b - a.b) * f).toString();
  }

  /**
   * @param {d3.GeoProjection} projection      mit Schnitt an der Datumsgrenze
   * @param {d3.GeoProjection} fastProjection  gleiche Ansicht ohne Schnitt (für Teile abseits der Schnittlinie)
   * @param {{continents: object[], countries: object[]}} layers
   * @param {boolean} moving  während Interaktion: gröber und ohne Schelf-Saum
   * @param {(part: object) => boolean} visible  Teile außerhalb des Bildausschnitts überspringen
   */
  draw(projection, fastProjection, layers, moving, visible = () => true) {
    const { ctx, colors: c } = this;
    const now = performance.now();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = c.outside;
    ctx.fillRect(0, 0, this.w, this.h);

    const plain = d3.geoPath(projection, ctx);
    const lod = moving ? LOD_MOVING_PX2 : LOD_IDLE_PX2;
    const clipped = lodPath(projection, lod);
    const fast = lodPath(fastProjection, lod);
    const cut = 180 - projection.rotate()[0]; // Längengrad der Schnittlinie
    /** Alle sichtbaren Einzelteile eines Features in einen Path2D */
    const toPath2D = (f) => {
      const p = new Path2D();
      clipped.context(p);
      fast.context(p);
      for (const part of f.parts) {
        if (!visible(part)) continue;
        (touchesCut(part, ((cut + 540) % 360) - 180) ? clipped : fast)(part.geometry);
      }
      return p;
    };

    // Meer
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

    const continents = layers.continents.map((f) => ({ key: f.key, p: toPath2D(f) }));
    ctx.lineJoin = "round";

    // Heller Saum entlang der Küste (Schelf); beim Bewegen weggelassen, spart Zeit
    if (!moving) {
      ctx.strokeStyle = c["sea-shelf"];
      ctx.lineWidth = 5;
      for (const s of continents) ctx.stroke(s.p);
    }

    ctx.fillStyle = c.land;
    for (const s of continents) ctx.fill(s.p);

    // Eingesetzte Teile: je eine Helligkeitsstufe addieren
    const countries = [];
    ctx.globalCompositeOperation = "lighter";
    for (const s of continents) {
      const step = this._placedStep(s.key, now);
      if (!step) continue;
      ctx.fillStyle = step;
      ctx.fill(s.p);
    }
    for (const f of layers.countries) {
      const step = this._placedStep(f.key, now);
      if (!step) continue;
      const p = toPath2D(f);
      countries.push(p);
      ctx.fillStyle = step;
      ctx.fill(p);
    }
    ctx.globalCompositeOperation = "source-over";

    // Umrisse eingesetzter Staaten
    ctx.strokeStyle = c.border;
    ctx.lineWidth = 0.6;
    for (const p of countries) ctx.stroke(p);

    // Küsten und Kontinentgrenzen

    ctx.strokeStyle = c.coast;
    ctx.lineWidth = 0.7;
    for (const s of continents) ctx.stroke(s.p);

    this._drawTinyMarkers(projection, layers.countries, now);
  }

  /** Ringe für eingesetzte Staaten, die in der aktuellen Ansicht kaum sichtbar wären */
  _drawTinyMarkers(projection, countries, now) {
    const { ctx, colors: c } = this;
    const scale = projection.scale();
    ctx.lineWidth = 1;
    for (const f of countries) {
      const step = this._placedStep(f.key, now);
      if (!step || Math.sqrt(f.geom.area) * scale >= TINY_PX) continue;
      const p = projection(f.geom.anchor);
      if (!p || p[0] < -10 || p[1] < -10 || p[0] > this.w + 10 || p[1] > this.h + 10) continue;
      ctx.beginPath();
      ctx.arc(p[0], p[1], TINY_RING_R, 0, 2 * Math.PI);
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = step;
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = c.coast;
      ctx.stroke();
    }
  }
}
