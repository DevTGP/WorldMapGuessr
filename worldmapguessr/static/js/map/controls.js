// Kartensteuerung: Zoom-Buttons, Dreh-Pfeile (45°), Vollbild, Tastatur (+/−, 0, G, F; Bewegen: map/keyboard.js),
// Gradnetz, Koordinaten- und Zoomanzeige.

import { prefs } from "../settings/prefs.js";
import { KeyboardControl } from "./keyboard.js";

const ZOOM_STEP = 1.6;
/** Zoomschritt für Knöpfe und +/− (Zoom-Empfindlichkeit aus den Einstellungen) */
const zoomStep = () => Math.pow(ZOOM_STEP, prefs.get("zoomSpeed"));

export function bindMapControls(map) {
  const zoomEl = document.getElementById("zoom");
  const centerEl = document.getElementById("center");
  const coordEl = document.getElementById("coord");
  const gridBtn = document.getElementById("grid");

  const fmt = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
  const lonText = (lon, f = fmt) => `${f.format(Math.abs(lon))}° ${lon >= 0 ? "O" : "W"}`;
  const latText = (lat) => `${fmt.format(Math.abs(lat))}° ${lat >= 0 ? "N" : "S"}`;

  map.onView((v) => {
    zoomEl.textContent = Math.round(v.k * 100) + " %";
    const lon = map.centerLon;
    centerEl.textContent = Math.abs(lon) < 0.5 || Math.abs(Math.abs(lon) - 180) < 0.5
      ? (Math.abs(lon) < 0.5 ? "0°" : "180°")
      : lonText(lon, fmt0);
  });

  // Koordinatenanzeige
  const clearCoord = () => { coordEl.textContent = "— · —"; };
  map.canvas.addEventListener("pointermove", (e) => {
    const ll = map.invert(e.clientX, e.clientY);
    if (!ll) return clearCoord();
    coordEl.textContent = `${latText(ll[1])} · ${lonText(ll[0])}`;
  });
  map.canvas.addEventListener("pointerleave", clearCoord);

  const toggleGrid = () => {
    const on = gridBtn.getAttribute("aria-pressed") !== "true";
    gridBtn.setAttribute("aria-pressed", String(on));
    map.showGraticule(on);
  };

  document.getElementById("zoom-in").addEventListener("click", () => map.zoomBy(zoomStep()));
  document.getElementById("zoom-out").addEventListener("click", () => map.zoomBy(1 / zoomStep()));
  document.getElementById("zoom-reset").addEventListener("click", () => map.resetZoom());
  document.getElementById("rotate-west").addEventListener("click", () => map.rotateStep(-1));
  document.getElementById("rotate-east").addEventListener("click", () => map.rotateStep(1));
  gridBtn.addEventListener("click", toggleGrid);

  // Vollbild (F oder Knopf); Esc beendet es auch (Browser)
  const fsBtn = document.getElementById("fullscreen");
  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => { /* nicht erlaubt */ });
  };
  fsBtn.hidden = !document.documentElement.requestFullscreen;
  fsBtn.addEventListener("click", toggleFullscreen);
  document.addEventListener("fullscreenchange", () => fsBtn.setAttribute("aria-pressed", String(!!document.fullscreenElement)));

  // Bewegen (WASD, Pfeile) und Zoomen (Q/E), solange gedrückt – siehe map/keyboard.js
  new KeyboardControl(map);

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if ((e.key === "f" || e.key === "F") && !e.target.closest?.("input, textarea, [contenteditable]")) {
      e.preventDefault();
      return toggleFullscreen();
    }
    if (document.querySelector("dialog[open]")) return;
    if (e.target.closest?.("input, textarea, [contenteditable]")) return; // z. B. Chat-Eingabe
    switch (e.key) {
      case "+": case "=": map.zoomBy(zoomStep()); break;
      case "-": case "_": map.zoomBy(1 / zoomStep()); break;
      case "0": map.resetZoom(); break;
      case "g": case "G": toggleGrid(); break;
      default: return;
    }
    e.preventDefault();
  });
}
