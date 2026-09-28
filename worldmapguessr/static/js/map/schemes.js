// Farbschemata der Karte (Einstellung „Farbschema“, settings/prefs.js). Jedes Schema legt fest:
//   map    Meer, Schelf-Saum, Küste, Grenzen eingesetzter Items, Seen/Flüsse, Hintergrund außerhalb der Erde
//   stops  Landfarbe je Einsetz-Stufe: [nichts, Kontinent, Staat, Bundesland] – die Stufen unterscheiden
//          sich immer in der Helligkeit (auch bei Farbschwäche lesbar). Bei C je Kontinent eigene Stufen.
//   item   Item in der Hand und im Inventar: Farbe, Füllung, Rand (Halo) – kommt in keiner Stufe vor
//   relief Überblendung der Geländeschummerung je Stufe (leicht/stark): [Modus, Deckkraft] je Durchgang.
//          Helles Land verträgt „hard-light“; auf dunklem Land wirkt „soft-light“ ruhiger (kein Grieseln).

import { prefs } from "../settings/prefs.js";
import { t } from "../i18n/index.js";

export const SCHEMES = {
  a: {
    label: t("scheme.a"),
    blurb: t("scheme.a.blurb"),
    map: { sea: "#1d3b52", shelf: "#28506b", coast: "#8fa3b0", border: "#1a1f24", water: "#2f5c7a", outside: null },
    stops: ["#2a3036", "#6f7d6a", "#bdb697", "#efe9d6"],
    item: { color: "#ff8a3d", fill: "rgba(255, 138, 61, 0.34)", halo: "rgba(255, 255, 255, 0.9)" },
    relief: { light: [["soft-light", 1]], strong: [["soft-light", 1], ["soft-light", 0.8]] },
  },
  b: {
    label: t("scheme.b"),
    blurb: t("scheme.b.blurb"),
    map: { sea: "#bcd9e8", shelf: "#d8eaf3", coast: "#7a8a93", border: "#f4f1ea", water: "#a9cde0", outside: null },
    stops: ["#dcd6ca", "#b5d0a4", "#6fa77a", "#2f6b4a"],
    item: { color: "#d9480f", fill: "rgba(217, 72, 15, 0.3)", halo: "rgba(255, 255, 255, 0.95)" },
    relief: { light: [["hard-light", 0.55]], strong: [["hard-light", 1]] },
  },
  c: {
    label: t("scheme.c"),
    blurb: t("scheme.c.blurb"),
    map: { sea: "#16324a", shelf: "#1f4461", coast: "#8fa3b0", border: "#1a1f24", water: "#2b5776", outside: null },
    stops: ["#2a3036", "#7b8794", "#b9c3cc", "#eef1f4"], // Fallback (Zellen ohne Kontinent)
    continents: {
      EU: ["#2a3036", "#5b6fb5", "#a9b6e6", "#e3e8fa"],
      AF: ["#2a3036", "#b8862f", "#e2c27a", "#f7ecd0"],
      AS: ["#2a3036", "#b5524a", "#e39a90", "#f8dfdb"],
      NA: ["#2a3036", "#4f9a5a", "#9fd1a3", "#e0f2e1"],
      SA: ["#2a3036", "#2f9a9a", "#86d0cc", "#daf3f1"],
      OC: ["#2a3036", "#a2549a", "#d99bd2", "#f5e0f2"],
      AN: ["#2a3036", "#8fa7b8", "#c9d8e3", "#eef4f8"],
    },
    item: { color: "#ffd23f", fill: "rgba(255, 210, 63, 0.42)", halo: "rgba(17, 20, 24, 0.95)" },
    relief: { light: [["soft-light", 1]], strong: [["soft-light", 1], ["soft-light", 0.8]] },
  },
};
export const DEFAULT_SCHEME = "a";

/** Aktuelles Schema */
export function scheme() { return SCHEMES[prefs.get("scheme")] ?? SCHEMES[DEFAULT_SCHEME]; }

/**
 * Landfarben-Stufen einer Zelle (Kontinent-Key „continent:EU“)
 * @returns {d3.RGBColor[]}
 */
export function stopsFor(s, continentKey) {
  const id = continentKey?.slice("continent:".length);
  return (s.continents?.[id] ?? s.stops).map((c) => d3.rgb(c));
}

/** Farbe bei Stufe k (0 … 3, auch Zwischenwerte während der Aufhell-Animation) */
export function stageColor(stops, k) {
  if (k <= 0) return stops[0].formatHex();
  const i = Math.min(stops.length - 2, Math.floor(k));
  const f = Math.min(1, k - i);
  const a = stops[i], b = stops[i + 1];
  return `rgb(${Math.round(a.r + (b.r - a.r) * f)},${Math.round(a.g + (b.g - a.g) * f)},${Math.round(a.b + (b.b - a.b) * f)})`;
}

/** Item-Farben als CSS-Variablen (gehaltenes Item, Inventar-Icons) */
export function applySchemeCss(s = scheme()) {
  const root = document.documentElement.style;
  root.setProperty("--item", s.item.color);
  root.setProperty("--item-fill", s.item.fill);
  root.setProperty("--item-halo", s.item.halo);
  document.documentElement.dataset.scheme = prefs.get("scheme");
}

applySchemeCss();
prefs.onChange((key) => { if (key === "scheme") applySchemeCss(); });
