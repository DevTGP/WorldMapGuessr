// Spielkonfiguration einer Runde. Wird nicht gespeichert – gilt nur für die gestartete Runde
// (das Menü merkt sich die letzte Auswahl, solange die Seite offen ist).

export const LIMITS = {
  lives: { min: 1, max: 30 },
  startItems: { min: 1, max: 60 },
  refillCount: { min: 1, max: 20 },
  refillEvery: { min: 1, max: 20 },
  difficulty: { min: 0, max: 100 },
  timer: { min: 0, max: 600, step: 10 },  // s zwischen zwei Wegnahmen, 0 = aus
  grace: { min: 0, max: 600, step: 10 },  // s Schonfrist ab Rundenbeginn
  timerTake: { min: 1, max: 20 },         // Items je Takt
};

/** Item-Gruppen im Menü (je eine Karte zum An-/Abwählen); config.kinds enthält Gruppen-IDs */
export const GROUPS = [
  { id: "continent", title: "Kontinente", preview: ["AF", "SA", "OC"] },
  { id: "country-eu", title: "Staaten Europas", preview: ["ITA", "DEU", "NOR"] },
  { id: "country-na", title: "Staaten Nordamerikas", preview: ["USA", "MEX", "CUB"] },
  { id: "country-sa", title: "Staaten Südamerikas", preview: ["BRA", "ARG", "COL"] },
  { id: "country-af", title: "Staaten Afrikas", preview: ["EGY", "ZAF", "MDG"] },
  { id: "country-as", title: "Staaten Asiens", preview: ["CHN", "IND", "JPN"] },
  { id: "country-oc", title: "Staaten Ozeaniens", preview: ["AUS", "NZL", "PNG"] },
];
export const GROUP_LABELS = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

export function defaultConfig(kinds) {
  return {
    lives: 10,
    startItems: 5,
    refillCount: 4,   // neue Teile pro Nachschub
    refillEvery: 3,   // Nachschub nach so vielen Treffern
    difficulty: 50,   // Schwierigkeitsregler in % (Reihenfolge der Items, siehe game/difficulty.js)
    timer: 0,         // fester Takt ab Rundenbeginn: alle timer s gehen timerTake Items zurück (0 = aus) …
    grace: 30,        // … nach dieser Schonfrist
    timerTake: 1,
    noReturn: false,  // gehaltenes Item kann nicht zurück ins Inventar
    kinds: new Set(kinds),
    excluded: new Set(), // Feature-Keys, z. B. "country:VAT"
  };
}

export function cloneConfig(c) {
  return { ...c, kinds: new Set(c.kinds), excluded: new Set(c.excluded) };
}

export const clamp = (v, { min, max, step = 1 }) =>
  Math.max(min, Math.min(max, Math.round((Number(v) || 0) / step) * step || min));

/** "90 s" → "1:30 min", "40 s" → "40 s" */
export function seconds(s) {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m}:${String(r).padStart(2, "0")} min` : `${m} min`;
}

/** Timer-Regel als Text (HTML), leer wenn aus */
export function timerRule(c, { shared = false } = {}) {
  if (!c.timer) return "";
  const n = c.timerTake;
  return `Timer: ${c.grace ? `nach <b>${seconds(c.grace)}</b> ` : ""}alle <b>${seconds(c.timer)}</b> ` +
    `<b>−${n}</b> ${n === 1 ? "Item" : "Items"}${shared ? " reihum" : ""}`;
}

/** Alle Features, die mit dieser Konfiguration ins Spiel kommen */
export function poolFor(config, features) {
  return features.filter((f) => config.kinds.has(f.group) && !config.excluded.has(f.key));
}

/** Für Server/Netz: Sets → Arrays */
export function toWire(c) {
  return {
    lives: c.lives, startItems: c.startItems, refillCount: c.refillCount, refillEvery: c.refillEvery,
    difficulty: c.difficulty, timer: c.timer, grace: c.grace, timerTake: c.timerTake, noReturn: !!c.noReturn,
    kinds: [...c.kinds], excluded: [...c.excluded].sort(),
  };
}

/** Vom Server: Arrays → Sets */
export function fromWire(w) {
  return {
    timer: 0, grace: 30, timerTake: 1, noReturn: false, // ältere Lobbys ohne diese Felder
    ...w, kinds: new Set(w.kinds), excluded: new Set(w.excluded),
  };
}
