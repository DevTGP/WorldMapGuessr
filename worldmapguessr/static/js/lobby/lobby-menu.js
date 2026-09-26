// Menü im Lobby-Modus: Einladungslink, Spielerliste, Lobbyeinstellungen (max. Spieler, Passwort)
// und die Spielkonfiguration. Nur der Host darf ändern; Änderungen gehen sofort an den Server
// und kommen als Lobby-Zustand bei allen an.

import { createStepper } from "../menu/stepper.js";
import { fromWire, toWire } from "../menu/config.js";
import { confirmDialog } from "./confirm.js";
import { roundNote, ruleHints, ruleSummary, sendRule } from "./rules-text.js";

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
    this.allowSend = document.getElementById("lobby-allow-send");
    this.allowSend.addEventListener("change", () => client.sendSettings({ allowSend: this.allowSend.checked }));
    this.sendEvery = createStepper({
      id: "lobby-send-every", label: "Sendelimit", hint: "1 Senden je … erhaltene Items (0 = ohne Limit)",
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
      this.sendTimer = setTimeout(() => client.sendSettings({ config: toWire(config) }), SEND_DELAY_MS);
    };
    const running = () => client.state?.round?.status === "running";
    menu.primaryAction = async () => {
      if (client.isHost) {
        if (running() && !(await this._confirmRestart())) return;
        client.startRound();
      } else if (isPlaying()) onJoinRound();
    };
    menu.primaryLabel = (pool) => {
      if (!client.connected) return { text: "Verbinde …", disabled: true };
      if (client.isHost) {
        const what = running() ? "Runde neu starten" : "Runde für alle starten";
        return pool ? `${what} · ${pool} Items` : what;
      }
      if (isPlaying()) return "Zurück zur Runde";
      return { text: "Warten auf den Host …", disabled: true };
    };

    // Was die Einstellungen in der Lobby bewirken: Hinweise, Zusammenfassung, Rundenstatus
    const players = () => Math.max(1, (client.state?.players ?? []).filter((p) => p.online).length);
    menu.summaryRules = (c, start) => ruleSummary(c, start, players());
    menu.roundNote = () => roundNote(client.state?.round, client.isHost);
    menu.roundRunning = running;
    document.getElementById("mp-rules").hidden = false;
    document.getElementById("title-hint").textContent =
      "Item anklicken und auf der Karte einsetzen – oder links an einen Mitspieler senden · Karte ziehen oder Pfeile zum Drehen";
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
    for (const st of [this.maxPlayers, this.sendEvery]) {
      st.el.querySelectorAll("input, button").forEach((el) => { if (!host) el.disabled = true; });
    }
    this.sendEvery.value = state.settings.sendEvery ?? 0;
    this.sendEvery.el.classList.toggle("muted", state.settings.allowSend === false);
    if (host) this.maxPlayers.value = state.settings.maxPlayers; // Grenzen neu anwenden

    document.getElementById("lobby-privacy").textContent = state.settings.private
      ? "Privat – Beitritt nur mit Passwort" : "Offen – Beitritt mit dem Link";
    document.getElementById("lobby-password-clear").hidden = !state.settings.private;
    document.getElementById("lobby-close").hidden = !host;
    this.allowSend.checked = state.settings.allowSend !== false;
    document.getElementById("mp-rule-send").innerHTML = sendRule(state.settings);
    const online = state.players.filter((p) => p.online).length;
    for (const [key, text] of Object.entries(ruleHints(this.menu.config, online))) this.menu.steppers[key].setHint(text);

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

  _confirmRestart() {
    const r = this.client.state?.round;
    return confirmDialog({
      title: "Laufende Runde abbrechen?",
      text: `Runde ${r?.number ?? ""} wird für alle beendet (${r?.placed?.length ?? 0} von ${r?.total ?? 0} Items eingesetzt). ` +
        "Alle Inventare werden geleert und die neue Runde startet sofort mit den aktuellen Einstellungen.",
      confirm: "Neu starten",
      danger: true,
    });
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
