// Schwierigkeitsregler: Stufen und Erklärtexte fürs Menü. Die Reihenfolge der Items berechnet der Server
// (worldmapguessr/difficulty.py): je Item Wert = (1 − z) · Schwierigkeit/10 + z · Zufall mit
// z = min(Regler, 1 − Regler); bis 50 % kleinster Wert zuerst, darüber größter.

/** Kurzform der Reihenfolge zum Reglerwert (Regler „Reihenfolge“ unter „Erweitert“) */
export function orderLabel(level) {
  if (level <= 15) return "Leicht zuerst";
  if (level <= 45) return "Eher leicht zuerst";
  if (level <= 55) return "Gemischt";
  if (level <= 85) return "Eher schwer zuerst";
  return "Schwer zuerst";
}

/** Stufe zum Reglerwert (Farbe des Reglers) */
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
