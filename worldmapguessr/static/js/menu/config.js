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
  { id: "state-al", preview: ["AL-11",  "AL-10",  "AL-12"] },
  { id: "state-at", preview: ["AT-7",  "AT-9",  "AT-6"] },
  { id: "state-ba", preview: ["BA-BIH",  "BA-SRP",  "BA-BRC"] },
  { id: "state-be", preview: ["BE-VLG",  "BE-WAL",  "BE-BRU"] },
  { id: "state-bg", preview: ["BG-22",  "BG-16",  "BG-03"] },
  { id: "state-by", preview: ["BY-HM",  "BY-BR",  "BY-VI"] },
  { id: "state-ch", preview: ["CH-ZH",  "CH-GR",  "CH-TI"] },
  { id: "state-cz", preview: ["CZ-PR",  "CZ-JM",  "CZ-JC"] },
  { id: "state-de", preview: ["DE-BY",  "DE-NW",  "DE-SN"] },
  { id: "state-dk", preview: ["DK-84",  "DK-81",  "DK-83"] },
  { id: "state-ee", preview: ["EE-37",  "EE-78",  "EE-74"] },
  { id: "state-es", preview: ["ES-AN",  "ES-CT",  "ES-MD"] },
  { id: "state-fi", preview: ["FI-18",  "FI-10",  "FI-11"] },
  { id: "state-fr", preview: ["FR-IDF",  "FR-BRE",  "FR-PAC"] },
  { id: "state-gb", preview: ["GB-ENG",  "GB-SCT",  "GB-WLS"] },
  { id: "state-gr", preview: ["GR-A1",  "GR-M",  "GR-B"] },
  { id: "state-hr", preview: ["HR-21",  "HR-18",  "HR-17"] },
  { id: "state-hu", preview: ["HU-BU",  "HU-PE",  "HU-BA"] },
  { id: "state-ie", preview: ["IE-D",  "IE-CO",  "IE-G"] },
  { id: "state-is", preview: ["IS-1",  "IS-4",  "IS-8"] },
  { id: "state-it", preview: ["IT-62",  "IT-82",  "IT-25"] },
  { id: "state-lt", preview: ["LT-VL",  "LT-KU",  "LT-KL"] },
  { id: "state-lu", preview: ["LU-L",  "LU-D",  "LU-G"] },
  { id: "state-lv", preview: ["LV-RIX",  "LV-KUR",  "LV-LAT"] },
  { id: "state-md", preview: ["MD-CU",  "MD-SN",  "MD-GA"] },
  { id: "state-me", preview: ["ME-16",  "ME-10",  "ME-12"] },
  { id: "state-mk", preview: ["MK-SKO",  "MK-PEL",  "MK-SWE"] },
  { id: "state-nl", preview: ["NL-NH",  "NL-ZH",  "NL-FR"] },
  { id: "state-no", preview: ["NO-03",  "NO-46",  "NO-56"] },
  { id: "state-pl", preview: ["PL-MZ",  "PL-MA",  "PL-PM"] },
  { id: "state-pt", preview: ["PT-11",  "PT-13",  "PT-08"] },
  { id: "state-ro", preview: ["RO-B",  "RO-CJ",  "RO-CT"] },
  { id: "state-rs", preview: ["RS-00",  "RS-06",  "RS-20"] },
  { id: "state-ru", preview: ["RU-MOW",  "RU-SPE",  "RU-SA"] },
  { id: "state-se", preview: ["SE-AB",  "SE-M",  "SE-BD"] },
  { id: "state-si", preview: ["SI-041",  "SI-042",  "SI-044"] },
  { id: "state-sk", preview: ["SK-BL",  "SK-KI",  "SK-ZI"] },
  { id: "state-ua", preview: ["UA-30",  "UA-46",  "UA-51"] },
  { id: "state-xk", preview: ["XK-PR",  "XK-PZ",  "XK-MI"] },
].map((g) => ({ ...g, title: t(`group.${g.id}`), short: g.id === "continent" ? undefined : t(`group.${g.id}.short`) }));
/** Gruppen, die „Standard“ (neues Menü) und der Server ohne Angabe spielen: Kontinente und Staaten */
export const isDefaultGroup = (id) => !id.startsWith("state-");
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
