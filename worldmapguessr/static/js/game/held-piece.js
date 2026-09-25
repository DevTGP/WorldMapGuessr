// Das Teil "in der Hand": folgt dem Mauszeiger in der aktuellen Kartenansicht
// (gleiche Drehung, gleicher Zoom – sieht also genauso aus wie an seinem Zielort).

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const dur = (ms) => (reduceMotion ? 0 : ms);

/** Einrast-Toleranz in Bildschirmpixeln: klein, wächst mäßig mit der Teilgröße */
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

  /** Abstand Mauszeiger ↔ echte Position des Ankers innerhalb der Toleranz? */
  fits() {
    const [tx, ty] = this.map.toScreen(this.piece.geom.anchor);
    const tolerance = Math.max(MIN_TOLERANCE_PX, TOLERANCE_FACTOR * this._sizePx());
    return Math.hypot(tx - this.pointer[0], ty - this.pointer[1]) <= tolerance;
  }

  /** Auf die exakte Position einrasten lassen */
  snap() {
    const r = this.map.canvas.getBoundingClientRect();
    return this._flyTo(`translate(${r.left},${r.top}) scale(1)`, 160);
  }

  /** Zurück in den Inventar-Slot fliegen */
  returnTo(targetSvg) {
    const r = targetSvg.getBoundingClientRect();
    this.ringEl.attr("hidden", true);
    const b = this.pathEl.node().getBBox();
    const bw = Math.max(b.width, 1);
    const bh = Math.max(b.height, 1);
    const s = Math.min(r.width / bw, r.height / bh, 400);
    const tx = r.left + (r.width - bw * s) / 2 - b.x * s;
    const ty = r.top + (r.height - bh * s) / 2 - b.y * s;
    return this._flyTo(`translate(${tx},${ty}) scale(${s})`, 450);
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
    this.pathEl.attr("d", this.map.svgPath(this.piece.feature));
    const r = this.map.canvas.getBoundingClientRect();
    const [ax, ay] = this.map.toScreen(this.piece.geom.anchor);
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
