// Inventar am unteren Bildschirmrand: ein Slot pro Umriss. Teile kommen in Wellen hinzu;
// richtig eingesetzte Teile zeigen kurz ihren Namen und verschwinden dann.

import { iconPath } from "../map/icon.js";

const ICON_W = 136;
const ICON_H = 76;
const REMOVE_AFTER_MS = 1300;
const CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';

export class Inventory {
  /**
   * @param {HTMLElement} container
   * @param {(id: string) => void} onSlotClick
   */
  constructor(container, onSlotClick) {
    this.container = container;
    this.onSlotClick = onSlotClick;
    this.pieces = new Map(); // id → piece (nur Teile, die aktuell einen Slot haben)
    this.timers = new Set();
  }

  clear() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.pieces.clear();
    this.container.replaceChildren();
  }

  add(pieces) {
    for (const p of pieces) {
      this.pieces.set(p.id, p);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot entering";
      btn.dataset.id = p.id;
      btn.dataset.state = "ready";
      btn.setAttribute("aria-label", "Umriss aufnehmen");
      btn.innerHTML = '<svg aria-hidden="true" preserveAspectRatio="xMidYMid meet"><path class="shape"/></svg>';
      btn.addEventListener("click", () => this.onSlotClick(p.id));
      this.container.append(btn);
      this._drawIcon(p);
      requestAnimationFrame(() => requestAnimationFrame(() => btn.classList.remove("entering")));
    }
  }

  _drawIcon(p) {
    const svg = this.iconSvg(p.id);
    svg.setAttribute("viewBox", `0 0 ${ICON_W} ${ICON_H}`);
    svg.querySelector("path").setAttribute("d", iconPath(p.feature, ICON_W, ICON_H));
  }

  slot(id) { return this.container.querySelector(`.slot[data-id="${id}"]`); }
  iconSvg(id) { return this.slot(id).querySelector("svg"); }
  state(id) { return this.slot(id)?.dataset.state; }

  setState(id, state) {
    const el = this.slot(id);
    el.dataset.state = state;
    if (state === "placed") {
      const p = this.pieces.get(id);
      el.setAttribute("aria-label", `${p.name} – eingesetzt`);
      el.setAttribute("aria-disabled", "true");
      const done = document.createElement("span");
      done.className = "done";
      done.innerHTML = `${CHECK}${p.name}`;
      el.append(done);
      const t = setTimeout(() => { this.timers.delete(t); this._remove(id); }, REMOVE_AFTER_MS);
      this.timers.add(t);
    }
  }

  _remove(id) {
    const el = this.slot(id);
    if (!el) return;
    this.pieces.delete(id);
    el.classList.add("leaving");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400); // Fallback ohne Transition
  }

  /** Anzahl noch nicht eingesetzter Teile */
  get openCount() {
    return [...this.pieces.keys()].filter((id) => this.state(id) !== "placed").length;
  }
}
