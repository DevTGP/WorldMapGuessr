// Spielkonfiguration einer Runde. Wird nicht gespeichert – gilt nur für die gestartete Runde
// (das Menü merkt sich die letzte Auswahl, solange die Seite offen ist).

export const LIMITS = {
  lives: { min: 1, max: 30 },
  startItems: { min: 1, max: 60 },
  refillCount: { min: 1, max: 20 },
  refillEvery: { min: 1, max: 20 },
};

/** Item-Gruppen im Menü (je eine Karte zum An-/Abwählen); config.kinds enthält Gruppen-IDs */
export const GROUPS = [
  { id: "continent", title: "Kontinente", preview: ["AF", "SA", "OC"] },
  { id: "country-eu", title: "Staaten Europas", preview: ["ITA", "DEU", "NOR"] },
  { id: "country-na", title: "Staaten Nordamerikas", preview: ["USA", "MEX", "CUB"] },
  { id: "country-sa", title: "Staaten Südamerikas", preview: ["BRA", "ARG", "COL"] },
  { id: "country-af", title: "Staaten Afrikas", preview: ["EGY", "ZAF", "MDG"] },
];
export const GROUP_LABELS = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

export function defaultConfig(kinds) {
  return {
    lives: 10,
    startItems: 5,
    refillCount: 4,   // neue Teile pro Nachschub
    refillEvery: 3,   // Nachschub nach so vielen Treffern
    kinds: new Set(kinds),
    excluded: new Set(), // Feature-Keys, z. B. "country:VAT"
  };
}

export function cloneConfig(c) {
  return { ...c, kinds: new Set(c.kinds), excluded: new Set(c.excluded) };
}

export const clamp = (v, { min, max }) => Math.max(min, Math.min(max, Math.round(v) || min));

/** Alle Features, die mit dieser Konfiguration ins Spiel kommen */
export function poolFor(config, features) {
  return features.filter((f) => config.kinds.has(f.group) && !config.excluded.has(f.key));
}

/** Für Server/Netz: Sets → Arrays */
export function toWire(c) {
  return {
    lives: c.lives, startItems: c.startItems, refillCount: c.refillCount, refillEvery: c.refillEvery,
    kinds: [...c.kinds], excluded: [...c.excluded].sort(),
  };
}

/** Vom Server: Arrays → Sets */
export function fromWire(w) {
  return { ...w, kinds: new Set(w.kinds), excluded: new Set(w.excluded) };
}
