// Einfache Menü-Ansicht: Spielmodus (Karten) und Schwierigkeit (5 Stufen). Die Werte der gewählten
// Voreinstellung stehen als Kurzzeile darunter. Die Kartenauswahl steht daneben (menu/map-picker.js).

import { LEVELS, MODES, valuesLine } from "./presets.js";
import { t } from "../i18n/index.js";

/** Kleine Symbole für die Regeln eines Modus */
const FLAG_ICONS = {
  timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M10 3h4"/></svg>',
  noReturn: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/><path d="M3 21L21 3"/></svg>',
  missLoses: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  rotate: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 11-2.34-5.66"/><path d="M20 4v5h-5"/></svg>',
};
const FLAG_TITLES = {
  timer: t("flag.timer"), noReturn: t("rule.noReturn"), missLoses: t("rule.missLoses"), rotate: t("rule.rotate"),
};

export class ModePicker {
  /**
   * @param {{onMode: (id: string) => void, onLevel: (level: number) => void}} handlers
   */
  constructor({ onMode, onLevel }) {
    this.cards = new Map();
    const wrap = document.getElementById("mode-cards");
    for (const m of MODES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mode-card";
      btn.setAttribute("role", "radio");
      btn.dataset.mode = m.id;
      // Rotation kann je Stufe verschieden sein: Symbol, sobald sie in einer Stufe an ist
      const flags = ["timer", "noReturn", "missLoses", "rotate"].filter((f) => (Array.isArray(m[f]) ? m[f].some(Boolean) : m[f]))
        .map((f) => `<i title="${FLAG_TITLES[f]}">${FLAG_ICONS[f]}</i>`).join("");
      btn.innerHTML = `<span class="mode-title"></span><span class="mode-flags" aria-hidden="true">${flags}</span>` +
        '<span class="mode-blurb"></span>';
      btn.querySelector(".mode-title").textContent = m.title;
      btn.querySelector(".mode-blurb").textContent = m.blurb;
      btn.addEventListener("click", () => onMode(m.id));
      wrap.append(btn);
      this.cards.set(m.id, btn);
    }

    this.levels = [];
    const bar = document.getElementById("level-bar");
    LEVELS.forEach((label, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "level";
      btn.setAttribute("role", "radio");
      btn.textContent = label;
      btn.addEventListener("click", () => onLevel(i));
      bar.append(btn);
      this.levels.push(btn);
    });

    this.values = document.getElementById("preset-values");
    this.customBadge = document.getElementById("custom-badge");
  }

  /** Anzeige an die Konfiguration anpassen */
  sync(config, players = 1) {
    const custom = config.mode === "custom";
    for (const [id, btn] of this.cards) btn.setAttribute("aria-checked", String(!custom && config.mode === id));
    this.levels.forEach((btn, i) => btn.setAttribute("aria-checked", String(!custom && config.level === i)));
    this.customBadge.hidden = !custom;
    const who = players > 1 ? ` ${t("values.forPlayers", { n: players })}` : "";
    this.values.textContent = valuesLine(config, players) + who;
  }
}
