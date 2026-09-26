// Anzeige am Inventar: Countdown bis zur nächsten Wegnahme durch den Timer (bzw. restliche Schonfrist).
// Bekommt Sekundenwerte (Einzelspiel: RoundTimer.view(), Lobby: round.timer vom Server) und zählt
// selbst herunter.

const FRAME_MS = 200;
const URGENT_S = 5;

export class TimerMeter {
  constructor(el) {
    this.el = el;
    this.text = el.querySelector(".timer-text");
    this.ring = el.querySelector(".timer-ring circle.v");
    this.id = null;
  }

  /** @param {{nextIn: number, graceLeft: number, every: number, take: number}|null} t */
  set(t) {
    if (!t) return this.hide();
    const now = performance.now();
    this.deadline = now + t.nextIn * 1000;
    this.graceUntil = now + t.graceLeft * 1000;
    this.every = t.every;
    this.take = t.take;
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
    const now = performance.now();
    const left = Math.max(0, (this.deadline - now) / 1000);
    const grace = now < this.graceUntil;
    const items = this.take === 1 ? "Item" : "Items";
    let text;
    if (grace) {
      text = `Schonfrist <b>${clock((this.graceUntil - now) / 1000)}</b><span class="long"> · dann alle ${this.every} s −${this.take}</span>`;
    } else {
      text = `<b>${clock(left)}</b> bis <b>−${this.take}</b><span class="long"> ${items}</span>`;
    }
    this.text.innerHTML = text;
    const frac = grace ? 1 : Math.min(1, left / this.every);
    this.ring.style.strokeDashoffset = String(1 - frac);
    this.el.classList.toggle("grace", grace);
    this.el.classList.toggle("urgent", !grace && left <= URGENT_S);
    this.el.setAttribute("aria-label", grace
      ? `Schonfrist noch ${Math.ceil((this.graceUntil - now) / 1000)} Sekunden`
      : `Noch ${Math.ceil(left)} Sekunden, dann ${this.take} ${items} zurück in den Vorrat`);
  }
}

function clock(s) {
  const t = Math.ceil(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}
