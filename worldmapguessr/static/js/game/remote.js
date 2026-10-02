// Server-Runde im Browser (Einzelspiel = Solo-Lobby, oder Lobby mit Mitspielern): bildet den Server-Zustand
// (Runde + eigenes Inventar) auf Karte, Inventar, Leben und Fortschritt ab. Der Server ist maßgeblich –
// jedes Teil liegt in der Runde nur einmal vor; der Browser prüft nur, ob ein Teil passt, und meldet das
// Ergebnis. Im Einzelspiel hält der Server den Timer an, solange hier ein Dialog offen ist.

import { fromWire } from "../menu/config.js";
import { parts, serverError, t } from "../i18n/index.js";

/** Fehler, nach denen der eigene (optimistische) Stand verworfen wird */
const RESYNC_ERRORS = new Set(["not_in_hand", "round_over", "no_round", "bad_target", "send_disabled", "send_limit", "hand_full"]);
/** So viele ältere Chat-Nachrichten zeigt die Leiste beim Beitreten */
const CHAT_HISTORY = 10;
const PAUSE_CHECK_MS = 300;

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
    this.paused = null;     // zuletzt gemeldeter Pausenzustand (Einzelspiel)
    game.remote = this;

    // Einzelspiel: Menü/Dialog offen oder Tab im Hintergrund → Timer anhalten
    setInterval(() => this._syncPause(), PAUSE_CHECK_MS);
    client.addEventListener("welcome", () => { this.paused = null; });

    client.addEventListener("error", ({ detail: err }) => {
      if (["send_limit", "send_disabled", "hand_full"].includes(err.code)) game.toast(serverError(err), "hint");
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
  /** Einzelspiel (Solo-Lobby)? */
  get solo() { return !!this.client.state?.settings?.solo; }

  /** Kostet ein Fehlwurf gerade das Item? (Modus-Regel, nicht im Endspurt) */
  get missLoses() {
    const r = this.client.state?.round;
    return !!r?.config?.missLoses && !r.endspurt;
  }

  apply(lobby, hand) {
    const solo = !!lobby.settings.solo;
    this.game.feed.setChat(solo ? null : (text) => this.client.chat(text));
    this.game.lives.setTitle(t(solo ? "hud.lives" : "hud.livesShared"));
    this._chat(lobby);
    const timer = lobby.round?.status === "running" ? lobby.round.timer : null;
    this.timer = timer ? { ...timer, at: performance.now() } : null;
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

    if (g.lives.max !== round.livesMax) g.lives.reset(round.livesMax, round.lives); // Nachzügler: mehr Leben
    g.lives.set(round.lives);
    g.setProgress(round.placed.length, round.total);
    g.setRefill(round.sinceRefill ?? 0, round.poolCount);

    if (fresh) this._roundStart(lobby, round, hand.length);
    else this._announce(lobby, round);
    this._showTimer(); // resetRound blendet die Anzeige aus

    if (round.status !== "running" && !this.finished) {
      this.finished = true;
      g._finish(round.status === "won", round.lostReason);
    }
  }

  _syncPause() {
    const round = this.client.state?.round;
    // auch ohne Timer: die Tempo-Wertung (Punkte) soll Pausen nicht mitzählen
    if (!this.solo || !this.client.connected || round?.status !== "running") return;
    const paused = !!document.querySelector("dialog[open]") || document.hidden ||
      document.body.classList.contains("at-home"); // Hauptmenü offen
    if (paused === this.paused) return;
    this.paused = paused;
    this.client.pause(paused);
  }

  /** Timer-Anzeige aus dem zuletzt empfangenen Server-Timer (um die seitdem vergangene Zeit korrigiert) */
  _showTimer() {
    const timer = this.timer;
    if (!timer) return this.game.timerMeter.hide();
    const gone = (performance.now() - timer.at) / 1000;
    this.game.timerMeter.set({ ...timer, nextIn: Math.max(0, timer.nextIn - gone), graceLeft: Math.max(0, timer.graceLeft - gone) });
  }

  /** Neue (oder beim Beitreten laufende) Runde in der Nachrichtenleiste */
  _roundStart(lobby, round, mine) {
    const vars = { n: round.number, placed: { b: `${round.placed.length} / ${round.total}` },
      mine: { b: t("unit.items", { n: mine }) } };
    this.game.feed.push({ kind: "info", parts: parts(round.status === "running" ? "feed.roundStart" : "feed.roundOver", vars) });
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
    const mine = ev.player === me;
    const g = this.game;
    const item = (key) => ({ item: g.pieceFor(key)?.name ?? t("feed.anItem") });
    const who = (id, lower = false) => ({ who: id === me ? t(lower ? "feed.youLower" : "feed.you") : this._name(lobby, id), id });
    const pts = typeof ev.points === "number" ? [{ pts: ev.points }] : [];
    const msg = (kind, key, vars = {}, extra = []) => ({ kind, parts: [...parts(key, vars), ...extra] });
    switch (ev.type) {
      case "placed":
        return msg("good", mine ? "feed.placedMe" : "feed.placed", { who: who(ev.player), item: item(ev.key) }, pts);
      case "miss":
        // ohne Itemnamen: ein Fehlwurf verrät nicht, welches Item es war
        return msg("bad", mine ? "feed.missMe" : "feed.miss", { who: who(ev.player) }, [
          ev.lost ? t("feed.missLost") : "",
          round.lives > 0 ? t("feed.livesLeft", { n: round.lives }) : "",
          ...pts,
        ]);
      case "join": {
        const vars = { who: who(ev.player), items: { b: t("unit.items", { n: ev.count }) }, lives: { b: t("feed.plusLives", { n: ev.lives }) } };
        return msg("refill", mine ? "feed.joinMe" : "feed.join", vars);
      }
      case "endspurt": {
        const c = round.config ?? {};
        const rules = [c.timer ? t("feed.endspurtNoTake") : "", c.missLoses ? t("feed.endspurtKeep") : ""].filter(Boolean);
        return msg("info", "feed.endspurt", { title: { b: t("feed.endspurtTitle") } }, rules.length ? [` – ${rules.join(", ")}`] : []);
      }
      case "empty":
        return msg("bad", "feed.empty", { title: { b: t("feed.emptyTitle") } });
      case "gift": {
        const vars = { who: who(ev.player), to: who(ev.to), item: item(ev.key) };
        return msg("gift", ev.to === me ? "feed.giftToMe" : mine ? "feed.giftByMe" : "feed.gift", vars);
      }
      case "refill": {
        const to = Object.entries(ev.to ?? {});
        const extra = [];
        if (to.length && !this.solo) {
          extra.push(": ");
          to.forEach(([id, n], i) => extra.push(...(i ? [", "] : []), who(id, i > 0), ` ${n}`));
        }
        return msg("refill", "feed.refill", { count: { b: `+${ev.count}` }, n: ev.count }, extra);
      }
      case "take": {
        const items = [];
        (ev.items ?? []).forEach(({ player, key }, i) =>
          items.push(...(i ? [", "] : []), item(key), ...(this.solo ? [] : [" (", who(player, true), ")"])));
        return msg("take", "feed.take", { items });
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
    for (const m of list) {
      if (m.system === "kick") this.game.feed.push({ kind: "info", parts: parts("feed.kicked", { who: { who: m.name, id: m.player } }) });
      else if (!m.system) this.game.feed.chat({ id: m.player, name: m.name, text: m.text, mine: m.player === me });
    }
    this.chatSeq = chat.length ? chat[chat.length - 1].seq : (this.chatSeq ?? 0);
  }

  _name(lobby, id) {
    return lobby.players.find((p) => p.id === id)?.name ?? t("feed.someone");
  }
}
