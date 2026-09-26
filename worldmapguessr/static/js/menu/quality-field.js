// Auswahl „Kartenqualität“ im Menü (Niedrig / Mittel / Hoch) – gilt sofort und nur auf diesem Gerät.

import { QUALITIES, quality } from "../map/quality.js";

export function createQualityField(root) {
  const bar = root.querySelector(".quality-bar");
  const buttons = Object.entries(QUALITIES).map(([id, q]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "level";
    btn.setAttribute("role", "radio");
    btn.textContent = q.label;
    btn.addEventListener("click", () => quality.set(id));
    bar.append(btn);
    return [id, btn];
  });
  const sync = () => {
    for (const [id, btn] of buttons) btn.setAttribute("aria-checked", String(id === quality.id));
  };
  quality.onChange(sync);
  sync();
}
