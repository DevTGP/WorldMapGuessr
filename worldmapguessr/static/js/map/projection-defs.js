// Formeln der Kartenprojektionen (pseudozylindrisch: x = λ · fx(φ), y = Y(φ)) und ihre d3-Fabriken – ohne
// Einstellungen und Texte, damit auch Worker sie nutzen können (map/labels-worker.js). Bezeichnungen und die
// gewählte Projektion: map/projections.js.

const M = Math.sqrt(3) / 2, A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796;

export const PROJECTION_DEFS = {
  natural: {
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
