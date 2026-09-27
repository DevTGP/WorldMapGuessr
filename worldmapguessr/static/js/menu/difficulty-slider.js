// Regler „Reihenfolge“ 0…100 % (unter „Erweitert“): wie stark leichte bzw. schwere Items zuerst kommen,
// und ein Satz, was der Wert bedeutet. Die Schwierigkeit als Ganzes wählt man über Modus und Stufe.

import { difficultyBand, difficultyExplain, orderLabel } from "../game/difficulty.js";
import { t } from "../i18n/index.js";

/**
 * @param {{value: number, onChange: (v: number) => void}} opts
 * @returns {{el: HTMLElement, value: number}}
 */
export function createDifficultySlider({ value, onChange }) {
  const root = document.createElement("div");
  root.className = "field difficulty";
  root.innerHTML = `
    <div class="difficulty-head">
      <label for="cfg-difficulty">${t("rule.difficulty")}<small>${t("hint.difficulty")}</small></label>
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
    label.textContent = orderLabel(v);
    root.dataset.level = difficultyBand(v);
    explain.textContent = difficultyExplain(v);
    input.setAttribute("aria-valuetext", `${v} %, ${orderLabel(v)}`);
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
