// Einstellungs-Popup (Hauptmenü und im Spiel über ⚙): Spielername, Kartenqualität, Zoom- und
// Bewegungsempfindlichkeit. Alles gilt sofort und nur auf diesem Gerät.

import { DEFAULT_QUALITY, quality } from "../map/quality.js";
import { identity } from "../lobby/identity.js";
import { PREF_DEFAULTS, PREF_LIMITS, prefs } from "./prefs.js";
import { createQualityField } from "./quality-field.js";

const NAME_MAX = 24; // wie der Server (lobbies/settings.py clean_name)

export class SettingsDialog {
  constructor() {
    this.dialog = document.getElementById("settings");
    /** Name geändert (z. B. in der laufenden Lobby umbenennen) */
    this.onName = null;
    createQualityField(document.getElementById("set-quality"));

    this.name = document.getElementById("set-name");
    this.name.maxLength = NAME_MAX;
    this.name.addEventListener("change", () => this._saveName());

    this.ranges = Object.keys(PREF_DEFAULTS).map((key) => {
      const input = document.getElementById(`set-${key}`);
      const out = document.getElementById(`set-${key}-val`);
      Object.assign(input, { min: PREF_LIMITS.min * 100, max: PREF_LIMITS.max * 100, step: PREF_LIMITS.step * 100 });
      const show = () => { out.textContent = `${Math.round(prefs.get(key) * 100)} %`; };
      input.addEventListener("input", () => { prefs.set(key, input.value / 100); show(); });
      return { key, input, sync: () => { input.value = Math.round(prefs.get(key) * 100); show(); } };
    });

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
    for (const r of this.ranges) r.sync();
  }

  _saveName() {
    const name = this.name.value.split(/\s+/).filter(Boolean).join(" ").slice(0, NAME_MAX);
    if (!name || name === identity.name) return;
    identity.name = name;
    this.onName?.(name);
  }
}
