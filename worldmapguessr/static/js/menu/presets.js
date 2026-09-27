// Spielmodi und Schwierigkeitsstufen: Voreinstellungen für einen Spieler.
//
// In einer Lobby rechnet der Server Start-Items und Leben hoch (+2 je weiterem Spieler, lobbies/round.py
// scaled); Nachschub und Wegnahme bleiben. Ändert man unter „Erweitert“ einen Wert, wird der Modus
// „Eigene“ (mode = "custom").
//
// Balancing-Regeln (alle Stufen erfüllen sie):
//   Nachschub positiv:  C > E (mehr neue Items als Treffer)
//   Puffer:             S ≥ E + X (nur mit Timer) + (L − 1) (nur wenn ein Fehlwurf das Item kostet)
//                       → ohne Timer kann das Inventar nie leer werden
//   Mindesttempo:       60 · X / (T · (C/E − 1)) Treffer pro Minute, damit der Timer das Inventar nicht leert
// (S Start-Items, C neue Items, E Treffer bis Nachschub, X Wegnahme, T Timer, L Leben)

import { fmt, t } from "../i18n/index.js";

export const LEVELS = [0, 1, 2, 3, 4].map((i) => t(`level.${i}`));
export const DEFAULT_MODE = "casual";
export const DEFAULT_LEVEL = 2;

/** Nachschub „+C je E“ als [C, E] */
const TIMER_ROWS = {
  grace: [120, 90, 60, 60, 50],
  timer: [60, 40, 30, 20, 30],
  timerTake: [1, 1, 1, 1, 2],
};

export const MODES = [
  {
    id: "casual", title: t("modes.casual.title"), blurb: t("modes.casual.blurb"),
    timer: false, noReturn: false, missLoses: false, sendEvery: 3,
    lives: [20, 12, 8, 6, 4], startItems: [8, 7, 6, 5, 5],
    refill: [[3, 2], [3, 2], [4, 3], [5, 4], [6, 5]], difficulty: [0, 20, 50, 65, 80],
  },
  {
    id: "easyfocus", title: t("modes.easyfocus.title"), blurb: t("modes.easyfocus.blurb"),
    timer: false, noReturn: false, missLoses: true, sendEvery: 4,
    lives: [12, 9, 7, 6, 5], startItems: [13, 10, 8, 8, 8],
    refill: [[4, 2], [4, 2], [3, 2], [4, 3], [5, 4]], difficulty: [10, 30, 50, 70, 90],
  },
  {
    id: "focus", title: t("modes.focus.title"), blurb: t("modes.focus.blurb"),
    timer: false, noReturn: true, missLoses: true, sendEvery: 5,
    lives: [8, 6, 5, 4, 3], startItems: [9, 8, 6, 6, 6],
    refill: [[4, 2], [5, 3], [3, 2], [4, 3], [5, 4]], difficulty: [20, 40, 60, 80, 100],
  },
  {
    id: "tempo", title: t("modes.tempo.title"), blurb: t("modes.tempo.blurb"),
    timer: true, noReturn: false, missLoses: false, sendEvery: 5,
    lives: [15, 10, 7, 5, 4], startItems: [8, 7, 6, 6, 6],
    refill: [[3, 2], [3, 2], [3, 2], [5, 3], [5, 3]], difficulty: [0, 20, 50, 65, 80], ...TIMER_ROWS,
  },
  {
    id: "hardcore", title: t("modes.hardcore.title"), blurb: t("modes.hardcore.blurb"),
    timer: true, noReturn: true, missLoses: true, sendEvery: 10,
    lives: [6, 4, 3, 2, 1], startItems: [8, 7, 6, 6, 6],
    refill: [[3, 2], [3, 2], [3, 2], [5, 3], [5, 3]], difficulty: [20, 40, 60, 80, 100], ...TIMER_ROWS,
  },
];
export const MODE = Object.fromEntries(MODES.map((m) => [m.id, m]));

/** Werte eines Modus in einer Stufe (für einen Spieler) */
export function presetValues(modeId, level) {
  const m = MODE[modeId];
  const [refillCount, refillEvery] = m.refill[level];
  return {
    lives: m.lives[level],
    startItems: m.startItems[level],
    refillCount,
    refillEvery,
    difficulty: m.difficulty[level],
    timer: m.timer ? m.timer[level] : 0,
    grace: m.timer ? m.grace[level] : 30,
    timerTake: m.timer ? m.timerTake[level] : 1,
    noReturn: m.noReturn,
    missLoses: m.missLoses,
  };
}

/** Voreinstellung in eine Konfiguration übernehmen (Item-Auswahl bleibt) */
export function applyPreset(config, modeId, level) {
  Object.assign(config, presetValues(modeId, level), { mode: modeId, level });
  return config;
}

/** Start-Items und Leben für n Spieler (wie der Server: + 2 je weiterem Spieler) */
export function scaled(config, players = 1) {
  const extra = 2 * Math.max(0, players - 1);
  return { startItems: config.startItems + extra, lives: Math.min(99, config.lives + extra) };
}

/** Kennzahlen zum Balancing einer Konfiguration (für n Spieler) */
export function metrics(config, players = 1) {
  const { startItems: S, lives: L } = scaled(config, players);
  const C = config.refillCount, E = config.refillEvery;
  const T = config.timer, X = config.timerTake;
  const gain = C / E - 1;
  const buffer = E + (T ? X : 0) + (config.missLoses ? L - 1 : 0);
  return {
    /** Treffer pro Minute (ganze Lobby), damit der Timer das Inventar nicht leert; null ohne Timer */
    tempo: T ? (60 * X) / (T * gain) : null,
    /** Sekunden ohne einen einzigen Treffer, bis das Inventar leer ist; null ohne Timer */
    emptyAfter: T ? config.grace + T * Math.ceil(S / X) : null,
    /** Start-Items, die der Puffer mindestens verlangt, und ob sie reichen */
    bufferNeeded: buffer,
    bufferOk: S >= buffer,
  };
}

/** "4:05" */
export function mmss(seconds) {
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Tempo schön: 2,7 bzw. 2.7 */
export function perMinute(v) {
  return fmt(Math.round(v * 10) / 10);
}

/**
 * Kurzzeile der Werte unter der Stufenwahl, z. B.
 * "7 Leben · Start 6 · +3 je 2 Treffer · alle 30 s −1 (nach 60 s) · Mindesttempo 4/min"
 */
export function valuesLine(config, players = 1) {
  const { startItems, lives } = scaled(config, players);
  const parts = [t("values.lives", { n: lives }), t("values.start", { n: startItems }),
    t("values.refill", { count: config.refillCount, n: config.refillEvery })];
  if (config.timer) {
    const m = metrics(config, players);
    parts.push(t("values.timer", { timer: config.timer, take: config.timerTake, grace: config.grace }));
    parts.push(t("values.tempo", { tempo: perMinute(m.tempo) }));
  }
  return parts.join(" · ");
}
