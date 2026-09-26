// Texte, die erklären, was die Rundeneinstellungen in einer Lobby bewirken.

import { difficultyLabel } from "../game/difficulty.js";
import { timerRule } from "../menu/config.js";

/**
 * Wie viele Items bekommt jeder, wenn `total` reihum an `players` Spieler geht?
 * 5 an 2 → "3 + 2", 2 an 3 → "1 + 1 + 0", ab 6 Spielern zusammengefasst → "je 1–2".
 */
export function splitText(total, players) {
  if (players <= 1) return String(total);
  const base = Math.floor(total / players);
  const extra = total % players;
  if (players > 5) return extra ? `je ${base}–${base + 1}` : `je ${base}`;
  return Array.from({ length: players }, (_, i) => base + (i < extra ? 1 : 0)).join(" + ");
}

/** Hinweise unter den Reglern im Lobby-Modus */
export function ruleHints(config, players) {
  return {
    lives: "gemeinsam – jeder Fehlwurf kostet allen eins",
    startItems: players > 1
      ? `für alle zusammen, reihum (jetzt ${splitText(config.startItems, players)})`
      : "für alle zusammen, reihum verteilt",
    refillCount: "insgesamt, reihum weiterverteilt",
    refillEvery: "… Treffer der ganzen Lobby",
    difficulty: "Reihenfolge, in der der Server austeilt",
    timer: "gemeinsamer Takt ab Rundenbeginn (0 = aus)",
    grace: "ab Rundenbeginn bis zum ersten Takt",
    timerTake: players > 1
      ? "insgesamt, reihum aus den Inventaren – je das älteste"
      : "Items je Takt zurück in den Vorrat – das älteste zuerst",
    noReturn: "Aufgenommenes muss eingesetzt (oder gesendet) werden",
  };
}

/** Regel-Zusammenfassung im Fuß des Menüs (HTML) */
export function ruleSummary(config, start, players) {
  const split = players > 1 ? ` reihum (${splitText(start, players)})` : "";
  return `<b>${difficultyLabel(config.difficulty ?? 50)}</b> (${config.difficulty ?? 50} %) · ` +
    `<b>${config.lives}</b> gemeinsame Leben · Start: <b>${start}</b>${split} · ` +
    `alle <b>${config.refillEvery}</b> Treffer der Lobby → <b>${config.refillCount}</b> neue` +
    (config.timer ? ` · ${timerRule(config, { shared: players > 1 })}` : "") +
    (config.noReturn ? " · <b>kein Zurücklegen</b>" : "");
}

/** Regeltext zum Senden (Menü „So läuft eine Lobby-Runde“) */
export function sendRule(settings) {
  if (settings.allowSend === false) return "<b>Items senden</b> ist in dieser Lobby ausgeschaltet.";
  const n = settings.sendEvery ?? 0;
  const limit = n ? ` Je <b>${n}</b> vom Server erhaltene Items darfst du <b>1</b> Item senden.` : "";
  return `<b>Items senden:</b> Item aufnehmen und links einen Mitspieler anklicken.${limit}`;
}

/** Hinweis über den Rundeneinstellungen: was gilt wann, wer stellt ein */
export function roundNote(round, isHost) {
  if (round?.status === "running") {
    return isHost
      ? `Runde ${round.number} läuft. Änderungen gelten erst, wenn du eine neue Runde startest.`
      : `Runde ${round.number} läuft. Der Host kann die Einstellungen für die nächste Runde ändern.`;
  }
  if (round) {
    return isHost
      ? `Runde ${round.number} ist vorbei. Stelle die nächste Runde ein und starte sie für alle.`
      : `Runde ${round.number} ist vorbei. Warte, bis der Host die nächste Runde startet.`;
  }
  return isHost
    ? "Stelle die Runde ein und starte sie für alle."
    : "Der Host stellt die Runde ein und startet sie für alle.";
}
