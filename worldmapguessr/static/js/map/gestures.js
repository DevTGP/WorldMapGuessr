// Eingabe auf der Karte: Ziehen (horizontal = drehen, vertikal = verschieben), Mausrad-Zoom,
// Pinch-Zoom, Doppelklick-Zoom. Ein Klick ohne Bewegung wird als "click" an die Karte gemeldet.

const CLICK_TOLERANCE_PX = 4;

export class Gestures {
  constructor(map) {
    this.map = map;
    this.el = map.canvas;
    this.dblClickZoom = true;
    this.pointers = new Map(); // pointerId → [x, y]
    this.drag = null;
    this.pinch = null;

    const el = this.el;
    el.addEventListener("pointerdown", (e) => this._down(e));
    el.addEventListener("pointermove", (e) => this._move(e));
    el.addEventListener("pointerup", (e) => this._up(e));
    el.addEventListener("pointercancel", (e) => this._up(e, true));
    el.addEventListener("wheel", (e) => this._wheel(e), { passive: false });
    el.addEventListener("dblclick", (e) => this._dblclick(e));
    el.addEventListener("contextmenu", (e) => map._emit("contextmenu", e));
  }

  _down(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    this.el.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (this.pointers.size === 1) this._startDrag(e.clientX, e.clientY);
    else if (this.pointers.size === 2) this._startPinch();
  }

  _startDrag(x, y) {
    const map = this.map;
    const grab = map.invert(x, y);
    this.drag = {
      start: [x, y],
      view: { ...map.view },
      rate: map.degPerPx(grab ?? [-map.view.lambda, 0]),
      moved: false,
    };
  }

  _startPinch() {
    const [a, b] = [...this.pointers.values()];
    this.drag = null;
    this.pinch = { mid: mid(a, b), dist: dist(a, b) };
  }

  _move(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const map = this.map;

    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const m = mid(a, b);
      const d = dist(a, b);
      map.markMoving();
      let v = map.zoomedView(map.view, m[0], m[1], d / this.pinch.dist);
      const rate = map.degPerPx(map.invert(m[0], m[1]));
      v = { ...v, lambda: v.lambda + (m[0] - this.pinch.mid[0]) * rate, ty: v.ty + (m[1] - this.pinch.mid[1]) };
      map.setView(v);
      this.pinch = { mid: m, dist: d };
      return;
    }

    const drag = this.drag;
    if (!drag) return;
    const dx = e.clientX - drag.start[0];
    const dy = e.clientY - drag.start[1];
    if (!drag.moved && Math.hypot(dx, dy) < CLICK_TOLERANCE_PX) return;
    drag.moved = true;
    this.el.classList.add("dragging");
    map.markMoving();
    map.setView({ ...drag.view, lambda: drag.view.lambda + dx * drag.rate, ty: drag.view.ty + dy });
  }

  _up(e, cancelled = false) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const drag = this.drag;
    if (this.pointers.size === 0) {
      this.el.classList.remove("dragging");
      if (drag && !drag.moved && !cancelled && !this.pinch) this.map._emit("click", e);
      this.drag = null;
      this.pinch = null;
    } else if (this.pointers.size === 1) {
      // Pinch beendet: mit dem verbleibenden Finger weiterziehen
      this.pinch = null;
      const [p] = this.pointers.values();
      this._startDrag(p[0], p[1]);
      this.drag.moved = true;
    }
  }

  _wheel(e) {
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002;
    const factor = Math.pow(2, -e.deltaY * unit * (e.ctrlKey ? 5 : 1));
    this.map.markMoving();
    this.map.zoomAt(e.clientX, e.clientY, factor);
  }

  _dblclick(e) {
    if (!this.dblClickZoom) return;
    const map = this.map;
    const from = map.view;
    const factor = e.shiftKey ? 0.5 : 2;
    map.animate((t) => map.zoomedView(from, e.clientX, e.clientY, Math.pow(factor, t)), 300);
  }
}

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
