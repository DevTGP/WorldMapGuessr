// d3 für das Bündel: nur die Funktionen, die der Code nutzt (statt des ganzen d3 vom CDN, 92 → ≈ 25 kB gzip).
// Jede Quelldatei, die die globale Variable d3 nutzt, importiert im Bündel stattdessen dieses Objekt (build.mjs).
// Ohne Build lädt die Seite das ganze d3 vom CDN – neue d3-Funktionen hier ergänzen.
import { geoArea, geoBounds, geoCentroid, geoContains, geoDistance, geoEqualEarth, geoGraticule10, geoNaturalEarth1, geoPath } from "d3-geo";
import { easeCubicIn, easeCubicInOut, easeCubicOut } from "d3-ease";
import { rgb } from "d3-color";
import { select } from "d3-selection";
import "d3-transition"; // ergänzt selection.transition() / interrupt()

const d3 = {
  geoArea, geoBounds, geoCentroid, geoContains, geoDistance, geoEqualEarth, geoGraticule10, geoNaturalEarth1, geoPath,
  easeCubicIn, easeCubicInOut, easeCubicOut, rgb, select,
};
export { d3 };
