// Das Teil "in der Hand": folgt dem Mauszeiger in der aktuellen Kartenansicht
// (gleiche Drehung, gleicher Zoom – sieht also genauso aus wie an seinem Zielort).

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const dur = (ms) => (reduceMotion ? 0 : ms);

/** Klick in die Fläche des Items zählt – oder höchstens so viele Bildschirmpixel daneben
 *  (unabhängig vom Zoom immer gleich viele Pixel; Touch etwas großzügiger) */
const EDGE_TOLERANCE_PX = matchMedia("(pointer: coarse)").matches ? 12 : 6;
/** Prüfpunkte je Ring um den Klick (zwei Ringe: halbe und volle Toleranz) */
const EDGE_SAMPLES = 12;
/** Kleinststaaten (kleiner als die Toleranz): Nähe zum Anker genügt; wächst mäßig mit der Größe */
const MIN_TOLERANCE_PX = 6;
/** Unter dieser Bildschirmgröße bekommt das gehaltene Teil einen Ring, damit man es sieht */
const TINY_PX = 14;
const TINY_RING_R = 11;
const TOLERANCE_FACTOR = 0.05;

export class HeldPiece {
  constructor(map, layerEl) {
    this.map = map;
    this.layer = d3.select(layerEl);
    this.piece = null;
    this.g = null;
    this.pointer = [0, 0];
    this._flying = false;
    map.onView(() => this._redraw());
  }

  get active() { return this.piece !== null; }

  pick(piece, pointer) {
    this.cancel();
    this.piece = piece;
    this.pointer = pointer;
    this.g = this.layer.append("g").attr("data-piece", piece.id);
    this.pathEl = this.g.append("path");
    this.ringEl = this.g.append("circle").attr("class", "tiny-ring").attr("r", TINY_RING_R);
    this._redraw();
  }

  move(pointer) {
    this.pointer = pointer;
    this._follow();
  }

  /** Ungefähre Größe des Teils in Bildschirmpixeln */
  _sizePx() {
    return Math.sqrt(this.piece.geom.area) * this.map.projection.scale();
  }

  /**
   * Richtig eingesetzt, wenn der Klick in der Fläche des Items liegt (z. B. irgendwo in Südamerika)
   * oder höchstens EDGE_TOLERANCE_PX Bildschirmpixel neben ihrem Rand. Für winzige Items zählt
   * zusätzlich die Nähe zu ihrem Anker, damit sie trotz weniger Pixel treffbar bleiben.
   */
  fits() {
    const [px, py] = this.pointer;
    const parts = this._nearParts(px, py);
    if (parts.length) {
      if (this._inside(px, py, parts)) return true;
      for (const r of [EDGE_TOLERANCE_PX / 2, EDGE_TOLERANCE_PX]) {
        for (let i = 0; i < EDGE_SAMPLES; i++) {
          const a = (2 * Math.PI * (i + (r < EDGE_TOLERANCE_PX ? 0.5 : 0))) / EDGE_SAMPLES;
          if (this._inside(px + r * Math.cos(a), py + r * Math.sin(a), parts)) return true;
        }
      }
    }
    const [tx, ty] = this.map.toScreen(this.piece.geom.anchor);
    const tolerance = Math.max(MIN_TOLERANCE_PX, TOLERANCE_FACTOR * this._sizePx());
    return Math.hypot(tx - px, ty - py) <= tolerance;
  }

  /** Einzelteile des Items, die überhaupt in Reichweite des Klicks liegen (spart Rechenzeit bei Russland & Co.) */
  _nearParts(x, y) {
    const parts = this.piece.feature.parts;
    const center = this.map.invert(x, y);
    if (!center) return parts;
    const margin = (3 * EDGE_TOLERANCE_PX) / this.map.projection.scale(); // Bogenmaß, großzügig wegen Verzerrung
    return parts.filter((p) => p.center === null || d3.geoDistance(center, p.center) - p.radius < margin);
  }

  /** Liegt der Bildschirmpunkt (auf der Weltkugel) in einem der Einzelteile? */
  _inside(x, y, parts = this.piece.feature.parts) {
    const lonLat = this.map.invert(x, y);
    return lonLat !== null && parts.some((p) => p.geometry.type === "Polygon" && d3.geoContains(p.geometry, lonLat));
  }

  /** Auf die exakte Position einrasten lassen */
  snap() {
    const r = this.map.canvas.getBoundingClientRect();
    return this._flyTo(`translate(${r.left},${r.top}) scale(1)`, 160);
  }

  /** In ein Mitspieler-Feld fliegen (Senden) */
  sendTo(targetEl) {
    return this.returnTo(targetEl, 380);
  }

  /** Zurück in den Inventar-Slot fliegen */
  returnTo(targetSvg, ms = 450) {
    const r = targetSvg.getBoundingClientRect();
    this.ringEl.attr("hidden", true);
    const b = this.pathEl.node().getBBox();
    const bw = Math.max(b.width, 1);
    const bh = Math.max(b.height, 1);
    const s = Math.min(r.width / bw, r.height / bh, 400);
    const tx = r.left + (r.width - bw * s) / 2 - b.x * s;
    const ty = r.top + (r.height - bh * s) / 2 - b.y * s;
    return this._flyTo(`translate(${tx},${ty}) scale(${s})`, ms);
  }

  cancel() {
    if (this.g) this.g.interrupt().remove();
    this.g = null;
    this.piece = null;
    this._flying = false;
  }

  /** Pfad für die aktuelle Kartenansicht neu berechnen */
  _redraw() {
    if (!this.g || this._flying) return;
    // passende Detailstufe für den aktuellen Zoom nachladen (zeichnet danach von selbst neu)
    this.map.items.ensure(this.piece.feature, this.map.itemLevel(this.piece.feature));
    // Das Teil hängt mit seinem Anker am Mauszeiger, der im Kartenbereich bleibt: Sichtbar sein kann
    // daher höchstens ein Bereich von einer Kartenbreite/-höhe um den Anker. Nur der wird gezeichnet –
    // große Staaten bleiben so auch bei starkem Zoom flüssig.
    const r = this.map.canvas.getBoundingClientRect();
    const [ax, ay] = this.map.toScreen(this.piece.geom.anchor);
    const px = ax - r.left, py = ay - r.top, m = 20; // Anker in Kartenkoordinaten
    this.pathEl.attr("d", this.map.svgPath(this.piece.feature,
      [[px - r.width - m, py - r.height - m], [px + r.width + m, py + r.height + m]]));
    this.ringEl
      .attr("cx", ax - r.left)
      .attr("cy", ay - r.top)
      .attr("hidden", this._sizePx() < TINY_PX ? null : true);
    this._follow();
  }

  /** Verschieben, sodass der Anker unter dem Mauszeiger liegt */
  _follow() {
    if (!this.g || this._flying) return;
    const [ax, ay] = this.map.toScreen(this.piece.geom.anchor);
    const r = this.map.canvas.getBoundingClientRect();
    const dx = this.pointer[0] - ax + r.left;
    const dy = this.pointer[1] - ay + r.top;
    this.g.attr("transform", `translate(${dx},${dy}) scale(1)`);
  }

  _flyTo(transform, ms) {
    const g = this.g;
    this._flying = true;
    return g.transition().duration(dur(ms)).ease(d3.easeCubicInOut)
      .attr("transform", transform)
      .end()
      .catch(() => {})
      .then(() => { if (this.g === g) this.cancel(); });
  }
}
