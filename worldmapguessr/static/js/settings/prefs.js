// Darstellungs- und Bedien-Einstellungen je Gerät (im Browser gespeichert).
// Kartenqualität: map/quality.js · Spielername: lobby/identity.js · Sprache: i18n/index.js (Cookie)
// Oberfläche: settings/settings-dialog.js
//
//   zoomSpeed, moveSpeed  Empfindlichkeit (Faktor, 1 = Standard)
//   scheme                Farbschema der Karte (map/schemes.js): a Nachtatlas (Standard) · b Papierkarte · c Kontinentfarben
//   projection            natural (Natural Earth, Kompromiss) · equal (Equal Earth, flächentreu)
//   relief                Geländeschummerung: off · light · strong
//   water                 Flüsse und Seen zeichnen
//   cosmos                Sterne und Nebel außerhalb der Erde (ui/cosmos.js)

const KEY = "wmg.prefs";
/** Stand der gespeicherten Einstellungen. 2: Standard-Farbschema A statt B – ein gespeichertes „b“ aus
 *  älteren Ständen war meist nur der damalige Standard und wird deshalb einmal auf A gesetzt.
 *  3: Nachtatlas (A) für alle – jedes vorher gespeicherte Farbschema wird einmal auf A zurückgesetzt. */
const VERSION = 3;

/** Grenzen der Regler (Faktor, 1 = Standard) */
export const PREF_LIMITS = { min: 0.25, max: 2, step: 0.05 };

const DEFS = {
  zoomSpeed: { def: 1, range: true },
  moveSpeed: { def: 1, range: true },
  scheme: { def: "a", options: ["a", "b", "c"] },
  projection: { def: "natural", options: ["natural", "equal"] },
  relief: { def: "light", options: ["off", "light", "strong"] },
  water: { def: true, bool: true },
  cosmos: { def: true, bool: true },
};

const listeners = new Set();
let current = read();

function read() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { /* ohne Speicher */ }
  if ((raw.v ?? 1) < 3) delete raw.scheme;
  return Object.fromEntries(Object.keys(DEFS).map((k) => [k, clean(k, raw[k])]));
}

function clean(key, v) {
  const d = DEFS[key];
  if (d.range) {
    const n = Number(v ?? d.def);
    if (!Number.isFinite(n)) return d.def;
    return Math.min(PREF_LIMITS.max, Math.max(PREF_LIMITS.min, Math.round(n / PREF_LIMITS.step) * PREF_LIMITS.step));
  }
  if (d.bool) return typeof v === "boolean" ? v : d.def;
  return d.options.includes(v) ? v : d.def;
}

export const prefs = {
  get(key) { return current[key]; },
  set(key, value) {
    if (!(key in DEFS)) return;
    const v = clean(key, value);
    if (v === current[key]) return;
    current = { ...current, [key]: v };
    try { localStorage.setItem(KEY, JSON.stringify({ ...current, v: VERSION })); } catch { /* ohne Speicher: bis zum Neuladen */ }
    for (const fn of listeners) fn(key, v);
  },
  reset() { for (const [k, d] of Object.entries(DEFS)) this.set(k, d.def); },
  /** @param {(key: string, value: any) => void} fn */
  onChange(fn) { listeners.add(fn); },
};
