// Timer im Einzelspiel: fester Takt ab Rundenbeginn. Nach der Schonfrist ruft er alle `timer` Sekunden
// onTake(n) auf (Items zurück in den Vorrat). Solange ein Dialog offen ist (Menü, Rundenende), steht er.
// In einer Lobby zählt der Server (lobbies/round.py) – dort wird nur angezeigt.

const CHECK_MS = 200;

export class RoundTimer {
  /**
   * @param {(count: number) => void} onTake
   * @param {() => void} [onShift]  Takt hat sich verschoben (Pause, Takt ausgeführt) → Anzeige neu setzen
   */
  constructor(onTake, onShift) {
    this.onTake = onTake;
    this.onShift = onShift;
    this.id = null;
  }

  /** @param {{timer: number, grace: number, timerTake: number}} config  Sekunden */
  start({ timer, grace, timerTake }) {
    this.stop();
    if (!timer) return;
    const now = performance.now();
    this.every = timer * 1000;
    this.take = timerTake;
    this.graceUntil = now + grace * 1000;
    this.next = this.graceUntil + this.every;
    this.last = now;
    this.id = setInterval(() => this._check(), CHECK_MS);
  }

  stop() {
    clearInterval(this.id);
    this.id = null;
  }

  get running() { return this.id !== null; }

  /** Für die Anzeige: Sekunden bis zum nächsten Takt und restliche Schonfrist */
  view() {
    if (!this.running) return null;
    const now = performance.now();
    return {
      nextIn: Math.max(0, (this.next - now) / 1000),
      graceLeft: Math.max(0, (this.graceUntil - now) / 1000),
      every: this.every / 1000,
      take: this.take,
    };
  }

  _check() {
    const now = performance.now();
    const dt = now - this.last;
    this.last = now;
    if (document.querySelector("dialog[open]") || document.hidden) {
      // Pause: Takt und Schonfrist verschieben sich mit
      this.next += dt;
      this.graceUntil += dt;
      this.onShift?.();
      return;
    }
    if (now < this.next) return;
    this.next += this.every;
    if (this.next <= now) this.next = now + this.every; // lange im Hintergrund: nicht nachholen
    this.onTake(this.take);
    this.onShift?.();
  }
}
