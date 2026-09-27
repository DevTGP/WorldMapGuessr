// Bedien-Einstellungen je Gerät (im Browser gespeichert): Zoom- und Bewegungsempfindlichkeit.
// Kartenqualität: map/quality.js · Spielername: lobby/identity.js · Oberfläche: settings/settings-dialog.js

const KEY = "wmg.prefs";

/** Grenzen der Regler (Faktor, 1 = Standard) */
export const PREF_LIMITS = { min: 0.25, max: 2, step: 0.05 };
export const PREF_DEFAULTS = {
  zoomSpeed: 1,   // Mausrad, Pinch, Zoom-Knöpfe und +/−
  moveSpeed: 1,   // Ziehen (Drehen und Verschieben)
};

const listeners = new Set();
let current = read();

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY)) ?? {};
    return Object.fromEntries(Object.entries(PREF_DEFAULTS).map(([k, d]) => [k, clampPref(raw[k] ?? d)]));
  } catch {
    return { ...PREF_DEFAULTS };
  }
}

function clampPref(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(PREF_LIMITS.max, Math.max(PREF_LIMITS.min, Math.round(n / PREF_LIMITS.step) * PREF_LIMITS.step));
}

export const prefs = {
  get(key) { return current[key]; },
  set(key, value) {
    if (!(key in PREF_DEFAULTS)) return;
    const v = clampPref(value);
    if (v === current[key]) return;
    current = { ...current, [key]: v };
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ohne Speicher: bis zum Neuladen */ }
    for (const fn of listeners) fn(key, v);
  },
  reset() { for (const [k, d] of Object.entries(PREF_DEFAULTS)) this.set(k, d); },
  /** @param {(key: string, value: number) => void} fn */
  onChange(fn) { listeners.add(fn); },
};
