// Spielkonfiguration einer Runde. Wird nicht gespeichert – gilt nur für die gestartete Runde
// (das Menü merkt sich die letzte Auswahl, solange die Seite offen ist).

import { DEFAULT_LEVEL, DEFAULT_MODE, applyPreset } from "./presets.js";
import { t } from "../i18n/index.js";

export const LIMITS = {
  lives: { min: 1, max: 30 },
  startItems: { min: 1, max: 60 },
  refillCount: { min: 2, max: 21 },   // immer mehr als „Nachschub alle“ (Nachschub positiv)
  refillEvery: { min: 1, max: 20 },
  difficulty: { min: 0, max: 100 },
  timer: { min: 0, max: 600, step: 10 },  // s zwischen zwei Wegnahmen, 0 = aus
  grace: { min: 0, max: 600, step: 10 },  // s Schonfrist ab Rundenbeginn
  timerTake: { min: 1, max: 20 },         // Items je Takt
};

/** Item-Gruppen im Menü (je eine Karte zum An-/Abwählen); config.kinds enthält Gruppen-IDs */
export const GROUPS = [
  { id: "continent", preview: ["AF", "SA", "OC"] },
  { id: "country-eu", preview: ["ITA", "DEU", "NOR"] },
  { id: "country-na", preview: ["USA", "MEX", "CUB"] },
  { id: "country-sa", preview: ["BRA", "ARG", "COL"] },
  { id: "country-af", preview: ["EGY", "ZAF", "MDG"] },
  { id: "country-as", preview: ["CHN", "IND", "JPN"] },
  { id: "country-oc", preview: ["AUS", "NZL", "PNG"] },
].map((g) => ({ ...g, title: t(`group.${g.id}`), short: g.id === "continent" ? undefined : t(`group.${g.id}.short`) }));
export const GROUP_LABELS = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

/**
 * Standard: Casual, Normal (Werte siehe menu/presets.js). Felder:
 * mode/level (Voreinstellung; mode "custom" = unter „Erweitert“ geändert), lives, startItems (je für einen
 * Spieler), refillCount (neue Items) nach refillEvery Treffern, difficulty (Reihenfolge in %), timer/grace/
 * timerTake (fester Takt: alle timer s gehen timerTake Items zurück, 0 = aus, nach der Schonfrist),
 * noReturn (kein Zurücklegen), missLoses (Fehlwurf gibt das Item ab), rotate (Items gedreht, 30°-Schritte),
 * kinds, excluded (Feature-Keys).
 */
export function defaultConfig(kinds) {
  return applyPreset({ kinds: new Set(kinds), excluded: new Set() }, DEFAULT_MODE, DEFAULT_LEVEL);
}

export function cloneConfig(c) {
  return { ...c, kinds: new Set(c.kinds), excluded: new Set(c.excluded) };
}

export const clamp = (v, { min, max, step = 1 }) =>
  Math.max(min, Math.min(max, Math.round((Number(v) || 0) / step) * step || min));

/** Alle Features, die mit dieser Konfiguration ins Spiel kommen */
export function poolFor(config, features) {
  return features.filter((f) => config.kinds.has(f.group) && !config.excluded.has(f.key));
}

/** Für Server/Netz: Sets → Arrays */
export function toWire(c) {
  return {
    lives: c.lives, startItems: c.startItems, refillCount: c.refillCount, refillEvery: c.refillEvery,
    difficulty: c.difficulty, timer: c.timer, grace: c.grace, timerTake: c.timerTake, noReturn: !!c.noReturn,
    missLoses: !!c.missLoses, rotate: !!c.rotate, mode: c.mode, level: c.level,
    kinds: [...c.kinds], excluded: [...c.excluded].sort(),
  };
}

/** Vom Server: Arrays → Sets */
export function fromWire(w) {
  return {
    timer: 0, grace: 30, timerTake: 1, noReturn: false, missLoses: false, rotate: false, mode: "custom", level: 2, // ältere Lobbys
    ...w, kinds: new Set(w.kinds), excluded: new Set(w.excluded),
  };
}

/**
 * Balancing-Regeln nach einer Änderung einhalten: neue Items > Treffer (Nachschub positiv) und Start-Items ≥
 * Treffer (erster Nachschub erreichbar). Wer „Treffer“ erhöht, zieht die anderen mit; wer „Neue Items“
 * oder „Start-Items“ senkt, zieht „Treffer“ mit herunter.
 */
export function enforceBalance(c, changed) {
  if (changed === "refillEvery") {
    c.refillCount = Math.min(LIMITS.refillCount.max, Math.max(c.refillCount, c.refillEvery + 1));
    c.refillEvery = Math.min(c.refillEvery, c.refillCount - 1);
    c.startItems = Math.max(c.startItems, c.refillEvery);
  } else if (changed === "refillCount") {
    c.refillEvery = Math.min(c.refillEvery, c.refillCount - 1);
  } else if (changed === "startItems") {
    c.refillEvery = Math.min(c.refillEvery, c.startItems);
  }
  return c;
}
