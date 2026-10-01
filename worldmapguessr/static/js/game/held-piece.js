// Das Teil "in der Hand": folgt dem Mauszeiger in der aktuellen Kartenansicht
// (gleiche Drehung, gleicher Zoom – sieht also genauso aus wie an seinem Zielort).
// Mit „Items gedreht“ ist es zusätzlich um piece.rotation (Grad, im Uhrzeigersinn) um seinen Anker gedreht;
// beim Einsetzen dreht es sich in die richtige Lage.
//
// Aufbau: <g> (Verschiebung/Flug) › <g class="rot"> (Drehung um den Anker) › Halo + Umriss + Ring
// Der Halo ist ein breiter, halbtransparenter Strich unter dem Umriss statt eines CSS-drop-shadow: Ein
// Filter muss bei jeder Bewegung die ganze Fläche des Teils neu weichzeichnen (Russland: 11 statt 58 Bilder/s).
// Dem Mauszeiger folgt die ganze Ebene per CSS-Transform (eigene Compositing-Ebene): Mausbewegungen zeichnen
// das Teil nicht neu, nur Änderungen der Kartenansicht. Für Flüge (Einrasten, Zurück, Senden) wandert die
// Verschiebung zurück in das transform-Attribut der Gruppe.

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
/** Kleinststaaten (Vatikanstadt, Monaco, San Marino …; kleiner als TINY_KM im Quadrat): Ein Klick bis
 *  TINY_RADIUS_KM um den Anker zählt – ein fester Radius auf der Erde, der beim Hineinzoomen mitwächst.
 *  Sonst wären sie beim Hineinzoomen kaum zu treffen (die Vatikanstadt ist selbst bei größtem Zoom unter 1 px). */
const TINY_KM = 20;
const TINY_RADIUS_KM = 10;
const EARTH_R_KM = 6371.0088;

export class HeldPiece {
  constructor(map, layerEl) {
    this.map = map;
    this.layerEl = layerEl;
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
    this._angle = piece.rotation ?? 0;
    this.pointer = pointer;
    this.g = this.layer.append("g").attr("data-piece", piece.id);
    this.rotEl = this.g.append("g").attr("class", "rot");
    this.haloEl = this.rotEl.append("path").attr("class", "halo");
    this.pathEl = this.rotEl.append("path").attr("class", "shape");
    this.ringEl = this.rotEl.append("circle").attr("class", "tiny-ring").attr("r", TINY_RING_R);
    this._redraw();
  }

  /** Drehung übernehmen (piece.rotation) – kurz animiert, auf dem kürzesten Weg */
  rotate() {
    if (!this.g || this._flying) return;
    const from = this._angle ?? 0;
    let to = this.piece.rotation ?? 0;
    while (to - from > 180) to -= 360;
    while (to - from < -180) to += 360;
    this._angle = to;
    const [cx, cy] = this._anchorLocal();
    this.rotEl.interrupt().transition().duration(dur(110)).ease(d3.easeCubicOut)
      .attrTween("transform", () => (k) => `rotate(${from + (to - from) * k},${cx},${cy})`);
  }

  /** Anker des Teils in den Koordinaten des Umrisses (Kartenfläche) */
  _anchorLocal() {
    const r = this.map.canvas.getBoundingClientRect();
    const [ax, ay] = this.map.toScreen(this.piece.geom.anchor);
    return [ax - r.left, ay - r.top];
  }

  _applyRotation() {
    const [cx, cy] = this._anchorLocal();
    this.rotEl.interrupt().attr("transform", this._angle ? `rotate(${this._angle},${cx},${cy})` : null);
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
    return Math.hypot(tx - px, ty - py) <= this._tolerancePx();
  }

  /** Radius um den Anker (px), in dem ein Klick immer zählt */
  _tolerancePx() {
    const km = Math.sqrt(this.piece.geom.area) * EARTH_R_KM;
    const geo = km < TINY_KM ? (TINY_RADIUS_KM / EARTH_R_KM) * this.map.projection.scale() : 0;
    return Math.max(MIN_TOLERANCE_PX, TOLERANCE_FACTOR * this._sizePx(), geo);
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

  /** Auf die exakte Position einrasten lassen (und in die richtige Lage drehen) */
  snap() {
    const r = this.map.canvas.getBoundingClientRect();
    const from = this._angle ?? 0;
    const ms = from ? 240 : 160;
    if (from) {
      const [cx, cy] = this._anchorLocal();
      this.rotEl.interrupt().transition().duration(dur(ms)).ease(d3.easeCubicInOut)
        .attrTween("transform", () => (k) => `rotate(${from * (1 - k)},${cx},${cy})`);
    }
    return this._flyTo(`translate(${r.left},${r.top}) scale(1)`, ms);
  }

  /** In ein Mitspieler-Feld fliegen (Senden) */
  sendTo(targetEl) {
    return this.returnTo(targetEl, 380);
  }

  /** Zurück in den Inventar-Slot fliegen */
  returnTo(targetSvg, ms = 450) {
    const r = targetSvg.getBoundingClientRect();
    this.ringEl.attr("hidden", true);
    const b = this.g.node().getBBox(); // samt Drehung (wie das gedrehte Icon im Slot)
    const bw = Math.max(b.width, 1);
    const bh = Math.max(b.height, 1);
    const s = Math.min(r.width / bw, r.height / bh, 400);
    const tx = r.left + (r.width - bw * s) / 2 - b.x * s;
    const ty = r.top + (r.height - bh * s) / 2 - b.y * s;
    return this._flyTo(`translate(${tx},${ty}) scale(${s})`, ms);
  }

  /** Fehlwurf mit Verlust: Teil verblasst an Ort und Stelle (es geht zurück in den Vorrat) */
  vanish(ms = 420) {
    const g = this.g;
    if (!g) return Promise.resolve();
    this._flying = true;
    this.ringEl.attr("hidden", true);
    g.classed("lost", true);
    return g.transition().duration(dur(ms)).ease(d3.easeCubicIn)
      .style("opacity", 0)
      .end()
      .catch(() => {})
      .then(() => { if (this.g === g) this.cancel(); });
  }

  cancel() {
    if (this.g) this.g.interrupt().remove();
    this.layerEl.style.transform = "";
    this.g = null;
    this.piece = null;
    this._angle = 0;
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
    const d = this.map.svgPath(this.piece.feature,
      [[px - r.width - m, py - r.height - m], [px + r.width + m, py + r.height + m]]);
    this.pathEl.attr("d", d);
    this.haloEl.attr("d", d);
    // Ring um winzige Items: zeigt, wo das Item liegt, und bei Kleinststaaten den Trefferbereich
    this.ringEl
      .attr("cx", ax - r.left)
      .attr("cy", ay - r.top)
      .attr("r", Math.max(TINY_RING_R, this._tolerancePx()))
      .attr("hidden", this._sizePx() < TINY_PX ? null : true);
    this._applyRotation(); // Anker verschiebt sich mit der Ansicht
    this._follow();
  }

  /** Verschiebung, bei der der Anker unter dem Mauszeiger liegt */
  _offset() {
    const [ax, ay] = this.map.toScreen(this.piece.geom.anchor);
    const r = this.map.canvas.getBoundingClientRect();
    return [this.pointer[0] - ax + r.left, this.pointer[1] - ay + r.top];
  }

  /** Verschieben, sodass der Anker unter dem Mauszeiger liegt */
  _follow() {
    if (!this.g || this._flying) return;
    const [dx, dy] = this._offset();
    this.layerEl.style.transform = `translate3d(${dx}px,${dy}px,0)`;
  }

  _flyTo(transform, ms) {
    const g = this.g;
    const [dx, dy] = this._offset();
    this.layerEl.style.transform = "";
    g.attr("transform", `translate(${dx},${dy}) scale(1)`);
    this._flying = true;
    return g.transition().duration(dur(ms)).ease(d3.easeCubicInOut)
      .attr("transform", transform)
      .end()
      .catch(() => {})
      .then(() => { if (this.g === g) this.cancel(); });
  }
}
