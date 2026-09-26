// Kartensteuerung: Zoom-Buttons, Dreh-Pfeile (45°), Tastatur, Gradnetz, Koordinaten- und Zoomanzeige.

const KEY_STEP_PX = 80;

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

  document.getElementById("zoom-in").addEventListener("click", () => map.zoomBy(1.6));
  document.getElementById("zoom-out").addEventListener("click", () => map.zoomBy(1 / 1.6));
  document.getElementById("zoom-reset").addEventListener("click", () => map.resetZoom());
  document.getElementById("rotate-west").addEventListener("click", () => map.rotateStep(-1));
  document.getElementById("rotate-east").addEventListener("click", () => map.rotateStep(1));
  gridBtn.addEventListener("click", toggleGrid);

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector("dialog[open]")) return;
    if (e.target.closest?.("input, textarea, [contenteditable]")) return; // z. B. Chat-Eingabe
    switch (e.key) {
      case "+": case "=": map.zoomBy(1.6); break;
      case "-": case "_": map.zoomBy(1 / 1.6); break;
      case "0": map.resetZoom(); break;
      case "g": case "G": toggleGrid(); break;
      case "ArrowLeft": map.rotateStep(-1); break;
      case "ArrowRight": map.rotateStep(1); break;
      case "ArrowUp": map.panYBy(KEY_STEP_PX); break;
      case "ArrowDown": map.panYBy(-KEY_STEP_PX); break;
      default: return;
    }
    e.preventDefault();
  });
}
