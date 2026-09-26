// Einfache Menü-Ansicht: Spielmodus (Karten), Schwierigkeit (5 Stufen) und Item-Auswahl
// (Kontinente / Länder / Bundesländer). Die Werte der gewählten Voreinstellung stehen als Kurzzeile darunter.

import { LEVELS, MODES, valuesLine } from "./presets.js";
import { SCOPES } from "./config.js";

/** Kleine Symbole für die Regeln eines Modus */
const FLAG_ICONS = {
  timer: '<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="7.5"/><path d="M12 9v4l2.5 2M10 3h4"/></svg>',
  noReturn: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/><path d="M3 21L21 3"/></svg>',
  missLoses: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
const FLAG_TITLES = { timer: "Timer nimmt Items weg", noReturn: "Kein Zurücklegen", missLoses: "Fehlwurf kostet das Item" };

export class ModePicker {
  /**
   * @param {{onMode: (id: string) => void, onLevel: (level: number) => void,
   *          onScope: (scopeId: string, on: boolean) => void}} handlers
   * @param {Map<string, number>} groupCounts  Items je Gruppen-ID
   */
  constructor({ onMode, onLevel, onScope }, groupCounts) {
    this.cards = new Map();
    const wrap = document.getElementById("mode-cards");
    for (const m of MODES) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mode-card";
      btn.setAttribute("role", "radio");
      btn.dataset.mode = m.id;
      const flags = ["timer", "noReturn", "missLoses"].filter((f) => m[f])
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

    this.scopes = new Map();
    const toggles = document.getElementById("scope-toggles");
    for (const sc of SCOPES) {
      const count = sc.groups.reduce((n, g) => n + (groupCounts.get(g) ?? 0), 0);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "scope-toggle";
      btn.setAttribute("role", "checkbox");
      btn.innerHTML = '<span class="scope-check" aria-hidden="true"></span><span class="scope-title"></span><small></small>';
      btn.querySelector(".scope-title").textContent = sc.title;
      btn.querySelector("small").textContent = sc.soon ? "bald" : `${count} Items`;
      if (sc.soon || !count) {
        btn.disabled = true;
        btn.dataset.lockedByLimit = "1"; // bleibt gesperrt, auch wenn das Menü entsperrt wird
        btn.dataset.soon = "1";
      } else {
        btn.addEventListener("click", () => onScope(sc.id, btn.getAttribute("aria-checked") !== "true"));
      }
      toggles.append(btn);
      this.scopes.set(sc.id, btn);
    }
    this.values = document.getElementById("preset-values");
    this.customBadge = document.getElementById("custom-badge");
  }

  /** Anzeige an die Konfiguration anpassen */
  sync(config, players = 1) {
    const custom = config.mode === "custom";
    for (const [id, btn] of this.cards) btn.setAttribute("aria-checked", String(!custom && config.mode === id));
    this.levels.forEach((btn, i) => btn.setAttribute("aria-checked", String(!custom && config.level === i)));
    this.customBadge.hidden = !custom;
    for (const sc of SCOPES) {
      const btn = this.scopes.get(sc.id);
      if (btn.dataset.soon) { btn.setAttribute("aria-checked", "false"); continue; }
      const on = sc.groups.filter((g) => config.kinds.has(g)).length;
      btn.setAttribute("aria-checked", on === 0 ? "false" : on === sc.groups.length ? "true" : "mixed");
    }
    const who = players > 1 ? ` (bei ${players} Spielern)` : "";
    this.values.textContent = valuesLine(config, players) + who;
  }
}
