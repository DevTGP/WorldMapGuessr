// Reihenfolge der Items nach dem Schwierigkeitsregler (Einzelspiel; in Lobbys rechnet der Server
// dasselbe in worldmapguessr/difficulty.py).
//
// Je Item: Wert = (1 − z) · Schwierigkeit/10 + z · Zufall, mit Zufallsanteil z = min(Regler, 1 − Regler).
// Regler ≤ 50 %: kleinster Wert zuerst (0 % = streng leicht → schwer),
// Regler > 50 %: größter Wert zuerst (100 % = streng schwer → leicht).

export const UNKNOWN_DIFFICULTY = 5;

/**
 * @param {object[]} items
 * @param {number} level  Regler 0…100
 * @param {(item: object) => number|undefined} difficultyOf  0…10 (undefined = unbekannt → 5)
 * @param {() => number} [random]
 */
export function orderByDifficulty(items, level, difficultyOf, random = Math.random) {
  const lvl = Math.max(0, Math.min(100, level)) / 100;
  const z = Math.min(lvl, 1 - lvl);
  const dir = lvl > 0.5 ? -1 : 1;
  return items
    .map((item) => ({
      item,
      score: (1 - z) * (difficultyOf(item) ?? UNKNOWN_DIFFICULTY) / 10 + z * random(),
      tie: random(),
    }))
    .sort((a, b) => dir * (a.score - b.score || a.tie - b.tie))
    .map((s) => s.item);
}

/** Stufe zum Reglerwert */
export function difficultyLabel(level) {
  if (level <= 15) return "Sehr einfach";
  if (level <= 35) return "Einfach";
  if (level <= 60) return "Normal";
  if (level <= 80) return "Schwierig";
  if (level <= 95) return "Sehr schwierig";
  return "Unmöglich";
}

/** Was der Reglerwert für die Reihenfolge bedeutet (kurzer Satz fürs Menü) */
export function difficultyExplain(level) {
  const random = Math.min(level, 100 - level);
  if (level === 0) return "Streng von leicht nach schwer";
  if (level === 100) return "Streng von schwer nach leicht";
  return level <= 50
    ? `Leichte Items zuerst · ${random} % Zufall`
    : `Schwere Items zuerst · ${random} % Zufall`;
}
