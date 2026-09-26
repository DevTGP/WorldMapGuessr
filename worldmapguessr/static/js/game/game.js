// Spielablauf: Runde nach Konfiguration (Leben, Startteile, Nachschub, Auswahl der Teile),
// Einsetzen, Zurücklegen, Rundenende und Item-Statistik.
//
// Statistik: Im Einzelspiel meldet der Browser spawned (Item aus dem Vorrat ins Inventar) und
// correct/incorrect (Einsetzversuch). In einer Lobby zählt allein der Server – der Browser meldet nichts,
// sonst würden Neuladen, zweite Tabs oder gesendete Items doppelt zählen.
//
// Einzelspiel: Vorrat, Leben und Nachschub werden hier im Browser verwaltet (newRound).
// Lobby: der Server ist maßgeblich (game/remote.js ruft resetRound/addPieces/… auf);
// der Browser prüft nur, ob ein Teil passt, und meldet das Ergebnis. Gehaltene Teile können dort
// auch an Mitspieler gesendet werden (giveHeld).

import { seededRandom } from "./random.js";
import { orderByDifficulty } from "./difficulty.js";
import { HeldPiece } from "./held-piece.js";
import { Inventory } from "./inventory.js";
import { Lives } from "./lives.js";
import { RefillMeter } from "./refill-meter.js";
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
    this.refillMeter = new RefillMeter(document.getElementById("refill-meter"));
    this.config = null;       // Konfiguration der laufenden Runde
    this.remote = null;       // Lobby-Runde (RemoteRound) oder null im Einzelspiel
    this.toast = createToast(document.getElementById("toast"));
    this.progressEl = document.getElementById("progress");
    this.progressFill = document.getElementById("progress-fill");
    this.progressWrap = document.getElementById("progress-wrap");
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
   * @param {{seed?: number}} [opts]  Seed → reproduzierbare Reihenfolge (Tests)
   */
  async newRound(config, { seed } = {}) {
    await this.ready; // UIDs vom Server, damit schon das erste "spawned" gezählt wird
    this.ready = this.tracker.load(); // Schwierigkeit für die nächste Runde auffrischen
    this.resetRound(config);
    const features = poolFor(config, this.map.features);
    const random = Number.isInteger(seed) ? seededRandom(seed) : Math.random;
    // Reihenfolge nach dem Schwierigkeitsregler und der Item-Schwierigkeit aus der Statistik
    this.pool = orderByDifficulty(features, config.difficulty ?? 50, (f) => this.tracker.difficulty(f.kind, f.id), random)
      .map((f) => this._piece(f));
    this.total = this.pool.length;
    this.sinceRefill = 0;
    this._deal(config.startItems);
  }

  /** Alles für eine neue Runde zurücksetzen (Einzelspiel und Lobby) */
  resetRound(config, lives = config.lives) {
    this.config = config;
    this.cancelHeld();
    this.busy = false;
    this.over = false;
    this.dialog.close();
    this.map.resetPlaced();
    this.inventory.clear();
    this.lives.reset(lives);
    this.pool = [];
    this.pieces = new Map();
    this.correct = 0;
    this.total = 0;
    this.sinceRefill = 0;
    this.refillMeter.hide();
    this._updateProgress();
  }

  /** Spielteil zu einem Feature-Key ("country:DEU") oder null */
  pieceFor(key) {
    const f = this.map.byKey.get(key);
    return f ? this._piece(f) : null;
  }

  _piece(f) {
    return {
      id: f.key,               // eindeutig über alle Ebenen, z. B. "country:DEU"
      kind: f.kind,
      code: f.id,
      name: f.properties.name,
      feature: f,
      geom: f.geom,
    };
  }

  /** Items ins Inventar legen; im Einzelspiel als "spawned" zählen (Lobby: zählt der Server) */
  addPieces(pieces) {
    for (const p of pieces) {
      this.pieces.set(p.id, p);
      if (!this.remote) this.tracker.record(p.kind, p.code, "spawned");
    }
    this.inventory.add(pieces);
  }

  /** Teil ohne Animation aus dem Inventar nehmen (Lobby: Server hat es zurück in den Vorrat gelegt) */
  removePiece(id) {
    if (this.held.piece?.id === id) this.cancelHeld();
    this.inventory.remove(id);
  }

  /** Gehaltenes Teil sofort fallen lassen (zurück in seinen Slot) */
  cancelHeld() {
    const id = this.held.active ? this.held.piece.id : null;
    this.held.cancel();
    if (id && this.inventory.state(id) === "held") this.inventory.setState(id, "ready");
    this._endHolding();
  }

  setProgress(correct, total) {
    this.correct = correct;
    this.total = total;
    this._updateProgress();
  }

  /** n Teile aus dem Vorrat ins Inventar legen */
  _deal(n) {
    const wave = this.pool.splice(0, n);
    this.addPieces(wave);
    this._updateProgress();
    return wave.length;
  }

  _updateProgress() {
    this.progressEl.textContent = `${this.correct}/${this.total}`;
    this.progressFill.style.width = `${this.total ? (100 * this.correct) / this.total : 0}%`;
    this.progressWrap.setAttribute("aria-label", `Eingesetzt: ${this.correct} von ${this.total} Items`);
    if (!this.remote && this.total) this._updateRefill(this.sinceRefill, this.pool.length);
  }

  /** Lobby: gemeinsamer Nachschub-Zähler und Vorrat vom Server */
  setRefill(since, poolLeft) {
    this.sinceRefill = since;
    this._updateRefill(since, poolLeft);
  }

  _updateRefill(since, poolLeft) {
    const c = this.config;
    this.refillMeter.update({ since, every: c.refillEvery, count: c.refillCount, poolLeft, shared: !!this.remote });
  }

  /** Animation vorbei: Eingaben wieder frei, zurückgestellten Lobby-Zustand anwenden */
  _idle() {
    this.busy = false;
    this.remote?.flush();
  }

  _onSlot(id) {
    if (this.busy || this.over) return;
    const state = this.inventory.state(id);
    if (!state || state === "placed" || state === "sent") return;
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
    const fits = this.held.fits();
    this.busy = true;
    if (!this.remote) this.tracker.record(piece.kind, piece.code, fits ? "correct" : "incorrect");
    if (this.remote) return this._tryPlaceRemote(piece, fits);
    if (fits) {
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
        this.toast(`${piece.name} sitzt · ${n} neue Items`, "good");
      } else {
        this.toast(`${piece.name} sitzt`, "good");
      }
      return;
    }

    const left = this.lives.lose();
    this.toast(left > 0 ? `Daneben – noch ${left} Leben` : "Daneben", "bad");
    await this._flyBack(piece);
    this.busy = false;
    if (left === 0) this._finish(false);
  }

  /** Lobby: Ergebnis an den Server; Leben, Nachschub und Rundenende kommen mit dem nächsten Zustand */
  async _tryPlaceRemote(piece, fits) {
    this.remote.send(piece.id, fits);
    if (fits) {
      await this.held.snap();
      this.map.setPlaced(piece.id, true);
      this.inventory.setState(piece.id, "placed");
      this._endHolding();
      this.toast(`${piece.name} sitzt`, "good");
    } else {
      this.toast("Daneben", "bad");
      await this._flyBack(piece);
    }
    this._idle();
  }

  /**
   * Lobby: gehaltenes Teil an einen Mitspieler senden.
   * @param {string} to  Spieler-ID  @param {string} name  @param {Element} targetEl  Ziel der Flug-Animation
   */
  async giveHeld(to, name, targetEl) {
    if (!this.remote || !this.held.active || this.busy || this.over) return;
    const piece = this.held.piece;
    this.busy = true;
    this.remote.give(piece.id, to);
    this.inventory.setState(piece.id, "sent");
    this._endHolding();
    await this.held.sendTo(targetEl);
    this.toast(`${piece.name} an ${name} gesendet`, "good");
    this._idle();
  }

  /** Zurücklegen ohne Strafe */
  async _putBack() {
    if (this.busy) return;
    this.busy = true;
    await this._flyBack(this.held.piece);
    this._idle();
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
    this.cancelHeld();
    const lives = `${this.lives.value} von ${this.lives.max}`;
    let title, text;
    if (!this.remote) {
      title = won ? "Runde geschafft" : "Keine Leben mehr";
      text = won
        ? `Alle ${this.total} Items sitzen – mit ${lives} Leben übrig.`
        : `${this.correct} von ${this.total} Items richtig eingesetzt.`;
    } else {
      title = won ? "Gemeinsam geschafft" : "Keine Leben mehr";
      text = won
        ? `Die Lobby hat alle ${this.total} Items eingesetzt – mit ${lives} gemeinsamen Leben übrig.`
        : `Die Lobby hat ${this.correct} von ${this.total} Items eingesetzt.`;
      text += this.remote.client.isHost
        ? " Starte die nächste Runde, wenn alle bereit sind."
        : " Der Host startet die nächste Runde.";
    }
    document.getElementById("dlg-title").textContent = title;
    document.getElementById("dlg-text").textContent = text;
    this.dialog.showModal();
  }
}
