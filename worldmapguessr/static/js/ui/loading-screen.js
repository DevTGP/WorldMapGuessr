// Ladebildschirm: Fortschrittsbalken über mehrere Phasen (Download, Aufbereitung, Menü …).
// Jede Phase hat ein Gewicht; report(anteil) innerhalb einer Phase wird auf den Gesamtfortschritt
// umgerechnet. Der Balken läuft nie rückwärts. Ein Schimmer (reine CSS-Transform-Animation, läuft
// auch weiter, wenn der Browser gerade rechnet) zeigt, dass noch etwas passiert.

const HIDE_DELAY_MS = 180;
const FADE_MS = 350;

export class LoadingScreen {
  /**
   * @param {HTMLElement} el   #loading
   * @param {{id: string, label: string, weight: number}[]} phases
   */
  constructor(el, phases) {
    this.el = el;
    this.fill = el.querySelector(".loading-fill");
    this.labelEl = el.querySelector(".loading-label");
    this.pctEl = el.querySelector(".loading-pct");
    this.detailEl = el.querySelector(".loading-detail");
    const total = phases.reduce((s, p) => s + p.weight, 0);
    let start = 0;
    this.phases = new Map(phases.map((p) => {
      const entry = { ...p, start: start / total, span: p.weight / total };
      start += p.weight;
      return [p.id, entry];
    }));
    this.current = null;
    this.value = 0;
    this.el.hidden = false;
  }

  /** Neue Phase beginnen (Beschriftung wechselt, Fortschritt springt an ihren Anfang) */
  enter(id, detail = "") {
    this.current = this.phases.get(id);
    this.labelEl.textContent = this.current.label;
    this.report(0, detail);
  }

  /**
   * Fortschritt innerhalb der aktuellen Phase.
   * @param {number|null} fraction  0…1, null = unbekannt (Balken bleibt, Schimmer läuft)
   * @param {string} [detail]       z. B. "1,2 / 3,8 MB"
   */
  report(fraction, detail) {
    if (detail !== undefined) this.detailEl.textContent = detail;
    if (fraction == null || !this.current) return;
    const f = Math.max(0, Math.min(1, fraction));
    this._set(this.current.start + f * this.current.span);
  }

  /** Alles fertig: auf 100 %, kurz stehen lassen, ausblenden */
  async done() {
    this.labelEl.textContent = "Fertig";
    this.detailEl.textContent = "";
    this._set(1);
    await wait(HIDE_DELAY_MS);
    this.el.classList.add("done");
    await wait(FADE_MS);
    this.el.hidden = true;
  }

  fail(message) {
    this.el.classList.add("failed");
    this.labelEl.textContent = "Die Karte konnte nicht geladen werden";
    this.detailEl.textContent = message;
    this.el.querySelector(".loading-retry").hidden = false;
  }

  _set(v) {
    this.value = Math.max(this.value, v); // nie rückwärts
    const pct = Math.round(this.value * 100);
    this.fill.style.transform = `scaleX(${this.value})`;
    this.pctEl.textContent = `${pct} %`;
    this.el.setAttribute("aria-valuenow", String(pct));
  }
}

/**
 * Dem Browser Zeit zum Zeichnen geben – nur wenn seit dem letzten Mal genug Zeit vergangen ist.
 * Nutzung: const tick = yielder(); … await tick();
 */
export function yielder(budgetMs = 14) {
  let last = performance.now();
  return async (force = false) => {
    if (!force && performance.now() - last < budgetMs) return false;
    await wait(0);
    last = performance.now();
    return true;
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
