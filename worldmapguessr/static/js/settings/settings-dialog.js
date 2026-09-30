// Einstellungs-Popup (Hauptmenü und im Spiel über ⚙). Alles gilt sofort und nur auf diesem Gerät.
//   Darstellung: Farbschema, Kartenqualität, Projektion, Relief, Flüsse und Seen
//   Steuerung:   Zoom- und Bewegungsempfindlichkeit, Tastenübersicht
//   Allgemein:   Name, Sprache (Cookie, Wechsel lädt die Seite neu)

import { DEFAULT_QUALITY, quality } from "../map/quality.js";
import { SCHEMES } from "../map/schemes.js";
import { PROJECTIONS } from "../map/projections.js";
import { identity } from "../lobby/identity.js";
import { PREF_LIMITS, prefs } from "./prefs.js";
import { createQualityField } from "./quality-field.js";
import { langSetting, setLang, t } from "../i18n/index.js";

const NAME_MAX = 24; // wie der Server (lobbies/settings.py clean_name)
const RANGES = ["zoomSpeed", "moveSpeed"];
const RELIEF = ["off", "light", "strong"].map((id) => [id, t(`relief.${id}`)]);
const LANGS = [["auto", t("settings.langAuto")], ["de", "Deutsch"], ["en", "English"]];

export class SettingsDialog {
  constructor() {
    this.dialog = document.getElementById("settings");
    /** Name geändert (z. B. in der laufenden Lobby umbenennen) */
    this.onName = null;
    this.syncs = [];
    createQualityField(document.getElementById("set-quality"));
    this._schemes(document.getElementById("set-scheme"));
    this._segmented(document.getElementById("set-projection"), "projection",
      Object.entries(PROJECTIONS).map(([id, p]) => [id, p.label]),
      (id) => { document.getElementById("set-projection-hint").textContent = PROJECTIONS[id].blurb; });
    this._segmented(document.getElementById("set-relief"), "relief", RELIEF);
    this._segmented(document.getElementById("set-lang"), null, LANGS);
    for (const key of ["water", "cosmos"]) {
      const box = document.getElementById(`set-${key}`);
      box.addEventListener("change", () => prefs.set(key, box.checked));
      this.syncs.push(() => { box.checked = prefs.get(key); });
    }

    this.name = document.getElementById("set-name");
    this.name.maxLength = NAME_MAX;
    this.name.addEventListener("change", () => this._saveName());

    for (const key of RANGES) {
      const input = document.getElementById(`set-${key}`);
      const out = document.getElementById(`set-${key}-val`);
      Object.assign(input, { min: PREF_LIMITS.min * 100, max: PREF_LIMITS.max * 100, step: PREF_LIMITS.step * 100 });
      const show = () => { out.textContent = `${Math.round(prefs.get(key) * 100)} %`; };
      input.addEventListener("input", () => { prefs.set(key, input.value / 100); show(); });
      this.syncs.push(() => { input.value = Math.round(prefs.get(key) * 100); show(); });
    }

    document.getElementById("settings-reset").addEventListener("click", () => {
      prefs.reset();
      quality.set(DEFAULT_QUALITY);
      this._sync();
    });
    this.dialog.addEventListener("close", () => this._saveName());
  }

  open() {
    this._sync();
    if (!this.dialog.open) this.dialog.showModal();
  }

  _sync() {
    this.name.value = identity.name;
    for (const fn of this.syncs) fn();
  }

  /** Knopfleiste für eine Auswahl-Einstellung (wie die Kartenqualität); key null = Sprache (Cookie) */
  _segmented(root, key, options, onPick = null) {
    const bar = root.querySelector(".quality-bar");
    const get = () => (key ? prefs.get(key) : langSetting());
    const set = (id) => (key ? prefs.set(key, id) : setLang(id));
    const buttons = options.map(([id, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "level";
      btn.setAttribute("role", "radio");
      btn.textContent = label;
      btn.addEventListener("click", () => { set(id); sync(); });
      bar.append(btn);
      return [id, btn];
    });
    const sync = () => {
      for (const [id, btn] of buttons) btn.setAttribute("aria-checked", String(id === get()));
      onPick?.(get());
    };
    this.syncs.push(sync);
  }

  /** Farbschemata als Karten mit Farbmustern (Meer, Stufen, Item) */
  _schemes(root) {
    const wrap = root.querySelector(".scheme-options");
    const cards = Object.entries(SCHEMES).map(([id, s]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scheme-card";
      btn.setAttribute("role", "radio");
      const stops = s.continents
        ? ["EU", "AF", "AS", "NA"].map((c) => s.continents[c][2])
        : s.stops.slice(1);
      const sw = (c) => `<i style="background:${c}"></i>`;
      btn.innerHTML = `<span class="scheme-swatch" aria-hidden="true" style="background:${s.map.sea}">` +
        `${sw(s.stops[0])}${stops.map(sw).join("")}<b style="background:${s.item.fill};border-color:${s.item.color}"></b></span>` +
        `<span class="scheme-title"></span><span class="scheme-blurb"></span>`;
      btn.querySelector(".scheme-title").textContent = s.label;
      btn.querySelector(".scheme-blurb").textContent = s.blurb;
      btn.addEventListener("click", () => { prefs.set("scheme", id); sync(); });
      wrap.append(btn);
      return [id, btn];
    });
    const sync = () => { for (const [id, btn] of cards) btn.setAttribute("aria-checked", String(id === prefs.get("scheme"))); };
    this.syncs.push(sync);
  }

  _saveName() {
    const name = this.name.value.split(/\s+/).filter(Boolean).join(" ").slice(0, NAME_MAX);
    if (!name || name === identity.name) return;
    identity.name = name;
    this.onName?.(name);
  }
}
