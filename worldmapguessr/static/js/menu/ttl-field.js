// Auswahl „Aufbewahren“: nach wie langer Untätigkeit eine Runde (Lobby, auch Einzelspiel) gelöscht wird.
// Stufen wie auf dem Server (lobbies/settings.py TTL_STEPS).

export const TTL_STEPS = [
  [3600, "1 Stunde"], [3 * 3600, "3 Stunden"], [6 * 3600, "6 Stunden"], [12 * 3600, "12 Stunden"],
  [86400, "1 Tag"], [2 * 86400, "2 Tage"], [3 * 86400, "3 Tage"], [7 * 86400, "7 Tage"],
];
export const DEFAULT_TTL = 86400;

/** "1 Tag", "3 Stunden" … */
export function ttlLabel(seconds) {
  return (TTL_STEPS.find(([s]) => s === seconds) ?? [0, `${Math.round(seconds / 3600)} Stunden`])[1];
}

/**
 * @param {HTMLElement} root  Container mit <select>
 * @param {(seconds: number) => void} onChange
 */
export function createTtlField(root, onChange) {
  const select = root.querySelector("select");
  select.replaceChildren(...TTL_STEPS.map(([s, label]) => new Option(label, String(s))));
  select.value = String(DEFAULT_TTL);
  select.addEventListener("change", () => onChange(Number(select.value)));
  return {
    get value() { return Number(select.value); },
    set value(v) { select.value = String(v); },
    set disabled(d) { select.disabled = d; },
  };
}
