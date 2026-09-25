// WebSocket-Verbindung zu einer Lobby: beitreten, Zustand empfangen, Einstellungen/Start senden.
// Baut die Verbindung bei Abbruch selbst wieder auf (mit Wiederbeitritt über ID + Token).

import { identity } from "./identity.js";

const PING_MS = 25000;
const RETRY_MS = [1000, 2000, 4000, 8000, 10000];

export class LobbyClient extends EventTarget {
  /** @param {string} code */
  constructor(code) {
    super();
    this.code = code;
    this.me = null;          // {id, name}
    this.state = null;       // letzter Lobby-Zustand vom Server
    this.ws = null;
    this.retry = 0;
    this.closedForGood = false;
    this.joinData = null;    // {name, password}
  }

  get isHost() { return !!this.me && this.state?.host === this.me.id; }
  get connected() { return this.ws?.readyState === WebSocket.OPEN; }

  /** Verbinden und beitreten. name/password nur beim ersten Beitritt nötig. */
  connect({ name, password } = {}) {
    this.joinData = { name, password };
    this.closedForGood = false;
    this._open();
  }

  sendSettings(settings) { this._send({ type: "settings", settings }); }
  startRound() { this._send({ type: "start" }); }

  _open() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/lobby/${this.code}`);
    this.ws = ws;
    ws.addEventListener("open", () => {
      const known = identity.get(this.code);
      ws.send(JSON.stringify({
        type: "join",
        playerId: known?.id,
        token: known?.token,
        name: this.joinData?.name || identity.name,
        password: this.joinData?.password || "",
      }));
      clearInterval(this.pinger);
      this.pinger = setInterval(() => this._send({ type: "ping" }), PING_MS);
    });
    ws.addEventListener("message", (e) => this._onMessage(JSON.parse(e.data)));
    ws.addEventListener("close", () => {
      clearInterval(this.pinger);
      if (this.ws !== ws || this.closedForGood) return;
      this._emit("connection", { connected: false });
      const delay = RETRY_MS[Math.min(this.retry++, RETRY_MS.length - 1)];
      setTimeout(() => this._open(), delay);
    });
  }

  _onMessage(msg) {
    switch (msg.type) {
      case "welcome":
        this.me = { id: msg.player.id, name: msg.player.name };
        if (msg.player.token) identity.set(this.code, { id: msg.player.id, token: msg.player.token });
        identity.name = msg.player.name;
        this.retry = 0;
        this._emit("connection", { connected: true });
        this._emit("welcome", this.me);
        break;
      case "state":
        this.state = msg.lobby;
        this._emit("state", msg.lobby);
        break;
      case "error":
        if (msg.fatal) {
          this.closedForGood = true;
          this.ws.close();
        }
        this._emit("error", msg);
        break;
      default:
        break; // pong
    }
  }

  _send(msg) {
    if (this.connected) this.ws.send(JSON.stringify(msg));
  }

  _emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}
