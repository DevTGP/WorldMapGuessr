// Lobby-Runde im Browser: bildet den Server-Zustand (gemeinsame Runde + eigenes Inventar) auf Karte,
// Inventar, Leben und Fortschritt ab. Der Server ist maßgeblich – jedes Teil liegt in der Lobby nur
// einmal vor; der Browser prüft nur, ob ein Teil passt, und meldet das Ergebnis.

import { fromWire } from "../menu/config.js";

/** Fehler, nach denen der eigene (optimistische) Stand verworfen wird */
const RESYNC_ERRORS = new Set(["not_in_hand", "round_over", "no_round", "bad_target", "send_disabled"]);

export class RemoteRound {
  /**
   * @param {import("./game.js").Game} game
   * @param {import("../lobby/client.js").LobbyClient} client
   */
  constructor(game, client) {
    this.game = game;
    this.client = client;
    this.number = 0;        // Nummer der dargestellten Lobby-Runde
    this.seq = 0;           // zuletzt angezeigtes Ereignis
    this.sent = new Set();  // von mir richtig eingesetzt, vom Server noch nicht bestätigt
    this.gifting = new Set(); // von mir gesendet, vom Server noch nicht bestätigt
    this.finished = false;
    this.queued = null;     // {lobby, hand}, während einer Animation zurückgestellt
    game.remote = this;
    game.lives.setTitle("Gemeinsame Leben der Lobby");

    client.addEventListener("error", ({ detail: err }) => {
      if (!RESYNC_ERRORS.has(err.code)) return;
      this.sent.clear();
      this.gifting.clear();
      if (client.state) this.apply(client.state, client.hand);
    });
  }

  /** Einsetzversuch melden */
  send(key, correct) {
    if (correct) this.sent.add(key);
    this.client.place(key, correct);
  }

  /** Teil an einen Mitspieler senden */
  give(key, to) {
    this.gifting.add(key);
    this.client.give(key, to);
  }

  /** Neuer Zustand vom Server; während Animationen zurückgestellt (Game ruft flush) */
  apply(lobby, hand) {
    this.queued = { lobby, hand: hand ?? [] };
    if (!this.game.busy) this.flush();
  }

  flush() {
    if (!this.queued) return;
    const { lobby, hand } = this.queued;
    this.queued = null;
    const round = lobby.round;
    if (!round) return;
    const g = this.game;

    const fresh = round.number !== this.number;
    if (fresh) {
      this.number = round.number;
      this.seq = round.last?.seq ?? 0;
      this.finished = false;
      this.sent.clear();
      this.gifting.clear();
      g.resetRound(fromWire(round.config), round.livesMax);
    }

    // Eingesetzte Teile aller Spieler
    const placed = new Set(round.placed);
    for (const key of placed) this.sent.delete(key);
    for (const key of round.placed) if (!g.map.isPlaced(key)) g.map.setPlaced(key, true, !fresh);
    for (const key of g.map.placedKeys) {
      if (!placed.has(key) && !this.sent.has(key)) g.map.setPlaced(key, false);
    }

    // Eigenes Inventar. Optimistisch eingesetzte/gesendete Teile, die der Server nicht bestätigt, kommen zurück.
    const inHand = new Set(hand);
    for (const key of this.gifting) if (!inHand.has(key)) this.gifting.delete(key);
    for (const id of [...g.inventory.pieces.keys()]) {
      const state = g.inventory.state(id);
      const stale = inHand.has(id)
        ? (state === "placed" && !this.sent.has(id)) || (state === "sent" && !this.gifting.has(id))
        : state !== "placed";
      if (stale) g.removePiece(id);
    }
    const added = hand.filter((key) => !g.inventory.pieces.has(key)).map((key) => g.pieceFor(key)).filter(Boolean);
    const ev = round.last;
    const gift = ev?.type === "gift" && ev.to === this.client.me?.id && ev.seq > this.seq ? ev.key : null;
    if (added.length) g.addPieces(added);

    g.lives.set(round.lives);
    g.setProgress(round.placed.length, round.total);
    g.setRefill(round.sinceRefill ?? 0, round.poolCount);

    this._announce(lobby, round, fresh ? 0 : added.filter((p) => p.id !== gift).length);

    if (round.status !== "running" && !this.finished) {
      this.finished = true;
      g._finish(round.status === "won");
    }
  }

  /** Ereignisse der anderen (und Nachschub) als kurze Meldung */
  _announce(lobby, round, refilled) {
    const ev = round.last;
    const isNew = ev && ev.seq > this.seq;
    if (ev) this.seq = Math.max(this.seq, ev.seq);
    const me = this.client.me?.id;
    const g = this.game;

    const more = refilled ? `${refilled} neue Items` : "";
    if (isNew && ev.type === "miss") {
      const who = ev.player === me ? "Daneben" : `${this._name(lobby, ev.player)} lag daneben`;
      return g.toast(round.lives > 0 ? `${who} – noch ${round.lives} Leben` : who, "bad");
    }
    if (isNew && ev.type === "gift" && ev.to === me) {
      const piece = g.pieceFor(ev.key)?.name ?? "ein Item";
      return g.toast([`${this._name(lobby, ev.player)} hat dir ${piece} geschickt`, more].filter(Boolean).join(" · "), "good");
    }
    if (isNew && ev.type === "placed") {
      const piece = g.pieceFor(ev.key)?.name ?? "Ein Item";
      const what = ev.player === me ? `${piece} sitzt` : `${this._name(lobby, ev.player)} hat ${piece} eingesetzt`;
      // eigener Treffer ohne Nachschub wurde schon beim Einsetzen gemeldet
      if (ev.player !== me || more) g.toast([what, more].filter(Boolean).join(" · "), "good");
      return;
    }
    if (more) g.toast(more, "good");
  }

  _name(lobby, id) {
    return lobby.players.find((p) => p.id === id)?.name ?? "Jemand";
  }
}
