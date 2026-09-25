// Menü im Lobby-Modus: Einladungslink, Spielerliste, Lobbyeinstellungen (max. Spieler, Passwort)
// und die Spielkonfiguration. Nur der Host darf ändern; Änderungen gehen sofort an den Server
// und kommen als Lobby-Zustand bei allen an.

import { createStepper } from "../menu/stepper.js";
import { fromWire, toWire } from "../menu/config.js";
import { confirmDialog } from "./confirm.js";

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
    this.section.hidden = false;
    document.getElementById("menu-create-lobby").hidden = true;
    document.getElementById("menu-title").textContent = `Lobby ${client.code}`;
    document.querySelector("#menu .eyebrow").textContent = "WorldMapGuessr · Lobby";

    // Einladungslink
    const link = `${location.origin}/${client.code}`;
    const input = document.getElementById("lobby-link");
    input.value = link;
    document.getElementById("lobby-copy").addEventListener("click", (e) => this._copy(e.currentTarget, link));
    input.addEventListener("focus", () => input.select());

    // Lobbyeinstellungen (nur Host)
    this.maxPlayers = createStepper({
      id: "lobby-max", label: "Max. Spieler", hint: "gleichzeitig in der Lobby", value: 8, min: 1, max: 50,
      onChange: (v) => client.sendSettings({ maxPlayers: v }),
    });
    document.getElementById("lobby-fields").prepend(this.maxPlayers.el);
    this.pwInput = document.getElementById("lobby-password");
    document.getElementById("lobby-password-set").addEventListener("click", () => {
      client.sendSettings({ password: this.pwInput.value });
      this.pwInput.value = "";
    });
    document.getElementById("lobby-password-clear").addEventListener("click", () => client.sendSettings({ password: "" }));

    // Verlassen (alle) und Beenden (nur Host)
    document.getElementById("lobby-leave").addEventListener("click", () => this._leave());
    document.getElementById("lobby-close").addEventListener("click", () => this._close());

    // Spielkonfiguration: Host-Änderungen gebündelt senden
    menu.onConfigEdited = (config) => {
      if (!client.isHost) return;
      this.lastLocalEdit = Date.now();
      clearTimeout(this.sendTimer);
      this.sendTimer = setTimeout(() => client.sendSettings({ config: toWire(config) }), SEND_DELAY_MS);
    };
    menu.primaryAction = () => {
      if (client.isHost) client.startRound();
      else if (isPlaying()) onJoinRound();
    };
    menu.primaryLabel = (pool) => {
      if (!client.connected) return { text: "Verbinde …", disabled: true };
      if (client.isHost) return pool ? `Neue Runde für alle · ${pool} Teile` : "Neue Runde für alle";
      if (isPlaying()) return "Zurück zur Runde";
      return { text: "Warten auf den Host …", disabled: true };
    };

    menu.summaryPrefix = () => (client.isHost ? "" : '<span class="guest-note">Der Host stellt die Runde ein.</span> · ');
    client.addEventListener("state", (e) => this.apply(e.detail));
    client.addEventListener("connection", () => this.menu._update());
  }

  apply(state) {
    const host = this.client.isHost;
    // Spielkonfiguration vom Server übernehmen – außer der Host tippt gerade (sonst springt der Regler)
    if (!host || Date.now() - (this.lastLocalEdit ?? 0) > 1000) {
      this.menu.applyConfig(fromWire(state.settings.config));
    }
    this.menu.setReadOnly(!host);
    this.maxPlayers.value = state.settings.maxPlayers;
    this.section.classList.toggle("readonly", !host);
    this.section.querySelectorAll(".host-only input, .host-only button").forEach((el) => { el.disabled = !host; });
    this.maxPlayers.el.querySelectorAll("input, button").forEach((el) => { if (!host) el.disabled = true; });
    if (host) this.maxPlayers.value = state.settings.maxPlayers; // Grenzen neu anwenden

    document.getElementById("lobby-privacy").textContent = state.settings.private
      ? "Privat – Beitritt nur mit Passwort" : "Offen – Beitritt mit dem Link";
    document.getElementById("lobby-password-clear").hidden = !state.settings.private;
    document.getElementById("lobby-close").hidden = !host;

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
      li.querySelector(".pname").textContent = p.name + (p.id === this.client.me?.id ? " (du)" : "");
      li.title = p.host ? (p.online ? "Host" : "Host – gerade nicht verbunden") : "Spieler";
      return li;
    }));
  }

  async _leave() {
    const state = this.client.state;
    let text = "Du kannst später über den Link wieder beitreten – als neuer Spieler.";
    if (this.client.isHost) {
      const next = state?.players.find((p) => p.online && p.id !== this.client.me?.id);
      text = next
        ? `Du bist Host. Die Rolle geht an ${next.name}. ` + text
        : "Du bist der letzte Spieler – die Lobby wird damit gelöscht.";
    }
    const ok = await confirmDialog({ title: "Lobby verlassen?", text, confirm: "Verlassen" });
    if (ok) this.client.leave();
  }

  async _close() {
    const others = (this.client.state?.players ?? []).filter((p) => p.online && p.id !== this.client.me?.id).length;
    const ok = await confirmDialog({
      title: "Lobby beenden?",
      text: others
        ? `Die Lobby wird für alle gelöscht – ${others} ${others === 1 ? "Spieler wird" : "Spieler werden"} hinausgeworfen. Der Link funktioniert danach nicht mehr.`
        : "Die Lobby wird gelöscht. Der Link funktioniert danach nicht mehr.",
      confirm: "Lobby beenden",
      danger: true,
    });
    if (ok) this.client.close();
  }

  async _copy(button, text) {
    const label = button.textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Kopiert";
    } catch {
      document.getElementById("lobby-link").select();
      button.textContent = "Markiert – Strg+C";
    }
    setTimeout(() => { button.textContent = label; }, 1400);
  }
}
