// Menü vor jeder Runde: Item-Arten + Einzelauswahl, Leben, Start-Items, Nachschub.
// Einzelspiel: Einstellungen gelten nur für die gestartete Runde; innerhalb der geöffneten Seite
// merkt sich das Menü die letzte Auswahl. In einer Lobby übernimmt lobby/lobby-menu.js
// Titel, Hauptaktion und Schreibschutz (nur der Host stellt ein).

import { iconPath } from "../map/icon.js";
import { createStepper } from "./stepper.js";
import { createDifficultySlider } from "./difficulty-slider.js";
import { difficultyLabel } from "../game/difficulty.js";
import { ItemPicker } from "./item-picker.js";
import { createToggle } from "./toggle.js";
import { GROUPS, LIMITS, cloneConfig, defaultConfig, poolFor, timerRule } from "./config.js";

/** Hinweise unter den Zeitdruck-Reglern (Einzelspiel; die Lobby ersetzt sie, siehe lobby/rules-text.js) */
export const TIMER_HINTS = {
  timer: "alle … Sekunden Items weg (0 = aus)",
  grace: "ab Rundenbeginn bis zum ersten Takt",
  timerTake: "Items je Takt zurück in den Vorrat",
  noReturn: "Ein aufgenommenes Item muss eingesetzt werden",
};

const KIND_ICON_W = 44;
const KIND_ICON_H = 30;

export class Menu {
  /**
   * @param {import("../map/map.js").WorldMap} map
   * @param {(config: object) => void} onStart   Einzelspiel starten
   * @param {{onCreateLobby?: (config: object) => void}} [opts]
   */
  constructor(map, onStart, { onCreateLobby } = {}) {
    this.map = map;
    this.onStart = onStart;
    this.dialog = document.getElementById("menu");
    this.canCancel = false;
    this.readOnly = false;
    /** Hauptknopf; im Lobby-Modus ersetzt */
    this.primaryAction = () => {
      this.dialog.close();
      this.onStart(cloneConfig(this.config));
    };
    /** Aufruf nach jeder Änderung durch den Nutzer (Lobby: an den Server senden) */
    this.onConfigEdited = null;
    /** Beschriftung/Zustand des Hauptknopfs; im Lobby-Modus ersetzt */
    this.primaryLabel = (pool) => (pool ? `Runde starten · ${pool} Items` : "Runde starten");
    /** HTML vor der Zusammenfassung (Lobby: Hinweis für Gäste) */
    this.summaryPrefix = () => "";
    /** Zusammenfassung der Regeln (HTML); im Lobby-Modus ersetzt */
    this.summaryRules = (c, start) =>
      `<b>${difficultyLabel(c.difficulty)}</b> (${c.difficulty} %) · <b>${c.lives}</b> Leben · ` +
      `Start mit <b>${start}</b>${start < c.startItems ? " (alle)" : ""} · ` +
      `je <b>${c.refillEvery}</b> Treffer → <b>${c.refillCount}</b> neue` +
      (c.timer ? ` · ${timerRule(c)}` : "") + (c.noReturn ? " · <b>kein Zurücklegen</b>" : "");
    /** Hinweis über den Rundeneinstellungen (null = keiner); im Lobby-Modus ersetzt */
    this.roundNote = () => (this.canCancel ? "Es läuft eine Runde. Änderungen gelten ab der nächsten Runde." : null);
    /** Läuft eine Runde? (Kennzeichnung „gilt ab der nächsten Runde“); im Lobby-Modus ersetzt */
    this.roundRunning = () => this.canCancel;

    // Item-Gruppen (Kontinente, Staaten Europas, Staaten Nordamerikas …); "kind" = Gruppen-ID
    this.groups = GROUPS
      .map((g) => ({ kind: g.id, title: g.title, preview: g.preview, features: map.features.filter((f) => f.group === g.id) }))
      .filter((g) => g.features.length);
    this.config = defaultConfig(this.groups.map((g) => g.kind));

    this._buildKinds();
    this._buildRules();
    this.picker = new ItemPicker(document.getElementById("picker-list"), this.groups, () => this._edited());
    document.getElementById("picker-search").addEventListener("input", (e) => this.picker.filter(e.target.value));

    document.getElementById("menu-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!document.getElementById("menu-start").disabled) this.primaryAction();
    });
    const create = document.getElementById("menu-create-lobby");
    if (onCreateLobby) create.addEventListener("click", () => onCreateLobby(cloneConfig(this.config)));
    else create.hidden = true;
    document.getElementById("menu-close").addEventListener("click", () => this.dialog.close());
    // Esc schließt nur, wenn eine Runde läuft, zu der man zurückkehren kann
    this.dialog.addEventListener("cancel", (e) => { if (!this.canCancel) e.preventDefault(); });
  }

  /** @param {{canCancel?: boolean}} opts  true = es läuft eine Runde, Schließen führt zurück */
  open({ canCancel = false } = {}) {
    this.setCloseable(canCancel);
    this.picker.bind(this.config);
    this._syncControls();
    this._update();
    if (!this.dialog.open) this.dialog.showModal();
    document.getElementById("menu-start").focus();
  }

  _pool() { return poolFor(this.config, this.map.features); }

  get isOpen() { return this.dialog.open; }

  /** Konfiguration von außen übernehmen (Lobby-Zustand vom Server) */
  applyConfig(config) {
    this.config = config;
    this.picker.bind(this.config);
    this._syncControls();
    this._update();
  }

  /** Nur lesen (Gäste einer Lobby): alle Regler und die Auswahl gesperrt */
  setReadOnly(readOnly) {
    this.readOnly = readOnly;
    this.dialog.querySelector(".menu-card").classList.toggle("readonly", readOnly);
    this.dialog.querySelectorAll(".menu-body .game-settings input, .menu-body .game-settings button").forEach((el) => {
      if (el.dataset.always) return; // z. B. Suche bleibt nutzbar
      el.disabled = readOnly || el.dataset.lockedByLimit === "1";
    });
    if (!readOnly) this._syncControls(); // Stepper-Grenzen (−/+) wieder korrekt setzen
  }

  setCloseable(canCancel) {
    this.canCancel = canCancel;
    document.getElementById("menu-close").hidden = !canCancel;
    this._update();
  }

  _edited() {
    this._update();
    this.onConfigEdited?.(this.config);
  }

  _buildKinds() {
    const wrap = document.getElementById("kind-cards");
    this.kindButtons = new Map();
    for (const { kind, title: label, preview: previewIds, features } of this.groups) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "kind-card";
      btn.setAttribute("role", "checkbox");
      const preview = (previewIds ?? [])
        .map((id) => features.find((f) => f.id === id))
        .filter(Boolean)
        .map((f) => `<svg viewBox="0 0 ${KIND_ICON_W} ${KIND_ICON_H}"><path d="${iconPath(f, KIND_ICON_W, KIND_ICON_H, 2)}"/></svg>`)
        .join("");
      btn.innerHTML = `
        <span class="kind-preview" aria-hidden="true">${preview}</span>
        <span class="kind-title">${label}</span>
        <span class="kind-count">${features.length} Items</span>
        <span class="kind-check" aria-hidden="true"></span>`;
      btn.addEventListener("click", () => {
        const on = !this.config.kinds.has(kind);
        if (on) this.config.kinds.add(kind); else this.config.kinds.delete(kind);
        this._syncControls();
        this.picker.refresh();
        this._edited();
      });
      wrap.append(btn);
      this.kindButtons.set(kind, btn);
    }
  }

  _buildRules() {
    const c = this.config;
    const make = (key, label, hint, extra = {}) => createStepper({
      id: `cfg-${key}`, label, hint, value: c[key], ...LIMITS[key], ...extra,
      onChange: (v) => { this.config[key] = v; this._edited(); },
    });
    this.steppers = {
      lives: make("lives", "Leben", "Fehlwürfe bis Rundenende"),
      startItems: make("startItems", "Start-Items", "im Inventar zu Beginn"),
      refillCount: make("refillCount", "Neue Items", "pro Nachschub"),
      refillEvery: make("refillEvery", "Nachschub alle", "… richtige Treffer"),
      difficulty: createDifficultySlider({
        value: c.difficulty,
        onChange: (v) => { this.config.difficulty = v; this._edited(); },
      }),
      timer: make("timer", "Timer", TIMER_HINTS.timer, { unit: "s" }),
      grace: make("grace", "Schonfrist", TIMER_HINTS.grace, { unit: "s" }),
      timerTake: make("timerTake", "Wegnahme", TIMER_HINTS.timerTake),
      noReturn: createToggle({
        id: "cfg-noReturn", label: "Kein Zurücklegen", hint: TIMER_HINTS.noReturn, value: c.noReturn,
        onChange: (v) => { this.config.noReturn = v; this._edited(); },
      }),
    };
    const fields = document.getElementById("rule-fields");
    const pair = (a, b) => {
      const el = document.createElement("div");
      el.className = "field-pair";
      el.append(a.el, b.el);
      return el;
    };
    const sub = document.createElement("p");
    sub.className = "fields-sub";
    sub.textContent = "Zeitdruck";
    const s = this.steppers;
    fields.append(s.difficulty.el, s.lives.el, s.startItems.el, pair(s.refillCount, s.refillEvery),
      sub, pair(s.timer, s.grace), s.timerTake.el, s.noReturn.el);
  }

  _syncControls() {
    for (const [kind, btn] of this.kindButtons) btn.setAttribute("aria-checked", String(this.config.kinds.has(kind)));
    for (const [key, s] of Object.entries(this.steppers)) s.value = this.config[key];
    // Schonfrist und Wegnahme wirken nur mit Timer
    for (const key of ["grace", "timerTake"]) this.steppers[key].el.classList.toggle("muted", !this.config.timer);
  }

  _update() {
    const c = this.config;
    for (const key of ["grace", "timerTake"]) this.steppers[key].el.classList.toggle("muted", !c.timer);
    const pool = this._pool().length;
    const total = this.groups.filter((g) => c.kinds.has(g.kind)).reduce((n, g) => n + g.features.length, 0);
    const start = Math.min(c.startItems, pool);
    const summary = document.getElementById("menu-summary");
    const button = document.getElementById("menu-start");
    const note = this.roundNote();
    const noteEl = document.getElementById("round-note");
    noteEl.hidden = !note;
    noteEl.textContent = note ?? "";
    document.getElementById("round-scope").hidden = !this.roundRunning();
    const label = this.primaryLabel(pool);
    button.textContent = typeof label === "string" ? label : label.text;
    button.disabled = pool === 0 || (typeof label === "object" && label.disabled);
    if (!pool) {
      summary.innerHTML = c.kinds.size ? "Keine Items ausgewählt." : "Mindestens eine Item-Art wählen.";
      summary.className = "warn";
      return;
    }
    summary.className = "";
    const excluded = total - pool;
    summary.innerHTML = this.summaryPrefix() +
      `<b>${pool}</b> Items${excluded ? ` (${excluded} ausgeschlossen)` : ""} · ` + this.summaryRules(c, start);
  }
}
