// Lobby-Runde im Browser: bildet den Server-Zustand (gemeinsame Runde + eigenes Inventar) auf Karte,
// Inventar, Leben und Fortschritt ab. Der Server ist maßgeblich – jedes Teil liegt in der Lobby nur
// einmal vor; der Browser prüft nur, ob ein Teil passt, und meldet das Ergebnis.

import { fromWire } from "../menu/config.js";

/** Fehler, nach denen der eigene (optimistische) Stand verworfen wird */
const RESYNC_ERRORS = new Set(["not_in_hand", "round_over", "no_round", "bad_target", "send_disabled", "send_limit"]);
/** So viele ältere Chat-Nachrichten zeigt die Leiste beim Beitreten */
const CHAT_HISTORY = 10;

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
    this.chatSeq = null;    // zuletzt angezeigte Chat-Nachricht (null = noch keine Nachricht gesehen)
    game.remote = this;
    game.lives.setTitle("Gemeinsame Leben der Lobby");
    game.feed.enableChat((text) => client.chat(text));

    client.addEventListener("error", ({ detail: err }) => {
      if (err.code === "send_limit" || err.code === "send_disabled") game.toast(err.message, "hint");
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
    this._chat(lobby);
    const t = lobby.round?.status === "running" ? lobby.round.timer : null;
    this.timer = t ? { ...t, at: performance.now() } : null;
    this._showTimer();
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
      this.seq = round.events ?? round.last?.seq ?? 0; // ältere Ereignisse nicht nachspielen
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
    if (added.length) g.addPieces(added);

    g.lives.set(round.lives);
    g.setProgress(round.placed.length, round.total);
    g.setRefill(round.sinceRefill ?? 0, round.poolCount);

    if (fresh) this._roundStart(lobby, round, hand.length);
    else this._announce(lobby, round);
    this._showTimer(); // resetRound blendet die Anzeige aus

    if (round.status !== "running" && !this.finished) {
      this.finished = true;
      g._finish(round.status === "won");
    }
  }

  /** Timer-Anzeige aus dem zuletzt empfangenen Server-Timer (um die seitdem vergangene Zeit korrigiert) */
  _showTimer() {
    const t = this.timer;
    if (!t) return this.game.timerMeter.hide();
    const gone = (performance.now() - t.at) / 1000;
    this.game.timerMeter.set({ ...t, nextIn: Math.max(0, t.nextIn - gone), graceLeft: Math.max(0, t.graceLeft - gone) });
  }

  /** Neue (oder beim Beitreten laufende) Runde in der Nachrichtenleiste */
  _roundStart(lobby, round, mine) {
    const running = round.status === "running";
    this.game.feed.push({
      kind: "info",
      parts: [running ? `Runde ${round.number}: ` : `Runde ${round.number} ist vorbei · `,
        { b: `${round.placed.length} / ${round.total}` }, " eingesetzt",
        ...(running ? [" · du hast ", { b: String(mine) }, mine === 1 ? " Item" : " Items"] : [])],
    });
  }

  /** Alle noch nicht gezeigten Ereignisse der Runde (Einsetzen, Fehlwurf, Senden, Nachschub, Timer) */
  _announce(lobby, round) {
    const log = round.log ?? (round.last ? [round.last] : []);
    for (const ev of log) {
      if (ev.seq <= this.seq) continue;
      this.seq = ev.seq;
      const msg = this._message(lobby, round, ev);
      if (msg) this.game.feed.push(msg);
    }
  }

  _message(lobby, round, ev) {
    const me = this.client.me?.id;
    const g = this.game;
    const item = (key) => ({ item: g.pieceFor(key)?.name ?? "ein Item" });
    const who = (id, du = "Du") => (id === me ? { who: du, id } : { who: this._name(lobby, id), id });
    switch (ev.type) {
      case "placed":
        return ev.player === me
          ? { kind: "good", parts: [item(ev.key), " sitzt"] }
          : { kind: "good", parts: [who(ev.player), " hat ", item(ev.key), " eingesetzt"] };
      case "miss":
        return {
          kind: "bad",
          parts: [...(ev.player === me ? ["Daneben – "] : [who(ev.player), " lag daneben – "]), item(ev.key),
            round.lives > 0 ? ` · noch ${round.lives} Leben` : ""],
        };
      case "gift":
        if (ev.to === me) return { kind: "gift", parts: [who(ev.player), " hat dir ", item(ev.key), " geschickt"] };
        if (ev.player === me) return { kind: "gift", parts: ["Du hast ", item(ev.key), " an ", who(ev.to), " gesendet"] };
        return { kind: "gift", parts: [who(ev.player), " hat ", item(ev.key), " an ", who(ev.to), " gesendet"] };
      case "refill": {
        const to = Object.entries(ev.to ?? {});
        const parts = [{ b: `+${ev.count}` }, ` neue ${ev.count === 1 ? "Item" : "Items"}`];
        if (to.length) {
          parts.push(": ");
          to.forEach(([id, n], i) => parts.push(...(i ? [", "] : []), who(id, i ? "du" : "Du"), ` ${n}`));
        }
        return { kind: "refill", parts };
      }
      case "take": {
        const parts = ["Zeit abgelaufen – "];
        (ev.items ?? []).forEach(({ player, key }, i) => parts.push(...(i ? [", "] : []), item(key), " (", who(player, "du"), ")"));
        parts.push(" zurück in den Vorrat");
        return { kind: "take", parts };
      }
      default:
        return null;
    }
  }

  /** Neue Chat-Nachrichten (beim ersten Zustand nur die letzten CHAT_HISTORY) */
  _chat(lobby) {
    const chat = lobby.chat ?? [];
    const me = this.client.me?.id;
    let list = chat;
    if (this.chatSeq === null) list = chat.slice(-CHAT_HISTORY);
    else list = chat.filter((m) => m.seq > this.chatSeq);
    for (const m of list) this.game.feed.chat({ id: m.player, name: m.name, text: m.text, mine: m.player === me });
    this.chatSeq = chat.length ? chat[chat.length - 1].seq : (this.chatSeq ?? 0);
  }

  _name(lobby, id) {
    return lobby.players.find((p) => p.id === id)?.name ?? "Jemand";
  }
}
