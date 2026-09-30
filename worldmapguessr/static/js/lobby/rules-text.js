// Texte, die erklären, was die Rundeneinstellungen in einer Lobby bewirken.

import { scaled } from "../menu/presets.js";
import { t } from "../i18n/index.js";

/**
 * Wie viele Items bekommt jeder, wenn `total` reihum an `players` Spieler geht?
 * 5 an 2 → "3 + 2", 2 an 3 → "1 + 1 + 0", ab 6 Spielern zusammengefasst → "je 1–2".
 */
export function splitText(total, players) {
  if (players <= 1) return String(total);
  const base = Math.floor(total / players);
  const extra = total % players;
  if (players > 5) return t("lobbyHint.each", { n: extra ? `${base}–${base + 1}` : base });
  return Array.from({ length: players }, (_, i) => base + (i < extra ? 1 : 0)).join(" + ");
}

/** Hinweise unter den Reglern im Lobby-Modus */
export function ruleHints(config, players) {
  const s = scaled(config, players);
  const many = players > 1;
  return {
    lives: many ? t("lobbyHint.livesNow", { n: s.lives }) : t("lobbyHint.lives"),
    startItems: many
      ? t("lobbyHint.startItemsNow", { n: s.startItems, split: splitText(s.startItems, players) })
      : t("lobbyHint.startItems"),
    refillCount: t("lobbyHint.refillCount"),
    refillEvery: t("lobbyHint.refillEvery"),
    difficulty: t("lobbyHint.difficulty"),
    timer: t("lobbyHint.timer"),
    grace: t("hint.grace"),
    timerTake: many ? t("lobbyHint.timerTakeMany") : t("lobbyHint.timerTake"),
    noReturn: t("lobbyHint.noReturn"),
    missLoses: t("hint.missLoses"),
    rotate: t("hint.rotate"),
  };
}

/** Regeltext zum Senden (Menü „So läuft eine Lobby-Runde“) */
export function sendRule(settings) {
  if (settings.allowSend === false) return t("mpRules.sendOff");
  const n = settings.sendEvery ?? 0;
  return t("mpRules.send") + (n ? ` ${t("mpRules.sendLimit", { n })}` : "");
}

/** Hinweis über den Rundeneinstellungen: was gilt wann, wer stellt ein */
export function roundNote(round, isHost) {
  const who = isHost ? "Host" : "Guest";
  if (round?.status === "running") return t(`roundNote.running${who}`, { n: round.number });
  if (round) return t(`roundNote.over${who}`, { n: round.number });
  return t(`roundNote.new${who}`);
}
