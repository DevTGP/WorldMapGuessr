// Kartenprojektionen (Einstellung „Projektion“, settings/prefs.js). Beide sind pseudozylindrisch:
// x = λ · fx(φ), y = Y(φ) – genau diese Form nutzt der schnelle Kachel-Renderer (map/project.js).
//
//   natural  Natural Earth (Šavrič/Patterson/Jenny 2011): Kompromiss, vertraute Formen, Flächen zu den Polen
//            hin vergrößert (40° ×1,2 · 60° ×1,5 · 70° ×1,85 gegenüber dem Äquator)
//   equal    Equal Earth (Šavrič/Patterson/Jenny 2018): flächentreu – alle Länder im richtigen Größenverhältnis

import { prefs } from "../settings/prefs.js";
import { t } from "../i18n/index.js";
import { PROJECTION_DEFS } from "./projection-defs.js";

export const PROJECTIONS = {
  natural: {
    ...PROJECTION_DEFS.natural,
    label: "Natural Earth",
    blurb: t("projection.natural.blurb"),
  },
  equal: {
    ...PROJECTION_DEFS.equal,
    label: t("projection.equal"),
    blurb: t("projection.equal.blurb"),
  },
};

/** Id der eingestellten Projektion */
export function projectionId() { return prefs.get("projection") in PROJECTIONS ? prefs.get("projection") : "natural"; }
/** Eingestellte Projektion (Formeln und d3-Fabrik) */
export function projectionDef() { return PROJECTIONS[projectionId()]; }
/** Neue d3-Projektion der eingestellten Art */
export function makeProjection() { return projectionDef().d3(); }
