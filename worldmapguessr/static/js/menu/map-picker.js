// Kartenauswahl im Spielmenü (rechte Spalte): Preset-Kacheln mit Mini-Weltkarte, bei Länder/Alles die
// Kontinente als Chips und der Schalter „mit Kleinstaaten“, darunter „Einzelne Items anpassen“ (ItemPicker).
// Regeln und Erkennung der Presets: menu/map-presets.js.

import { ItemPicker } from "./item-picker.js";
import { COUNTRY_GROUPS, MAP_PRESETS, SMALL_KM2, applyMap, describeMap, isSmall } from "./map-presets.js";

const PREVIEW_W = 148;
const PREVIEW_H = 74;
const PREVIEW_STEP_PX = 0.6; // Punkte näher als so viele Pixel am vorigen werden übersprungen
const fmt = new Intl.NumberFormat("de-DE");

export class MapPicker {
  /**
   * @param {HTMLElement} root  #map-picker
   * @param {object[]} features  alle Items der Karte
   * @param {{kind: string, features: object[]}[]} groups  Item-Gruppen (für die Einzelauswahl)
   * @param {() => void} onChange  Konfiguration wurde geändert
   */
  constructor(root, features, groups, onChange) {
    this.root = root;
    this.features = features;
    this.onChange = onChange;
    this.config = null;
    this.sel = { continents: new Set(COUNTRY_GROUPS.map((g) => g.id)), small: true };
    this.small = features.filter(isSmall);

    this.tiles = new Map();
    const wrap = root.querySelector(".map-presets");
    for (const p of MAP_PRESETS) {
      const count = this._count(p.id);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "map-tile";
      btn.setAttribute("role", "radio");
      btn.innerHTML = '<canvas class="map-preview" aria-hidden="true"></canvas><span class="map-title"></span>' +
        '<span class="map-blurb"></span><span class="map-count"></span>';
      btn.querySelector(".map-title").textContent = p.title;
      btn.querySelector(".map-blurb").textContent = p.blurb;
      btn.querySelector(".map-count").textContent = p.soon ? "kommt bald" : `${count} Items`;
      if (p.soon || !count) {
        btn.disabled = true;
        btn.dataset.lockedByLimit = "1"; // bleibt gesperrt, auch wenn das Menü entsperrt wird
      } else {
        btn.addEventListener("click", () => this._pick(p.id));
      }
      wrap.append(btn);
      this.tiles.set(p.id, btn);
    }

    // Kontinente der Länder-Auswahl
    this.chips = new Map();
    const chips = root.querySelector(".continent-chips");
    const all = this._chip("Alle", this.features.filter((f) => f.kind === "country").length, () => {
      this.sel.continents = new Set(COUNTRY_GROUPS.map((g) => g.id));
      this._pick("countries");
    });
    chips.append(all);
    this.chipAll = all;
    for (const g of COUNTRY_GROUPS) {
      const n = features.filter((f) => f.group === g.id).length;
      if (!n) continue;
      const chip = this._chip(g.short, n, () => {
        const set = this.sel.continents;
        // aus „Alle“ heraus: nur diesen Kontinent; sonst umschalten (mindestens einer bleibt)
        if (set.size === COUNTRY_GROUPS.length) set.clear();
        if (set.has(g.id) && set.size > 1) set.delete(g.id); else set.add(g.id);
        this._pick("countries");
      });
      chips.append(chip);
      this.chips.set(g.id, chip);
    }

    this.smallToggle = root.querySelector("#map-small");
    this.smallToggle.addEventListener("change", () => {
      this.sel.small = this.smallToggle.checked;
      const cur = this._current().preset;
      this._pick(cur === "all" ? "all" : "countries");
    });
    root.querySelector("#map-small-hint").textContent =
      `${this.small.length} Staaten unter ${fmt.format(SMALL_KM2)} km²`;
    root.querySelector("#map-small-field").title = this.small.map((f) => f.properties.name)
      .sort((a, b) => a.localeCompare(b, "de")).join(", ");

    // Einzelauswahl
    this.picker = new ItemPicker(root.querySelector("#picker-list"), groups, () => this._edited());
    root.querySelector("#picker-search").addEventListener("input", (e) => this.picker.filter(e.target.value));
    const toggle = root.querySelector("#picker-toggle");
    const panel = root.querySelector("#picker-panel");
    toggle.addEventListener("click", () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
    });
    this.customBadge = root.querySelector("#map-custom-badge");
    this.summary = root.querySelector("#map-summary");
  }

  /** Konfiguration anzeigen (Menü öffnet, Lobby-Zustand kommt an) */
  bind(config) {
    this.config = config;
    this.picker.bind(config);
    this.sync();
  }

  refresh() { this.picker.refresh(); this.sync(); }

  sync() {
    const d = this._current();
    if (d.preset === "countries" || d.preset === "all") {
      if (d.preset === "countries" && d.continents.length) this.sel.continents = new Set(d.continents);
      this.sel.small = d.small;
    }
    for (const [id, btn] of this.tiles) btn.setAttribute("aria-checked", String(id === d.preset));
    const countries = d.preset === "countries";
    const allCont = this.sel.continents.size === COUNTRY_GROUPS.length;
    this.chipAll.setAttribute("aria-checked", String(countries && allCont));
    for (const [id, chip] of this.chips) chip.setAttribute("aria-checked", String(countries && !allCont && this.sel.continents.has(id)));
    this.root.querySelector("#map-sub").classList.toggle("muted", !(countries || d.preset === "all"));
    this.root.querySelector(".continent-chips").classList.toggle("muted", !countries);
    this.smallToggle.checked = d.preset === "custom" ? this.sel.small : d.small;
    this.smallToggle.disabled = this.readOnly || !(countries || d.preset === "all");
    this.customBadge.hidden = d.preset !== "custom";
    const pool = this.features.filter((f) => this.config.kinds.has(f.group) && !this.config.excluded.has(f.key)).length;
    this.summary.textContent = `${d.label} · ${pool} Items`;
    this._drawPreviews(d);
  }

  /** Nur lesen (Lobby-Gäste): Kacheln, Chips und Schalter gesperrt */
  setReadOnly(readOnly) {
    this.readOnly = readOnly;
    this.root.querySelectorAll("button.map-tile, .continent-chips button").forEach((el) => {
      el.disabled = readOnly || el.dataset.lockedByLimit === "1";
    });
    if (this.config) this.sync();
  }

  _current() { return describeMap(this.config, this.features); }

  _pick(preset) {
    applyMap(this.config, this.features, { preset, ...this.sel });
    this.picker.refresh();
    this._edited();
  }

  _edited() {
    this.sync();
    this.onChange();
  }

  _chip(label, count, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.setAttribute("role", "checkbox");
    btn.innerHTML = '<span></span><small></small>';
    btn.querySelector("span").textContent = label;
    btn.querySelector("small").textContent = count;
    btn.addEventListener("click", onClick);
    return btn;
  }

  /** Item-Zahl eines Presets (mit der aktuellen Kontinent-/Kleinstaaten-Wahl) */
  _count(preset) {
    const c = applyMap({}, this.features, { preset, ...this.sel });
    return this.features.filter((f) => c.kinds.has(f.group) && !c.excluded.has(f.key)).length;
  }

  // ---------- Mini-Weltkarten ----------
  _drawPreviews(d) {
    const style = getComputedStyle(document.documentElement);
    const colors = {
      land: style.getPropertyValue("--preview-land").trim() || "#b9c2c9",
      on: style.getPropertyValue("--piece").trim(),
    };
    for (const [id, btn] of this.tiles) {
      const preset = MAP_PRESETS.find((p) => p.id === id);
      const cfg = id === d.preset ? this.config : applyMap({}, this.features, { preset: id, ...this.sel });
      const on = preset.soon ? () => false : (f) => cfg.kinds.has(f.group) && !cfg.excluded.has(f.key);
      drawPreview(btn.querySelector("canvas"), this.features, id === "continents" || id === "all", on, colors, id !== "continents");
      btn.querySelector(".map-count").textContent = preset.soon ? "kommt bald" : `${this._count(id)} Items`;
    }
  }
}

// Umrisse je Item für die Mini-Karten, einmal berechnet (Startstufe, ausgedünnt)
let shapes = null;
function previewShapes(features) {
  if (shapes) return shapes;
  const projection = d3.geoNaturalEarth1().fitExtent([[2, 2], [PREVIEW_W - 2, PREVIEW_H - 2]], { type: "Sphere" });
  shapes = new Map();
  for (const f of features) {
    const path = new Path2D();
    d3.geoPath(projection, thinning(path))({ type: "Feature", geometry: f.fitGeometry ?? f.geometry });
    shapes.set(f.key, path);
  }
  return shapes;
}

/** Canvas-Kontext für d3.geoPath, der zu dicht liegende Punkte weglässt */
function thinning(path) {
  let lx = 0, ly = 0;
  return {
    moveTo(x, y) { path.moveTo(x, y); lx = x; ly = y; },
    lineTo(x, y) {
      if (Math.abs(x - lx) + Math.abs(y - ly) < PREVIEW_STEP_PX) return;
      path.lineTo(x, y); lx = x; ly = y;
    },
    closePath() { path.closePath(); },
    arc() {},
  };
}

/**
 * Mini-Weltkarte: Kontinente als Grundfläche, ausgewählte Items hervorgehoben (Staaten über den Kontinenten).
 * @param {boolean} continents  Kontinente selbst gehören zur Auswahl (sonst nur Grundfläche)
 * @param {boolean} borders  Staatsgrenzen der ausgewählten Staaten andeuten
 */
function drawPreview(canvas, features, continents, on, colors, borders) {
  const dpr = Math.max(1, devicePixelRatio || 1);
  if (canvas.width !== PREVIEW_W * dpr) {
    canvas.width = PREVIEW_W * dpr;
    canvas.height = PREVIEW_H * dpr;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
  const all = previewShapes(features);
  const off = new Path2D();
  const sel = new Path2D();
  const lines = new Path2D();
  for (const f of features) {
    if (f.kind === "continent") (continents && on(f) ? sel : off).addPath(all.get(f.key));
    else if (on(f)) {
      sel.addPath(all.get(f.key));
      if (borders) lines.addPath(all.get(f.key));
    }
  }
  ctx.fillStyle = colors.land;
  ctx.fill(off);
  ctx.fillStyle = colors.on;
  ctx.fill(sel);
  if (borders) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 0.4;
    ctx.stroke(lines);
  }
}
