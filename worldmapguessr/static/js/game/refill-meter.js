// Anzeige am Inventar: wie viele Treffer noch fehlen, bis neue Teile kommen.
// Einzelspiel: eigene Treffer. Lobby: Treffer der ganzen Lobby (gemeinsamer Zähler vom Server).

import { t } from "../i18n/index.js";

const MAX_PIPS = 10; // darüber nur Text

export class RefillMeter {
  constructor(el) {
    this.el = el;
    this.pips = el.querySelector(".pips");
    this.text = el.querySelector(".refill-text");
    this.lastSince = 0;
  }

  /**
   * @param {{since: number, every: number, count: number, poolLeft: number, shared?: boolean}} s
   *   since: Treffer seit dem letzten Nachschub · every: Treffer pro Nachschub · count: neue Teile
   *   poolLeft: Teile im Vorrat · shared: Lobby (Treffer aller zählen)
   */
  update({ since, every, count, poolLeft, shared = false }) {
    this.el.hidden = false;
    const empty = poolLeft <= 0;
    this.el.classList.toggle("empty", empty);
    if (empty) {
      this.pips.replaceChildren();
      this.text.textContent = t("refill.empty");
      this.el.setAttribute("aria-label", this.text.textContent);
      this.lastSince = 0;
      return;
    }

    const left = Math.max(0, every - since);
    const next = Math.min(count, poolLeft);
    this.pips.replaceChildren(...(every <= MAX_PIPS
      ? Array.from({ length: every }, (_, i) => {
        const pip = document.createElement("i");
        if (i < since) pip.className = "on";
        return pip;
      })
      : []));
    this.text.innerHTML = t(shared ? "refill.textLobby" : "refill.text", { n: left });
    const [a, b] = this.text.querySelectorAll("b");
    a.textContent = left;
    b.textContent = `+${next}`;
    this.el.setAttribute("aria-label", t("refill.label", { left, n: next }));

    // Nachschub gerade gekommen → kurz aufleuchten
    if (since < this.lastSince) {
      this.el.classList.remove("pulse");
      void this.el.offsetWidth;
      this.el.classList.add("pulse");
    }
    this.lastSince = since;
  }

  hide() {
    this.el.hidden = true;
    this.lastSince = 0;
  }
}
