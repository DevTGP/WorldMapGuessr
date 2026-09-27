// Schwierigkeitsregler: Stufen und Erklärtexte fürs Menü. Die Reihenfolge der Items berechnet der Server
// (worldmapguessr/difficulty.py): je Item Wert = (1 − z) · Schwierigkeit/10 + z · Zufall mit
// z = min(Regler, 1 − Regler); bis 50 % kleinster Wert zuerst, darüber größter.

import { t } from "../i18n/index.js";

/** Kurzform der Reihenfolge zum Reglerwert (Regler „Reihenfolge“ unter „Erweitert“) */
export function orderLabel(level) {
  if (level <= 15) return t("order.easyFirst");
  if (level <= 45) return t("order.ratherEasy");
  if (level <= 55) return t("order.mixed");
  if (level <= 85) return t("order.ratherHard");
  return t("order.hardFirst");
}

/** Band zum Reglerwert (Farbe des Reglers, CSS [data-level]) */
export function difficultyBand(level) {
  if (level <= 15) return "very-easy";
  if (level <= 35) return "easy";
  if (level <= 60) return "normal";
  if (level <= 80) return "hard";
  if (level <= 95) return "very-hard";
  return "extreme";
}

/** Was der Reglerwert für die Reihenfolge bedeutet (kurzer Satz fürs Menü) */
export function difficultyExplain(level) {
  const random = Math.min(level, 100 - level);
  if (level === 0) return t("order.strictEasy");
  if (level === 100) return t("order.strictHard");
  return t(level <= 50 ? "order.explainEasy" : "order.explainHard", { random });
}
