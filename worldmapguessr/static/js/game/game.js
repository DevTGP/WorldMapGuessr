// Spielablauf: Runde nach Konfiguration (Leben, Startteile, Nachschub, Auswahl der Teile),
// Einsetzen, Zurücklegen, Rundenende und Item-Tracking über den Server.
// Die Teile einer Runde werden zufällig gemischt.

import { sample, seededRandom } from "./random.js";
import { HeldPiece } from "./held-piece.js";
import { Inventory } from "./inventory.js";
import { Lives } from "./lives.js";
import { createToast } from "./toast.js";
import { ItemTracker } from "../api/items-api.js";
import { poolFor } from "../menu/config.js";

const DBLCLICK_REARM_MS = 400;

export class Game {
  constructor(map, { apiBase } = {}) {
    this.map = map;
    this.busy = false;         // während Animationen keine Eingaben
    this.over = false;
    this.pointer = [innerWidth / 2, innerHeight / 2];

    this.tracker = new ItemTracker(apiBase);
    this.ready = this.tracker.load();
    this.held = new HeldPiece(map, document.getElementById("held-layer"));
    this.inventory = new Inventory(document.getElementById("slots"), (id) => this._onSlot(id));
    this.lives = new Lives(document.getElementById("lives"));
    this.config = null;       // Konfiguration der laufenden Runde
    this.toast = createToast(document.getElementById("toast"));
    this.progressEl = document.getElementById("progress");
    this.dialog = document.getElementById("round-dialog");

    addEventListener("pointermove", (e) => {
      this.pointer = [e.clientX, e.clientY];
      if (this.held.active && !this.busy) this.held.move(this.pointer);
    });
    // Klick (ohne Ziehen) auf die Karte = einsetzen
    map.onClick((e) => {
      if (!this.held.active || this.busy) return;
      this.pointer = [e.clientX, e.clientY];
      this.held.move(this.pointer);
      this._tryPlace();
    });
    map.onContextMenu((e) => {
      if (!this.held.active) return;
      e.preventDefault();
      this._putBack();
    });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.held.active && !document.querySelector("dialog[open]")) this._putBack();
    });
  }

  /** Läuft gerade eine Runde (zum Zurückkehren aus dem Menü)? */
  get running() { return this.config !== null && !this.over; }

  /**
   * @param {object} config  siehe menu/config.js
   * @param {{seed?: number}} [opts]  Seed → gleiche Reihenfolge für alle Spieler einer Lobby-Runde
   */
  async newRound(config, { seed } = {}) {
    await this.ready; // UIDs vom Server, damit schon das erste "spawned" gezählt wird
    this.config = config;
    this.held.cancel();
    this._endHolding();
    this.busy = false;
    this.over = false;
    this.map.resetPlaced();
    this.inventory.clear();
    this.lives.reset(config.lives);

    const features = poolFor(config, this.map.features);
    const random = Number.isInteger(seed) ? seededRandom(seed) : Math.random;
    this.pool = sample(features, features.length, random).map((f) => ({
      id: f.key,               // eindeutig über alle Ebenen, z. B. "country:DEU"
      kind: f.kind,
      code: f.id,
      name: f.properties.name,
      feature: f,
      geom: f.geom,
    }));
    this.total = this.pool.length;
    this.pieces = new Map();
    this.correct = 0;
    this.sinceRefill = 0;
    this._deal(config.startItems);
  }

  /** n Teile aus dem Vorrat ins Inventar legen */
  _deal(n) {
    const wave = this.pool.splice(0, n);
    for (const p of wave) {
      this.pieces.set(p.id, p);
      this.tracker.record(p.kind, p.code, "spawned");
    }
    this.inventory.add(wave);
    this._updateProgress();
    return wave.length;
  }

  _updateProgress() {
    this.progressEl.textContent = `${this.correct} / ${this.total}`;
  }

  _onSlot(id) {
    if (this.busy || this.over) return;
    const state = this.inventory.state(id);
    if (!state || state === "placed") return;
    if (this.held.active) {
      const current = this.held.piece.id;
      if (current === id) return this._putBack();
      // Anderes Teil gewählt: das aktuelle ohne Animation zurücklegen
      this.held.cancel();
      this.inventory.setState(current, "ready");
    }
    this.inventory.setState(id, "held");
    this.held.pick(this.pieces.get(id), this.pointer);
    document.body.classList.add("is-holding");
    this.map.setDblClickZoom(false);
  }

  async _tryPlace() {
    const piece = this.held.piece;
    this.busy = true;
    if (this.held.fits()) {
      this.tracker.record(piece.kind, piece.code, "correct");
      await this.held.snap();
      this.map.setPlaced(piece.id, true);
      this.inventory.setState(piece.id, "placed");
      this._endHolding();
      this.busy = false;
      this.correct += 1;
      this.sinceRefill += 1;
      this._updateProgress();

      if (this.correct === this.total) return this._finish(true);
      if (this.sinceRefill >= this.config.refillEvery && this.pool.length) {
        this.sinceRefill = 0;
        const n = this._deal(this.config.refillCount);
        this.toast(`${piece.name} sitzt · ${n} neue Umrisse`, "good");
      } else {
        this.toast(`${piece.name} sitzt`, "good");
      }
      return;
    }

    this.tracker.record(piece.kind, piece.code, "incorrect");
    const left = this.lives.lose();
    this.toast(left > 0 ? `Daneben – noch ${left} Leben` : "Daneben", "bad");
    await this._flyBack(piece);
    this.busy = false;
    if (left === 0) this._finish(false);
  }

  /** Zurücklegen ohne Strafe */
  async _putBack() {
    if (this.busy) return;
    this.busy = true;
    await this._flyBack(this.held.piece);
    this.busy = false;
  }

  async _flyBack(piece) {
    this.inventory.setState(piece.id, "flying");
    this._endHolding();
    await this.held.returnTo(this.inventory.iconSvg(piece.id));
    this.inventory.setState(piece.id, "ready");
  }

  _endHolding() {
    document.body.classList.remove("is-holding");
    clearTimeout(this._rearm);
    this._rearm = setTimeout(() => this.map.setDblClickZoom(true), DBLCLICK_REARM_MS);
  }

  _finish(won) {
    this.over = true;
    document.getElementById("dlg-title").textContent = won ? "Runde geschafft" : "Keine Leben mehr";
    document.getElementById("dlg-text").textContent = won
      ? `Alle ${this.total} Umrisse sitzen – mit ${this.lives.value} von ${this.lives.max} Leben übrig.`
      : `${this.correct} von ${this.total} Umrissen richtig eingesetzt.`;
    this.dialog.showModal();
  }
}
