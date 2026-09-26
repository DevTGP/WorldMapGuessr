// Schwierigkeitsregler 0…100 % im Menü: Stufe (Sehr einfach … Unmöglich) und ein Satz, was der Wert
// für die Reihenfolge der Items bedeutet.

import { difficultyExplain, difficultyLabel } from "../game/difficulty.js";

/**
 * @param {{value: number, onChange: (v: number) => void}} opts
 * @returns {{el: HTMLElement, value: number}}
 */
export function createDifficultySlider({ value, onChange }) {
  const root = document.createElement("div");
  root.className = "field difficulty";
  root.innerHTML = `
    <div class="difficulty-head">
      <label for="cfg-difficulty">Schwierigkeit<small>Reihenfolge, in der die Items kommen</small></label>
      <output for="cfg-difficulty" class="difficulty-value"><b></b><span></span></output>
    </div>
    <input id="cfg-difficulty" type="range" min="0" max="100" step="1">
    <p class="difficulty-explain"></p>`;
  const input = root.querySelector("input");
  const pct = root.querySelector(".difficulty-value b");
  const label = root.querySelector(".difficulty-value span");
  const explain = root.querySelector(".difficulty-explain");
  let current = value;

  const show = (v) => {
    current = v;
    input.value = v;
    input.style.setProperty("--pos", `${v}%`);
    pct.textContent = `${v} %`;
    label.textContent = difficultyLabel(v);
    root.dataset.level = difficultyLabel(v).toLowerCase().replace(/\s+/g, "-");
    explain.textContent = difficultyExplain(v);
    input.setAttribute("aria-valuetext", `${v} %, ${difficultyLabel(v)}`);
  };
  input.addEventListener("input", () => { show(Number(input.value)); onChange(current); });
  show(value);

  return {
    el: root,
    get value() { return current; },
    set value(v) { show(Math.max(0, Math.min(100, Math.round(Number(v)) || 0))); },
    setHint(text) { root.querySelector("label small").textContent = text; },
  };
}
