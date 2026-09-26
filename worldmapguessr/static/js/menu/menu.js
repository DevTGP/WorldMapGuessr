// Menü vor jeder Runde.
//
// Einfache Ansicht: Spielmodus, Schwierigkeit (Voreinstellungen aus menu/presets.js) und Item-Auswahl
// (Kontinente / Länder / Bundesländer). „Erweiterte Einstellungen“ zeigt alle Einzelwerte, die Item-Gruppen
// und die Einzelauswahl, „Aufbewahren“ und in der Lobby deren Einstellungen. Wer dort einen Regelwert ändert,
// hat „Eigene Einstellungen“ (mode = "custom"); ein Klick auf Modus oder Stufe setzt wieder die Voreinstellung.
// In einer Lobby übernimmt lobby/lobby-menu.js Titel, Hauptaktion und Schreibschutz (nur der Host stellt ein).

import { iconPath } from "../map/icon.js";
import { createStepper } from "./stepper.js";
import { createDifficultySlider } from "./difficulty-slider.js";
import { ItemPicker } from "./item-picker.js";
import { createToggle } from "./toggle.js";
import { createTtlField } from "./ttl-field.js";
import { ModePicker } from "./mode-picker.js";
import { createQualityField } from "./quality-field.js";
import { DEFAULT_LEVEL, DEFAULT_MODE, LEVELS, MODE, applyPreset, metrics, mmss, perMinute, valuesLine } from "./presets.js";
import { GROUPS, LIMITS, SCOPES, cloneConfig, defaultConfig, enforceBalance, poolFor } from "./config.js";

const ADVANCED_KEY = "wmg.menu.advanced";
const MAX_TEMPO = 6; // Treffer pro Minute – darüber warnt „Erweitert“

/** Hinweise unter den Reglern im Einzelspiel (die Lobby ersetzt sie, siehe lobby/rules-text.js) */
export const SOLO_HINTS = {
  lives: "Fehlwürfe bis Rundenende",
  startItems: "im Inventar zu Beginn",
  refillCount: "pro Nachschub (mehr als Treffer)",
  refillEvery: "… richtige Treffer",
  difficulty: "leichte oder schwere Items zuerst",
  timer: "alle … Sekunden Items weg (0 = aus)",
  grace: "ab Rundenbeginn bis zum ersten Takt",
  timerTake: "Items je Takt zurück in den Vorrat",
  noReturn: "Ein aufgenommenes Item muss eingesetzt werden",
  missLoses: "Das Item geht zurück in den Vorrat (außer im Endspurt)",
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
    /** Spieler, für die Start-Items und Leben gerechnet werden; im Lobby-Modus ersetzt */
    this.players = () => 1;
    /** Hinweis über den Rundeneinstellungen (null = keiner); im Lobby-Modus ersetzt */
    this.roundNote = () => (this.canCancel ? "Es läuft eine Runde. Änderungen gelten ab der nächsten Runde." : null);
    /** Läuft eine Runde? (Kennzeichnung „gilt ab der nächsten Runde“); im Lobby-Modus ersetzt */
    this.roundRunning = () => this.canCancel;
    /** „Lobby erstellen“; im Einzelspiel (Solo-Lobby) ersetzt durch „Mitspieler einladen“ */
    this.onCreateLobby = onCreateLobby ?? null;
    /** Aufbewahren geändert (Lobby: an den Server) */
    this.onTtlEdited = null;
    this.ttl = createTtlField(document.getElementById("keep-field"), (v) => this.onTtlEdited?.(v));

    // Item-Gruppen (Kontinente, Staaten Europas, Staaten Nordamerikas …); "kind" = Gruppen-ID
    this.groups = GROUPS
      .map((g) => ({ kind: g.id, title: g.title, preview: g.preview, features: map.features.filter((f) => f.group === g.id) }))
      .filter((g) => g.features.length);
    this.config = defaultConfig(this.groups.map((g) => g.kind));
    this.lastMode = DEFAULT_MODE; // für „Stufe wählen“ bei eigenen Einstellungen

    this.modePicker = new ModePicker({
      onMode: (id) => this._preset(id, this.config.mode === "custom" ? this.config.level ?? DEFAULT_LEVEL : this.config.level),
      onLevel: (level) => this._preset(this.config.mode === "custom" ? this.lastMode : this.config.mode, level),
      onScope: (id, on) => this._scope(id, on),
    }, new Map(this.groups.map((g) => [g.kind, g.features.length])));
    this._buildKinds();
    this._buildRules();
    this._bindAdvanced();
    createQualityField(document.getElementById("quality-field"));
    this.picker = new ItemPicker(document.getElementById("picker-list"), this.groups, () => this._edited());
    document.getElementById("picker-search").addEventListener("input", (e) => this.picker.filter(e.target.value));

    document.getElementById("menu-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!document.getElementById("menu-start").disabled) this.primaryAction();
    });
    const create = document.getElementById("menu-create-lobby");
    create.addEventListener("click", () => this.onCreateLobby?.(cloneConfig(this.config)));
    create.hidden = !onCreateLobby;
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

  /** Voreinstellung (Modus + Stufe) übernehmen */
  _preset(modeId, level) {
    applyPreset(this.config, modeId, level);
    this.lastMode = modeId;
    this._syncControls();
    this._edited();
  }

  /** Einfache Item-Auswahl: alle Gruppen eines Bereichs an/aus */
  _scope(id, on) {
    const scope = SCOPES.find((s) => s.id === id);
    for (const g of scope.groups) {
      if (!this.groups.some((x) => x.kind === g)) continue;
      if (on) this.config.kinds.add(g); else this.config.kinds.delete(g);
    }
    this._syncControls();
    this.picker.refresh();
    this._edited();
  }

  /** Regelwert unter „Erweitert“ geändert → eigene Einstellungen (Balancing-Regeln bleiben erhalten) */
  _custom(key, value) {
    this.config[key] = value;
    enforceBalance(this.config, key);
    if (this.config.mode !== "custom") this.lastMode = this.config.mode;
    this.config.mode = "custom";
    this._syncControls();
    this._edited();
  }

  /** Umschalter „Erweiterte Einstellungen“ (Zustand merkt sich der Browser) */
  _bindAdvanced() {
    const card = this.dialog.querySelector(".menu-card");
    const btn = document.getElementById("menu-advanced");
    const set = (on) => {
      card.classList.toggle("advanced", on);
      btn.setAttribute("aria-expanded", String(on));
      btn.querySelector("span").textContent = on ? "Weniger Einstellungen" : "Erweiterte Einstellungen";
    };
    let on = false;
    try { on = localStorage.getItem(ADVANCED_KEY) === "1"; } catch { /* ohne Speicher */ }
    set(on);
    btn.addEventListener("click", () => {
      on = !card.classList.contains("advanced");
      set(on);
      try { localStorage.setItem(ADVANCED_KEY, on ? "1" : "0"); } catch { /* egal */ }
    });
  }

  /** Hinweise unter den Reglern setzen (z. B. SOLO_HINTS oder Lobby-Hinweise) */
  setHints(hints) {
    for (const [key, text] of Object.entries(hints)) this.steppers[key]?.setHint(text);
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
    const make = (key, label, extra = {}) => createStepper({
      id: `cfg-${key}`, label, hint: SOLO_HINTS[key], value: c[key], ...LIMITS[key], ...extra,
      onChange: (v) => this._custom(key, v),
    });
    this.steppers = {
      lives: make("lives", "Leben"),
      startItems: make("startItems", "Start-Items"),
      refillCount: make("refillCount", "Neue Items"),
      refillEvery: make("refillEvery", "Nachschub alle"),
      difficulty: createDifficultySlider({
        value: c.difficulty,
        onChange: (v) => this._custom("difficulty", v),
      }),
      timer: make("timer", "Timer", { unit: "s" }),
      grace: make("grace", "Schonfrist", { unit: "s" }),
      timerTake: make("timerTake", "Wegnahme"),
      noReturn: createToggle({
        id: "cfg-noReturn", label: "Kein Zurücklegen", hint: SOLO_HINTS.noReturn, value: c.noReturn,
        onChange: (v) => this._custom("noReturn", v),
      }),
      missLoses: createToggle({
        id: "cfg-missLoses", label: "Fehlwurf kostet das Item", hint: SOLO_HINTS.missLoses, value: c.missLoses,
        onChange: (v) => this._custom("missLoses", v),
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
      sub, pair(s.timer, s.grace), s.timerTake.el, s.noReturn.el, s.missLoses.el);
  }

  _syncControls() {
    for (const [kind, btn] of this.kindButtons) btn.setAttribute("aria-checked", String(this.config.kinds.has(kind)));
    for (const [key, s] of Object.entries(this.steppers)) s.value = this.config[key];
    // Schonfrist und Wegnahme wirken nur mit Timer
    for (const key of ["grace", "timerTake"]) this.steppers[key].el.classList.toggle("muted", !this.config.timer);
    this.modePicker.sync(this.config, this.players());
  }

  /** Kennzahlen unter „Erweitert“: Mindesttempo, Puffer */
  _balanceNote() {
    const c = this.config;
    const n = this.players();
    const m = metrics(c, n);
    const el = document.getElementById("balance-note");
    const parts = [];
    let warn = false;
    if (c.timer) {
      warn = m.tempo > MAX_TEMPO;
      parts.push(`Mindesttempo <b>${perMinute(m.tempo)}</b> Treffer/min${n > 1 ? " (ganze Lobby)" : ""}` +
        `${warn ? " – kaum zu schaffen" : ""} · ohne Treffer leer nach <b>${mmss(m.emptyAfter)}</b>`);
    }
    if (!m.bufferOk) {
      warn = true;
      parts.push(`Puffer zu klein: Das Inventar kann leer werden, bevor die Leben ausgehen – empfohlen mindestens ` +
        `<b>${m.bufferNeeded}</b> Start-Items.`);
    } else if (!c.timer) {
      parts.push("Das Inventar kann nicht leer werden – es entscheiden die Leben.");
    }
    el.innerHTML = parts.join("<br>");
    el.classList.toggle("warn", warn);
  }

  _update() {
    const c = this.config;
    for (const key of ["grace", "timerTake"]) this.steppers[key].el.classList.toggle("muted", !c.timer);
    this.modePicker.sync(c, this.players());
    this._balanceNote();
    const pool = this._pool().length;
    const total = this.groups.filter((g) => c.kinds.has(g.kind)).reduce((n, g) => n + g.features.length, 0);
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
      `<b>${pool}</b> Items${excluded ? ` (${excluded} ausgeschlossen)` : ""} · ${modeText(c)} · ` +
      escapeHtml(valuesLine(c, this.players())) + flagText(c);
  }
}

/** „Tempo · Normal“ bzw. „Eigene Einstellungen“ */
function modeText(c) {
  return c.mode === "custom" || !MODE[c.mode] ? "<b>Eigene Einstellungen</b>" : `<b>${MODE[c.mode].title}</b> ${LEVELS[c.level]}`;
}

/** Regeln, die man der Kurzzeile nicht ansieht */
function flagText(c) {
  const f = [];
  if (c.noReturn) f.push("kein Zurücklegen");
  if (c.missLoses) f.push("Fehlwurf kostet das Item");
  return f.length ? ` · ${f.join(" · ")}` : "";
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
}
