// Kartenprojektionen (Einstellung „Projektion“, settings/prefs.js). Beide sind pseudozylindrisch:
// x = λ · fx(φ), y = Y(φ) – genau diese Form nutzt der schnelle Kachel-Renderer (map/project.js).
//
//   natural  Natural Earth (Šavrič/Patterson/Jenny 2011): Kompromiss, vertraute Formen, Flächen zu den Polen
//            hin vergrößert (40° ×1,2 · 60° ×1,5 · 70° ×1,85 gegenüber dem Äquator)
//   equal    Equal Earth (Šavrič/Patterson/Jenny 2018): flächentreu – alle Länder im richtigen Größenverhältnis

import { prefs } from "../settings/prefs.js";

const M = Math.sqrt(3) / 2, A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;

export const PROJECTIONS = {
  natural: {
    label: "Natural Earth",
    blurb: "vertraute Formen, Flächen zu den Polen hin größer",
    d3: () => d3.geoNaturalEarth1(),
    fx(phi) {
      const phi2 = phi * phi, phi4 = phi2 * phi2;
      return 0.8707 - 0.131979 * phi2 + phi4 * (-0.013791 + phi4 * (0.003971 * phi2 - 0.001529 * phi4));
    },
    y(phi) {
      const phi2 = phi * phi, phi4 = phi2 * phi2;
      return phi * (1.007226 + phi2 * (0.015085 + phi4 * (-0.044475 + 0.028874 * phi2 - 0.005916 * phi4)));
    },
  },
  equal: {
    label: "Flächentreu",
    blurb: "Equal Earth: alle Flächen im echten Verhältnis",
    d3: () => d3.geoEqualEarth(),
    // wie d3-geo equalEarthRaw
    fx(phi) {
      const l = Math.asin(M * Math.sin(phi)), l2 = l * l, l6 = l2 * l2 * l2;
      return Math.cos(l) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2)));
    },
    y(phi) {
      const l = Math.asin(M * Math.sin(phi)), l2 = l * l, l6 = l2 * l2 * l2;
      return l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2));
    },
  },
};

/** Id der eingestellten Projektion */
export function projectionId() { return prefs.get("projection") in PROJECTIONS ? prefs.get("projection") : "natural"; }
/** Eingestellte Projektion (Formeln und d3-Fabrik) */
export function projectionDef() { return PROJECTIONS[projectionId()]; }
/** Neue d3-Projektion der eingestellten Art */
export function makeProjection() { return projectionDef().d3(); }
