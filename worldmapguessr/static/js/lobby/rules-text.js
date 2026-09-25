// Texte, die erklären, was die Rundeneinstellungen in einer Lobby bewirken.

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
  };
}

/** Regel-Zusammenfassung im Fuß des Menüs (HTML) */
export function ruleSummary(config, start, players) {
  const split = players > 1 ? ` reihum (${splitText(start, players)})` : "";
  return `<b>${config.lives}</b> gemeinsame Leben · Start: <b>${start}</b>${split} · ` +
    `alle <b>${config.refillEvery}</b> Treffer der Lobby → <b>${config.refillCount}</b> neue`;
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
