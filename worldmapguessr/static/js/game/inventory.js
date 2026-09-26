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
    this.countEl = container.parentElement.querySelector(".label");
    // Viele Items: horizontal scrollen, auch mit dem normalen Mausrad
    container.addEventListener("wheel", (e) => {
      if (container.scrollWidth <= container.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      container.scrollLeft += e.deltaY;
    }, { passive: false });
    container.addEventListener("scroll", () => this._edges(), { passive: true });
    addEventListener("resize", () => this._edges());
  }

  clear() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.pieces.clear();
    this.container.replaceChildren();
    this._changed();
  }

  add(pieces) {
    const refill = this.container.children.length > 0;
    for (const p of pieces) {
      this.pieces.set(p.id, p);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slot entering";
      btn.dataset.id = p.id;
      btn.dataset.state = "ready";
      btn.setAttribute("aria-label", "Item aufnehmen");
      btn.innerHTML = '<svg aria-hidden="true" preserveAspectRatio="xMidYMid meet"><path class="shape"/></svg>';
      btn.addEventListener("click", () => this.onSlotClick(p.id));
      this.container.append(btn);
      this._drawIcon(p);
      requestAnimationFrame(() => requestAnimationFrame(() => btn.classList.remove("entering")));
    }
    this._changed();
    // Nachschub sichtbar machen (neue Items kommen hinten dazu)
    if (pieces.length && refill) requestAnimationFrame(() => this.container.scrollTo({ left: this.container.scrollWidth, behavior: "smooth" }));
  }

  /** Slot in den sichtbaren Bereich scrollen (z. B. bevor ein Item dorthin zurückfliegt) */
  reveal(id) {
    const el = this.slot(id);
    if (!el) return;
    const c = this.container;
    const left = el.offsetLeft - c.offsetLeft, right = left + el.offsetWidth;
    if (left < c.scrollLeft) c.scrollLeft = left;
    else if (right > c.scrollLeft + c.clientWidth) c.scrollLeft = right - c.clientWidth;
  }

  _changed() {
    const n = this.openCount;
    this.countEl.innerHTML = n ? `Inventar <b>${n}</b>` : "Inventar";
    this._edges();
  }

  /** Ausblendung an den Rändern, wenn es dort weitergeht */
  _edges() {
    const c = this.container;
    c.classList.toggle("more-left", c.scrollLeft > 2);
    c.classList.toggle("more-right", c.scrollLeft + c.clientWidth < c.scrollWidth - 2);
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
      const t = setTimeout(() => {
        this.timers.delete(t);
        if (this.state(id) === "placed") this._remove(id);
      }, REMOVE_AFTER_MS);
      this.timers.add(t);
    }
    this._changed();
  }

  /** Slot entfernen (mit kurzer Ausblende-Animation) */
  remove(id) { this._remove(id); }

  _remove(id) {
    const el = this.slot(id);
    this.pieces.delete(id);
    this._changed();
    if (!el) return;
    el.dataset.state = "removed";
    el.removeAttribute("data-id"); // gleicher Key kann sofort neu ins Inventar kommen
    el.classList.add("leaving");
    const gone = () => { el.remove(); this._edges(); };
    el.addEventListener("transitionend", gone, { once: true });
    setTimeout(gone, 400); // Fallback ohne Transition
  }

  /** Anzahl noch nicht eingesetzter Teile */
  get openCount() {
    return [...this.pieces.keys()].filter((id) => this.state(id) !== "placed").length;
  }
}
