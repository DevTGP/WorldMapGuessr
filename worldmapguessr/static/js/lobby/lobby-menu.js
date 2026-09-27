// Menü einer Server-Runde. Zwei Modi:
// - Einzelspiel (Solo-Lobby): wie ein normales Einzelspiel-Menü, dazu „Aufbewahren“ und
//   „Mitspieler einladen“ (macht daraus eine Lobby, die Runde läuft weiter).
// - Lobby: Einladungslink, Spielerliste, Lobbyeinstellungen (max. Spieler, Passwort, Senden) und die
//   Spielkonfiguration. Nur der Host darf ändern; Änderungen gehen sofort an den Server und kommen als
//   Lobby-Zustand bei allen an.

import { createStepper } from "../menu/stepper.js";
import { fromWire, toWire } from "../menu/config.js";
import { SOLO_HINTS } from "../menu/menu.js";
import { confirmDialog } from "./confirm.js";
import { identity } from "./identity.js";
import { askPlayer } from "./join-dialog.js";
import { roundNote, ruleHints, sendRule } from "./rules-text.js";
import { MODE } from "../menu/presets.js";
import { t } from "../i18n/index.js";

const SEND_DELAY_MS = 250;
const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>';

export class LobbyMenu {
  /**
   * @param {import("../menu/menu.js").Menu} menu
   * @param {import("./client.js").LobbyClient} client
   * @param {{onJoinRound: () => void, isPlaying: () => boolean}} hooks
   */
  constructor(menu, client, { onJoinRound, isPlaying }) {
    this.menu = menu;
    this.client = client;
    this.isPlaying = isPlaying;
    this.section = document.getElementById("lobby-section");
    this.solo = null; // Modus, wird mit dem ersten Zustand gesetzt
    // Einzelspiel und Menü teilen sich den Knopf: dort „Mitspieler einladen“
    menu.onCreateLobby = () => this._invite();
    // Aufbewahren (Verfall nach Untätigkeit) gilt für Einzelspiel und Lobby
    menu.onTtlEdited = (ttl) => { if (client.isHost) client.sendSettings({ ttl }); };

    // Einladungslink
    const link = `${location.origin}/${client.code}`;
    const input = document.getElementById("lobby-link");
    input.value = link;
    document.getElementById("lobby-copy").addEventListener("click", (e) => this._copy(e.currentTarget, link));
    input.addEventListener("focus", () => input.select());

    // Lobbyeinstellungen (nur Host)
    this.maxPlayers = createStepper({
      id: "lobby-max", label: t("lobby.maxPlayers"), hint: t("lobby.maxPlayersHint"), value: 8, min: 1, max: 50,
      onChange: (v) => client.sendSettings({ maxPlayers: v }),
    });
    document.getElementById("lobby-fields").prepend(this.maxPlayers.el);
    this.pwInput = document.getElementById("lobby-password");
    document.getElementById("lobby-password-set").addEventListener("click", () => {
      client.sendSettings({ password: this.pwInput.value });
      this.pwInput.value = "";
    });
    document.getElementById("lobby-password-clear").addEventListener("click", () => client.sendSettings({ password: "" }));
    this.allowSend = document.getElementById("lobby-allow-send");
    this.allowSend.addEventListener("change", () => client.sendSettings({ allowSend: this.allowSend.checked }));
    this.sendEvery = createStepper({
      id: "lobby-send-every", label: t("lobby.sendLimit"), hint: t("lobby.sendLimitHint"),
      value: 5, min: 0, max: 20,
      onChange: (v) => client.sendSettings({ sendEvery: v }),
    });
    this.sendEvery.el.classList.add("host-only");
    this.allowSend.closest(".field").after(this.sendEvery.el);

    // Verlassen (alle) und Beenden (nur Host)
    document.getElementById("lobby-leave").addEventListener("click", () => this._leave());
    document.getElementById("lobby-close").addEventListener("click", () => this._close());

    // Spielkonfiguration: Host-Änderungen gebündelt senden
    menu.onConfigEdited = (config) => {
      if (!client.isHost) return;
      this.lastLocalEdit = Date.now();
      clearTimeout(this.sendTimer);
      // Neuer Modus → auch sein Sendelimit (danach frei einstellbar)
      const settings = { config: toWire(config) };
      if (config.mode !== this.sentMode && MODE[config.mode]) settings.sendEvery = MODE[config.mode].sendEvery;
      this.sentMode = config.mode;
      this.sendTimer = setTimeout(() => client.sendSettings(settings), SEND_DELAY_MS);
    };
    const running = () => client.state?.round?.status === "running";
    menu.primaryAction = async () => {
      if (client.isHost) {
        if (running() && !(await this._confirmRestart())) return;
        client.startRound();
      } else if (isPlaying()) onJoinRound();
    };
    menu.primaryLabel = (pool) => {
      if (!client.connected) return { text: t("lobby.connecting"), disabled: true };
      if (client.isHost) {
        const what = t(running() ? "lobby.restart" : this.solo ? "menu.start" : "lobby.startAll");
        return pool ? `${what} · ${t("unit.items", { n: pool })}` : what;
      }
      if (isPlaying()) return t("lobby.backToRound");
      return { text: t("lobby.waitHost"), disabled: true };
    };

    // Was die Einstellungen in der Lobby bewirken: Hinweise, Zusammenfassung, Rundenstatus
    const players = () => Math.max(1, (client.state?.players ?? []).filter((p) => p.online).length);
    const soloNote = menu.roundNote;
    menu.players = () => (this.solo ? 1 : players());
    menu.roundNote = () => (this.solo ? soloNote() : roundNote(client.state?.round, client.isHost));
    menu.roundRunning = running;
    this.titleHint = document.getElementById("title-hint").textContent;
    client.addEventListener("state", (e) => this.apply(e.detail));
    client.addEventListener("connection", () => this.menu._update());
  }

  /** Einzelspiel ↔ Lobby: Menü-Teile und Texte umschalten */
  _setMode(solo) {
    if (solo === this.solo) return;
    this.solo = solo;
    this.section.hidden = solo;
    document.getElementById("mp-rules").hidden = solo;
    const create = document.getElementById("menu-create-lobby");
    create.hidden = !solo;
    create.textContent = t("invite.title");
    create.title = t("invite.buttonTitle");
    document.getElementById("menu-title").textContent = solo ? t("game.solo") : t("game.lobby", { code: this.client.code });
    document.querySelector("#menu .eyebrow").textContent = solo ? "WorldMapGuessr" : `WorldMapGuessr · ${t("lobby.title")}`;
    document.getElementById("title-hint").textContent = solo ? this.titleHint : t("hud.hintLobby");
    if (solo) this.menu.setHints(SOLO_HINTS);
  }

  apply(state) {
    this._setMode(!!state.settings.solo);
    const host = this.client.isHost;
    // Spielkonfiguration vom Server übernehmen – außer der Host tippt gerade (sonst springt der Regler)
    if (!host || Date.now() - (this.lastLocalEdit ?? 0) > 1000) {
      this.menu.applyConfig(fromWire(state.settings.config));
      this.sentMode ??= state.settings.config.mode;
    }
    this.menu.setReadOnly(!host);
    this.maxPlayers.value = state.settings.maxPlayers;
    this.section.classList.toggle("readonly", !host);
    this.section.querySelectorAll(".host-only input, .host-only button").forEach((el) => { el.disabled = !host; });
    for (const st of [this.maxPlayers, this.sendEvery]) {
      st.el.querySelectorAll("input, button").forEach((el) => { if (!host) el.disabled = true; });
    }
    this.sendEvery.value = state.settings.sendEvery ?? 0;
    this.sendEvery.el.classList.toggle("muted", state.settings.allowSend === false);
    if (host) this.maxPlayers.value = state.settings.maxPlayers; // Grenzen neu anwenden

    document.getElementById("lobby-privacy").textContent = t(state.settings.private ? "lobby.private" : "lobby.open");
    document.getElementById("lobby-password-clear").hidden = !state.settings.private;
    document.getElementById("lobby-close").hidden = !host;
    this.allowSend.checked = state.settings.allowSend !== false;
    document.getElementById("mp-rule-send").innerHTML = sendRule(state.settings);
    this.menu.ttl.value = state.settings.ttl;
    this.menu.ttl.disabled = !host;
    const online = state.players.filter((p) => p.online).length;
    if (!this.solo) this.menu.setHints(ruleHints(this.menu.config, online));

    this._renderPlayers(state);
    this.menu._update();
  }

  _renderPlayers(state) {
    const ul = document.getElementById("lobby-players");
    const online = state.players.filter((p) => p.online).length;
    document.getElementById("lobby-count").textContent = `${online} / ${state.settings.maxPlayers}`;
    ul.replaceChildren(...state.players.map((p) => {
      const li = document.createElement("li");
      li.className = `player${p.online ? "" : " offline"}${p.host ? " host" : ""}`;
      li.innerHTML = `${p.host ? CROWN : ""}<span class="pname"></span>`;
      li.querySelector(".pname").textContent = p.name + (p.id === this.client.me?.id ? ` ${t("lobby.you")}` : "");
      const role = t(p.host ? "lobby.host" : "player.default");
      li.title = p.online ? role : t("lobby.offline", { role });
      // Host: andere Spieler entfernen
      if (this.client.isHost && p.id !== this.client.me?.id) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "player-kick";
        btn.title = t("kick.button", { name: p.name });
        btn.setAttribute("aria-label", t("kick.label", { name: p.name }));
        btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg>';
        btn.addEventListener("click", () => this._kick(p));
        li.append(btn);
      }
      return li;
    }));
  }

  _confirmRestart() {
    const r = this.client.state?.round;
    const vars = { n: r?.number ?? "", placed: r?.placed?.length ?? 0, total: r?.total ?? 0 };
    return confirmDialog({
      title: t("restart.title"),
      text: t(this.solo ? "restart.textSolo" : "restart.textLobby", vars),
      confirm: t("restart.confirm"),
      danger: true,
    });
  }

  /** Einzelspiel → Lobby: Name festlegen, dann können andere über den Link beitreten */
  async _invite() {
    const who = await askPlayer({
      title: t("invite.title"),
      text: t("invite.text"),
      submit: t("invite.submit"),
      name: identity.name,
      cancelable: true,
    });
    if (!who) return;
    identity.name = who.name;
    this.client.rename(who.name);
    this.client.sendSettings({ solo: false });
  }

  async _leave() {
    const state = this.client.state;
    let text = t("leave.text");
    if (this.client.isHost) {
      const next = state?.players.find((p) => p.online && p.id !== this.client.me?.id);
      text = next ? `${t("leave.hostNext", { name: next.name })} ${text}` : t("leave.last");
    }
    const ok = await confirmDialog({ title: t("leave.title"), text, confirm: t("leave.confirm") });
    if (ok) this.client.leave();
  }

  async _kick(player) {
    const ok = await confirmDialog({
      title: t("kick.title", { name: player.name }),
      text: t("kick.text"),
      confirm: t("kick.confirm"),
      danger: true,
    });
    if (ok) this.client.kick(player.id);
  }

  async _close() {
    const others = (this.client.state?.players ?? []).filter((p) => p.online && p.id !== this.client.me?.id).length;
    const ok = await confirmDialog({
      title: t("close.title"),
      text: others ? t("close.textOthers", { n: others }) : t("close.text"),
      confirm: t("lobby.close"),
      danger: true,
    });
    if (ok) this.client.close();
  }

  async _copy(button, text) {
    const label = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = t("lobby.copied");
    } catch {
      document.getElementById("lobby-link").select();
      button.textContent = t("lobby.copySelected");
    }
    setTimeout(() => { button.textContent = label; }, 1400);
  }
}
