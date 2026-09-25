// Lebensanzeige: bis MAX_HEARTS als einzelne Herzen, darüber kompakt als Herz + Zahl.

const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="heart" d="M12 20.3s-7.4-4.5-9.2-9.1C1.5 7.9 3.4 4.6 6.8 4.6c2.1 0 3.7 1.2 5.2 3 1.5-1.8 3.1-3 5.2-3 3.4 0 5.3 3.3 4 6.6-1.8 4.6-9.2 9.1-9.2 9.1z"/></svg>';

const MAX_HEARTS = 10;

export class Lives {
  constructor(container, max = 10) {
    this.container = container;
    this.reset(max);
  }

  reset(max = this.max) {
    this.max = max;
    this.value = max;
    this.compact = max > MAX_HEARTS;
    const n = this.compact ? 1 : max;
    this.container.classList.toggle("compact", this.compact);
    this.container.replaceChildren(...Array.from({ length: n }, () => {
      const s = document.createElement("span");
      s.innerHTML = HEART;
      return s;
    }));
    if (this.compact) {
      this.countEl = document.createElement("b");
      this.countEl.className = "lives-count";
      this.container.append(this.countEl);
    }
    this._label();
  }

  /** Ein Leben abziehen; gibt die verbleibenden Leben zurück */
  lose() {
    if (this.value === 0) return 0;
    this.value -= 1;
    const heart = this.compact ? this.container.children[0] : this.container.children[this.value];
    if (!this.compact || this.value === 0) heart.classList.add("lost");
    heart.classList.add("breaking");
    heart.addEventListener("animationend", () => heart.classList.remove("breaking"), { once: true });
    this._label();
    return this.value;
  }

  _label() {
    if (this.compact) this.countEl.textContent = `${this.value} / ${this.max}`;
    this.container.setAttribute("aria-label", `Leben: ${this.value} von ${this.max}`);
  }
}
