// Auswahl „Aufbewahren“: nach wie langer Untätigkeit eine Runde (Lobby, auch Einzelspiel) gelöscht wird.
// Stufen wie auf dem Server (lobbies/settings.py TTL_STEPS).

import { t } from "../i18n/index.js";

const DAY = 86400;
export const TTL_STEPS = [3600, 3 * 3600, 6 * 3600, 12 * 3600, DAY, 2 * DAY, 3 * DAY, 7 * DAY];
export const DEFAULT_TTL = 86400;

/** "1 Tag", "3 Stunden" … */
export function ttlLabel(seconds) {
  return seconds % DAY === 0 ? t("unit.days", { n: seconds / DAY }) : t("unit.hours", { n: Math.round(seconds / 3600) });
}

/**
 * @param {HTMLElement} root  Container mit <select>
 * @param {(seconds: number) => void} onChange
 */
export function createTtlField(root, onChange) {
  const select = root.querySelector("select");
  select.replaceChildren(...TTL_STEPS.map((s) => new Option(ttlLabel(s), String(s))));
  select.value = String(DEFAULT_TTL);
  select.addEventListener("change", () => onChange(Number(select.value)));
  return {
    get value() { return Number(select.value); },
    set value(v) { select.value = String(v); },
    set disabled(d) { select.disabled = d; },
  };
}
