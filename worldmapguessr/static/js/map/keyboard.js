// Tastatursteuerung der Karte: WASD bzw. Pfeiltasten bewegen, Q/E zoomen – gleichmäßig, solange die Taste
// gedrückt ist; Shift beschleunigt. Empfindlichkeit aus den Einstellungen (settings/prefs.js).
// Nicht aktiv, solange ein Dialog offen ist, in ein Feld getippt wird oder das Hauptmenü zu sehen ist.

import { prefs } from "../settings/prefs.js";

const PAN_PX_PER_S = 650;   // Bewegung in Bildschirmpixeln pro Sekunde
const ZOOM_PER_S = 2.4;     // Zoomfaktor pro Sekunde
const SHIFT_FACTOR = 2.5;   // Shift: so viel schneller (Zoom: Exponent)
const MAX_DT_S = 0.05;      // längere Frame-Pausen nicht nachholen

/** Taste (physische Position, unabhängig vom Tastaturlayout) → [dx, dy, zoom] */
const KEYS = {
  KeyW: [0, 1, 0], ArrowUp: [0, 1, 0],
  KeyS: [0, -1, 0], ArrowDown: [0, -1, 0],
  KeyA: [1, 0, 0], ArrowLeft: [1, 0, 0],
  KeyD: [-1, 0, 0], ArrowRight: [-1, 0, 0],
  KeyE: [0, 0, 1],
  KeyQ: [0, 0, -1],
};

export class KeyboardControl {
  /** @param {import("./map.js").WorldMap} map */
  constructor(map) {
    this.map = map;
    this.down = new Set();
    this.shift = false;
    this.raf = 0;
    this.last = null;
    this._frame = this._frame.bind(this);
    addEventListener("keydown", (e) => this._key(e, true));
    addEventListener("keyup", (e) => this._key(e, false));
    addEventListener("blur", () => this.down.clear());
    document.addEventListener("visibilitychange", () => this.down.clear());
  }

  /** Darf die Tastatur die Karte gerade bewegen? */
  static active(e) {
    if (e && (e.metaKey || e.ctrlKey || e.altKey)) return false;
    if (document.querySelector("dialog[open]") || document.body.classList.contains("at-home")) return false;
    return !e?.target?.closest?.("input, textarea, select, [contenteditable]");
  }

  _key(e, pressed) {
    this.shift = e.shiftKey;
    if (!(e.code in KEYS)) return;
    if (!pressed) {
      this.down.delete(e.code);
      return;
    }
    if (!KeyboardControl.active(e)) return;
    e.preventDefault();
    this.down.add(e.code);
    if (!this.raf) {
      this.last = null;
      this.raf = requestAnimationFrame(this._frame);
    }
  }

  _frame(t) {
    if (!this.down.size || !KeyboardControl.active()) {
      this.down.clear();
      this.raf = 0;
      return;
    }
    const dt = this.last === null ? 1 / 60 : Math.min(MAX_DT_S, (t - this.last) / 1000);
    this.last = t;
    let dx = 0, dy = 0, dz = 0;
    for (const code of this.down) {
      const [x, y, z] = KEYS[code];
      dx += x; dy += y; dz += z;
    }
    const fast = this.shift ? SHIFT_FACTOR : 1;
    const map = this.map;
    const r = map.canvas.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    map.markMoving();
    if (dz) map.zoomAt(cx, cy, Math.pow(ZOOM_PER_S, Math.sign(dz) * dt * fast * prefs.get("zoomSpeed")));
    if (dx || dy) {
      const px = PAN_PX_PER_S * dt * fast * prefs.get("moveSpeed");
      const len = Math.hypot(dx, dy); // diagonal nicht schneller
      const v = map.view;
      const rate = map.degPerPx(map.invert(cx, cy) ?? undefined);
      map.setView({ ...v, lambda: v.lambda + (dx / len) * px * rate, ty: v.ty + (dy / len) * px });
    }
    this.raf = requestAnimationFrame(this._frame);
  }
}
