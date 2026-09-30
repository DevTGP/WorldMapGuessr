// Spielmenü („Neues Spiel“ aus dem Hauptmenü; im Spiel: Einstellungen des Einzelspiels bzw. der Lobby).
//
// Links: Spielmodus und Schwierigkeit (Voreinstellungen aus menu/presets.js); „Erweiterte Einstellungen“ zeigt
// alle Einzelwerte, „Aufbewahren“ und in der Lobby deren Einstellungen. Wer dort einen Regelwert ändert, hat
// „Eigene Einstellungen“ (mode = "custom"); ein Klick auf Modus oder Stufe setzt wieder die Voreinstellung.
// Rechts: Kartenauswahl (menu/map-picker.js). In einer Lobby übernimmt lobby/lobby-menu.js Titel, Hauptaktion
// und Schreibschutz (nur der Host stellt ein).

import { createStepper } from "./stepper.js";
import { createDifficultySlider } from "./difficulty-slider.js";
import { MapPicker } from "./map-picker.js";
import { createToggle } from "./toggle.js";
import { createTtlField } from "./ttl-field.js";
import { ModePicker } from "./mode-picker.js";
import { DEFAULT_LEVEL, DEFAULT_MODE, LEVELS, MODE, applyPreset, metrics, mmss, perMinute, valuesLine } from "./presets.js";
import { describeMap } from "./map-presets.js";
import { GROUPS, LIMITS, cloneConfig, defaultConfig, enforceBalance, poolFor } from "./config.js";
import { t } from "../i18n/index.js";

const ADVANCED_KEY = "wmg.menu.advanced";
const MAX_TEMPO = 6; // Treffer pro Minute – darüber warnt „Erweitert“

/** Hinweise unter den Reglern im Einzelspiel (die Lobby ersetzt sie, siehe lobby/rules-text.js) */
export const SOLO_HINTS = Object.fromEntries(
  ["lives", "startItems", "refillCount", "refillEvery", "difficulty", "timer", "grace", "timerTake", "noReturn", "missLoses", "rotate"]
    .map((k) => [k, t(`hint.${k}`)]),
);


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
    this.primaryLabel = (pool) => (pool ? t("menu.startSoloN", { n: pool }) : t("menu.startSolo"));
    /** HTML vor der Zusammenfassung (Lobby: Hinweis für Gäste) */
    this.summaryPrefix = () => "";
    /** Spieler, für die Start-Items und Leben gerechnet werden; im Lobby-Modus ersetzt */
    this.players = () => 1;
    /** Hinweis über den Rundeneinstellungen (null = keiner); im Lobby-Modus ersetzt */
    this.roundNote = () => (this.running ? t("round.runningNote") : null);
    /** Läuft eine Runde? (Kennzeichnung „gilt ab der nächsten Runde“); im Lobby-Modus ersetzt */
    this.roundRunning = () => this.running;
    /** Es läuft eine Runde, zu der ✕ zurückführt (nicht beim neuen Spiel aus dem Hauptmenü) */
    this.running = false;
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
    });
    this._buildRules();
    this._bindAdvanced();
    this.mapPicker = new MapPicker(document.getElementById("map-picker"), map.features, this.groups, () => this._edited());
    /** Schließen ohne Start (Zurück/✕/Esc) – z. B. zurück ins Hauptmenü */
    this.onDismiss = null;

    document.getElementById("menu-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!document.getElementById("menu-start").disabled) this.primaryAction();
    });
    const create = document.getElementById("menu-create-lobby");
    create.addEventListener("click", () => this.onCreateLobby?.(cloneConfig(this.config)));
    create.hidden = !onCreateLobby;
    const dismiss = () => {
      this.dialog.close();
      this.onDismiss?.();
    };
    document.getElementById("menu-close").addEventListener("click", dismiss);
    document.getElementById("menu-back").addEventListener("click", () => {
      if (!this.onBack) return dismiss();
      this.dialog.close();
      this.onBack();
    });
    // Esc schließt nur, wenn es etwas gibt, wohin man zurückkehren kann (Runde oder Hauptmenü)
    this.dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      if (this.canCancel) dismiss();
    });
  }

  /**
   * @param {{canCancel?: boolean, onDismiss?: () => void, back?: string, onBack?: () => void}} opts
   *   canCancel: Schließen möglich (Runde läuft bzw. aus dem Hauptmenü) · onDismiss: nach ✕/Esc aufrufen ·
   *   back: Beschriftung des Zurück-Knopfs unten links (ohne: keiner) · onBack: sein Ziel (sonst wie ✕)
   */
  open({ canCancel = false, onDismiss = null, back = null, onBack = null } = {}) {
    this.onDismiss = onDismiss;
    this.onBack = onBack;
    const backBtn = document.getElementById("menu-back");
    backBtn.hidden = !back;
    if (back) backBtn.textContent = back;
    this.setCloseable(canCancel);
    this.mapPicker.bind(this.config);
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
    this.mapPicker.bind(this.config);
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
    this.mapPicker.setReadOnly(readOnly);
    if (!readOnly) this._syncControls(); // Stepper-Grenzen (−/+) wieder korrekt setzen
  }

  /** Voreinstellung (Modus + Stufe) übernehmen */
  _preset(modeId, level) {
    applyPreset(this.config, modeId, level);
    this.lastMode = modeId;
    this._syncControls();
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
      btn.querySelector("span").textContent = t(on ? "menu.fewer" : "menu.advanced");
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
    this.running = canCancel && !this.onDismiss;
    document.getElementById("menu-close").hidden = !canCancel;
    this._update();
  }

  /** Kurzbeschreibung der Kartenauswahl („Länder · Europa“) */
  mapLabel(config = this.config) { return describeMap(config, this.map.features).label; }

  _edited() {
    this._update();
    this.onConfigEdited?.(this.config);
  }

  _buildRules() {
    const c = this.config;
    const make = (key, label, extra = {}) => createStepper({
      id: `cfg-${key}`, label, hint: SOLO_HINTS[key], value: c[key], ...LIMITS[key], ...extra,
      onChange: (v) => this._custom(key, v),
    });
    this.steppers = {
      lives: make("lives", t("rule.lives")),
      startItems: make("startItems", t("rule.startItems")),
      refillCount: make("refillCount", t("rule.refillCount")),
      refillEvery: make("refillEvery", t("rule.refillEvery")),
      difficulty: createDifficultySlider({
        value: c.difficulty,
        onChange: (v) => this._custom("difficulty", v),
      }),
      timer: make("timer", t("rule.timer"), { unit: "s" }),
      grace: make("grace", t("rule.grace"), { unit: "s" }),
      timerTake: make("timerTake", t("rule.timerTake")),
      noReturn: createToggle({
        id: "cfg-noReturn", label: t("rule.noReturn"), hint: SOLO_HINTS.noReturn, value: c.noReturn,
        onChange: (v) => this._custom("noReturn", v),
      }),
      missLoses: createToggle({
        id: "cfg-missLoses", label: t("rule.missLoses"), hint: SOLO_HINTS.missLoses, value: c.missLoses,
        onChange: (v) => this._custom("missLoses", v),
      }),
      rotate: createToggle({
        id: "cfg-rotate", label: t("rule.rotate"), hint: SOLO_HINTS.rotate, value: c.rotate,
        onChange: (v) => this._custom("rotate", v),
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
    sub.textContent = t("rule.timePressure");
    const s = this.steppers;
    fields.append(s.difficulty.el, s.lives.el, s.startItems.el, pair(s.refillCount, s.refillEvery),
      sub, pair(s.timer, s.grace), s.timerTake.el, s.noReturn.el, s.missLoses.el, s.rotate.el);
  }

  _syncControls() {
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
      parts.push(t(n > 1 ? "balance.tempoLobby" : "balance.tempo", { tempo: `<b>${perMinute(m.tempo)}</b>` }) +
        (warn ? t("balance.tooFast") : "") + " · " + t("balance.emptyAfter", { time: `<b>${mmss(m.emptyAfter)}</b>` }));
    }
    if (!m.bufferOk) {
      warn = true;
      parts.push(t("balance.buffer", { n: m.bufferNeeded }));
    } else if (!c.timer) {
      parts.push(t("balance.safe"));
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
      summary.innerHTML = t(c.kinds.size ? "menu.noItems" : "menu.noKinds");
      summary.className = "warn";
      return;
    }
    summary.className = "";
    summary.innerHTML = this.summaryPrefix() +
      `${t("menu.items", { n: pool })} · ${escapeHtml(this.mapLabel())} · ${modeText(c)} · ` +
      escapeHtml(valuesLine(c, this.players())) + flagText(c);
  }
}

/** „Tempo · Normal“ bzw. „Eigene Einstellungen“ */
function modeText(c) {
  return c.mode === "custom" || !MODE[c.mode] ? `<b>${t("mode.custom")}</b>` : `<b>${MODE[c.mode].title}</b> ${LEVELS[c.level]}`;
}

/** Regeln, die man der Kurzzeile nicht ansieht */
function flagText(c) {
  const f = [];
  if (c.noReturn) f.push(t("flag.noReturn"));
  if (c.missLoses) f.push(t("flag.missLoses"));
  if (c.rotate) f.push(t("flag.rotate"));
  return f.length ? ` · ${f.join(" · ")}` : "";
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
}
