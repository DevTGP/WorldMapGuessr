// Anzeige am Inventar: Countdown bis zur nächsten Wegnahme durch den Timer (bzw. restliche Schonfrist).
// Bekommt Sekundenwerte (Einzelspiel: RoundTimer.view(), Lobby: round.timer vom Server) und zählt
// selbst herunter.

import { t } from "../i18n/index.js";

const FRAME_MS = 200;
const URGENT_S = 5;

export class TimerMeter {
  constructor(el) {
    this.el = el;
    this.text = el.querySelector(".timer-text");
    this.ring = el.querySelector(".timer-ring circle.v");
    this.id = null;
  }

  /** @param {{nextIn: number, graceLeft: number, every: number, take: number}|null} timer */
  set(timer) {
    if (!timer) return this.hide();
    const now = performance.now();
    this.deadline = now + timer.nextIn * 1000;
    this.graceUntil = now + timer.graceLeft * 1000;
    this.every = timer.every;
    this.take = timer.take;
    this.paused = !!timer.paused;
    this.endspurt = !!timer.endspurt;
    this.frozenAt = undefined;
    this.el.hidden = false;
    if (!this.id) this.id = setInterval(() => this._render(), FRAME_MS);
    this._render();
  }

  hide() {
    clearInterval(this.id);
    this.id = null;
    this.el.hidden = true;
  }

  _render() {
    if (this.endspurt) {
      this.text.innerHTML = t("timer.endspurt");
      this.ring.style.strokeDashoffset = "0";
      this.el.classList.add("grace");
      this.el.classList.remove("urgent");
      this.el.setAttribute("aria-label", t("timer.endspurtLabel"));
      return;
    }
    if (this.paused) {
      // angehalten (Einzelspiel mit offenem Menü): Werte einfrieren
      const shift = performance.now() - (this.frozenAt ??= performance.now());
      this.deadline += shift;
      this.graceUntil += shift;
      this.frozenAt = performance.now();
    } else {
      this.frozenAt = undefined;
    }
    const now = performance.now();
    const left = Math.max(0, (this.deadline - now) / 1000);
    const grace = now < this.graceUntil;
    this.text.innerHTML = grace
      ? t("timer.grace", { time: clock((this.graceUntil - now) / 1000), every: this.every, take: this.take })
      : t("timer.next", { time: clock(left), take: this.take, n: this.take });
    const frac = grace ? 1 : Math.min(1, left / this.every);
    this.ring.style.strokeDashoffset = String(1 - frac);
    if (this.paused) this.text.innerHTML += t("timer.paused");
    this.el.classList.toggle("grace", grace);
    this.el.classList.toggle("urgent", !grace && left <= URGENT_S);
    this.el.setAttribute("aria-label", grace
      ? t("timer.graceLabel", { s: Math.ceil((this.graceUntil - now) / 1000) })
      : t("timer.nextLabel", { s: Math.ceil(left), n: this.take }));
  }
}

function clock(s) {
  const t = Math.ceil(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
