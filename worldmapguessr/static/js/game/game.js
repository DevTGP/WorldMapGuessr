// Spielablauf im Browser: Inventar, Aufnehmen, Einsetzen, Zurücklegen, Senden, Rundenende.
//
// Jede Runde läuft auf dem Server – auch das Einzelspiel (Solo-Lobby, siehe lobbies/store.py). Der Server
// ist maßgeblich für Vorrat, Leben, Nachschub, Timer und Item-Statistik; game/remote.js bildet seinen
// Zustand hier ab (resetRound/addPieces/…). Der Browser prüft nur, ob ein Teil passt, und meldet das Ergebnis.

import { HeldPiece } from "./held-piece.js";
import { ICON_H, ICON_W, Inventory } from "./inventory.js";
import { iconScale } from "../map/icon.js";
import { Lives } from "./lives.js";
import { RefillMeter } from "./refill-meter.js";
import { TimerMeter } from "./timer-meter.js";
import { Feed } from "../ui/feed.js";
import { renderScore } from "./score-view.js";
import { KeyboardControl } from "../map/keyboard.js";
import { t } from "../i18n/index.js";

const DBLCLICK_REARM_MS = 400;
/** Rotation („Items gedreht“): Schrittweite in Grad; Mausrad-Weg (px) je Schritt */
export const ROTATE_STEP = 30;
const WHEEL_PX_PER_STEP = 60;
/** Tasten fürs Drehen (physische Position): R gegen, T im Uhrzeigersinn */
const ROTATE_KEYS = { KeyQ: -1, KeyE: 1 };
/**
 * Detail der Inventar-Icons, unabhängig von der Kartenqualität: Stufe so wählen, als wäre das Icon
 * ICON_DETAIL-mal so groß (je Bildschirm-Pixeldichte) – Punkte fallen erst unter ≈ 0,25 Geräte-px² weg.
 */
const ICON_DETAIL = 4;

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
    // Projektion gewechselt: Inventar-Icons in der neuen Projektion zeichnen
    map.onProjection(() => { for (const id of this.inventory.pieces.keys()) this.inventory.redrawIcon(id); });
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
      if (e.code in ROTATE_KEYS && this.held.active && KeyboardControl.active(e)) {
        e.preventDefault();
        this.rotateHeld(ROTATE_KEYS[e.code]);
      }
    });
    // Shift + Mausrad dreht das gehaltene Item (sonst zoomt das Mausrad, siehe map/gestures.js)
    this._wheelAcc = 0;
    map.onShiftWheel = (e) => {
      if (!this.held.active || !this.config?.rotate) return false;
      // Shift + Rad liefert je nach Browser deltaY oder (umgelenkt) deltaX
      const d = (Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * (e.deltaMode === 1 ? 33 : e.deltaMode ? 800 : 1);
      if (Math.sign(d) !== Math.sign(this._wheelAcc)) this._wheelAcc = 0;
      this._wheelAcc += d;
      if (Math.abs(this._wheelAcc) >= WHEEL_PX_PER_STEP) {
        this.rotateHeld(Math.sign(this._wheelAcc));
        this._wheelAcc = 0;
      }
      return true;
    };
  }

  /** Gehaltenes Item um steps × 30° drehen (nur mit „Items gedreht“) */
  rotateHeld(steps) {
    if (!this.held.active || this.busy || this.over || !this.config?.rotate) return;
    const p = this.held.piece;
    p.rotation = (((p.rotation ?? 0) + steps * ROTATE_STEP) % 360 + 360) % 360;
    this.held.rotate();
  }

  /**
   * Anfangsdrehung eines Items (30°-Schritte, nie 0°): fest je Runde, Spieler und Item – nach Neuladen gleich.
   * Ohne „Items gedreht“ 0.
   */
  _initialRotation(key) {
    if (!this.config?.rotate) return 0;
    const seed = `${this.remote?.number ?? 0}:${this.remote?.client?.me?.id ?? ""}:${key}`;
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
    return (1 + ((h >>> 0) % (360 / ROTATE_STEP - 1))) * ROTATE_STEP;
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
    for (const p of pieces) {
      p.rotation ??= this._initialRotation(p.id);
      this.pieces.set(p.id, p);
    }
    this.inventory.add(pieces);
    this._refineIcons(pieces);
  }

  /**
   * Inventar-Icons: die Detailstufe nachladen, die zur Icon-Größe passt (die Startstufe ist nur grob),
   * und das Icon danach neu zeichnen. Gilt bei jeder Kartenqualität.
   */
  _refineIcons(pieces) {
    const detail = ICON_DETAIL * Math.max(1, devicePixelRatio || 1);
    for (const p of pieces) {
      const f = p.feature;
      let z = this.map.items.levelFor(iconScale(f, ICON_W, ICON_H), detail);
      if (f.kind === "continent") z = Math.min(z, 3);
      if (z > f.level) this.map.items.ensure(f, z).then(() => this.inventory.redrawIcon(p.id));
    }
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
    this.progressWrap.setAttribute("aria-label", t("hud.progressLabel", { placed: this.correct, total: this.total }));
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
    this.toast(t(this.remote?.solo ? "game.noReturnSolo" : "game.noReturnLobby", { item: this.held.piece.name }), "hint");
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
    } else if (this.remote.missLoses) {
      // Fehlwurf kostet das Item: es verschwindet (Server legt es zurück in den Vorrat)
      this.inventory.setState(piece.id, "flying");
      this._endHolding();
      await this.held.vanish();
      this.inventory.remove(piece.id);
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
    this.inventory.redrawIcon(piece.id); // in der Hand gedreht → Icon in der neuen Lage
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

  /** @param {boolean} won  @param {"lives"|"empty"|null} [reason]  warum verloren */
  _finish(won, reason = "lives") {
    this.over = true;
    this.timerMeter.hide();
    this.cancelHeld();
    const vars = { placed: this.correct, total: this.total, lives: this.lives.value, max: this.lives.max };
    const empty = !won && reason === "empty";
    const solo = this.remote.solo;
    const outcome = won ? "won" : empty ? "empty" : "lives";
    const title = t(`end.${solo ? "solo" : "lobby"}.${outcome}.title`);
    let text = t(`end.${solo ? "solo" : "lobby"}.${outcome}`, vars);
    if (!solo) text += ` ${t(this.remote.client.isHost ? "end.nextHost" : "end.nextGuest")}`;
    const client = this.remote.client;
    renderScore(document.getElementById("dlg-score"), client.state?.round,
      { solo, me: client.me?.id, players: client.state?.players ?? [] });
    document.getElementById("dlg-title").textContent = title;
    document.getElementById("dlg-text").textContent = text;
    this.dialog.showModal();
  }
}
