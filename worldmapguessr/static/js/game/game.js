// Spielablauf im Browser: Inventar, Aufnehmen, Einsetzen, Zurücklegen, Senden, Rundenende.
//
// Jede Runde läuft auf dem Server – auch das Einzelspiel (Solo-Lobby, siehe lobbies/store.py). Der Server
// ist maßgeblich für Vorrat, Leben, Nachschub, Timer und Item-Statistik; game/remote.js bildet seinen
// Zustand hier ab (resetRound/addPieces/…). Der Browser prüft nur, ob ein Teil passt, und meldet das Ergebnis.

import { HeldPiece } from "./held-piece.js";
import { Inventory } from "./inventory.js";
import { Lives } from "./lives.js";
import { RefillMeter } from "./refill-meter.js";
import { TimerMeter } from "./timer-meter.js";
import { Feed } from "../ui/feed.js";

const DBLCLICK_REARM_MS = 400;

export class Game {
  constructor(map) {
    this.map = map;
    this.busy = false;         // während Animationen keine Eingaben
    this.over = false;
    this.pointer = [innerWidth / 2, innerHeight / 2];

    this.held = new HeldPiece(map, document.getElementById("held-layer"));
    this.inventory = new Inventory(document.getElementById("slots"), (id) => this._onSlot(id));
    this.lives = new Lives(document.getElementById("lives"));
    this.refillMeter = new RefillMeter(document.getElementById("refill-meter"));
    this.timerMeter = new TimerMeter(document.getElementById("timer-meter"));
    this.feed = new Feed(document.getElementById("feed"));
    this.config = null;       // Konfiguration der laufenden Runde
    this.remote = null;       // RemoteRound (Server-Runde, Einzelspiel oder Lobby)
    /** Kurze Meldung in der Nachrichtenleiste (Text; kind: good | bad | info | hint) */
    this.toast = (text, kind = "info") => this.feed.push(text, kind || "info");
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
      if (e.target.closest?.("input, textarea")) return;
      if (e.key === "Escape" && this.held.active && !document.querySelector("dialog[open]")) this._putBack();
    });
  }

  /** Läuft gerade eine Runde (zum Zurückkehren aus dem Menü)? */
  get running() { return this.config !== null && !this.over; }

  /** Alles für eine neue Runde zurücksetzen */
  resetRound(config, lives = config.lives) {
    this.config = config;
    this.cancelHeld();
    this.busy = false;
    this.over = false;
    this.dialog.close();
    this.map.resetPlaced();
    this.inventory.clear();
    this.lives.reset(lives);
    this.pieces = new Map();
    this.correct = 0;
    this.total = 0;
    this.sinceRefill = 0;
    this.refillMeter.hide();
    this.timerMeter.hide();
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

  /** Items ins Inventar legen (die Statistik zählt der Server) */
  addPieces(pieces) {
    for (const p of pieces) this.pieces.set(p.id, p);
    this.inventory.add(pieces);
  }

  /** Teil ohne Animation aus dem Inventar nehmen (Server hat es zurück in den Vorrat gelegt) */
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

  _updateProgress() {
    this.progressEl.textContent = `${this.correct}/${this.total}`;
    this.progressFill.style.width = `${this.total ? (100 * this.correct) / this.total : 0}%`;
    this.progressWrap.setAttribute("aria-label", `Eingesetzt: ${this.correct} von ${this.total} Items`);
  }

  /** Nachschub-Zähler und Vorrat vom Server (Lobby: Treffer aller zählen) */
  setRefill(since, poolLeft) {
    this.sinceRefill = since;
    const c = this.config;
    this.refillMeter.update({ since, every: c.refillEvery, count: c.refillCount, poolLeft, shared: !this.remote?.solo });
  }

  /** Animation vorbei: Eingaben wieder frei, zurückgestellten Lobby-Zustand anwenden */
  _idle() {
    this.busy = false;
    this.remote?.flush();
  }

  /** Kein Zurücklegen: Hinweis statt Aktion. true = blockiert */
  _noReturn() {
    if (!this.config?.noReturn || !this.held.active) return false;
    this.toast(`Zurücklegen ist aus – ${this.held.piece.name} muss eingesetzt werden${this.remote?.solo ? "" : " (oder gesendet)"}`, "hint");
    return true;
  }

  _onSlot(id) {
    if (this.busy || this.over) return;
    const state = this.inventory.state(id);
    if (!state || state === "placed" || state === "sent") return;
    if (this._noReturn()) return;
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

  /** Einsetzversuch: Ergebnis an den Server; Leben, Nachschub und Rundenende kommen mit dem nächsten Zustand */
  async _tryPlace() {
    const piece = this.held.piece;
    const fits = this.held.fits();
    this.busy = true;
    this.remote.send(piece.id, fits);
    if (fits) {
      await this.held.snap();
      this.map.setPlaced(piece.id, true);
      this.inventory.setState(piece.id, "placed");
      this._endHolding();
    } else {
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
    this._idle();
  }

  /** Zurücklegen ohne Strafe (nicht bei „Kein Zurücklegen“) */
  async _putBack() {
    if (this.busy || this._noReturn()) return;
    this.busy = true;
    await this._flyBack(this.held.piece);
    this._idle();
  }

  async _flyBack(piece) {
    this.inventory.setState(piece.id, "flying");
    this.inventory.reveal(piece.id);
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
    this.timerMeter.hide();
    this.cancelHeld();
    const lives = `${this.lives.value} von ${this.lives.max}`;
    let title, text;
    if (this.remote.solo) {
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
