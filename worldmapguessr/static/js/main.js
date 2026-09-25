// Einstiegspunkt: Karte laden, Steuerung binden, Menü öffnen – im Einzelspiel oder in einer Lobby.

import { createMap } from "./map/map.js";
import { bindMapControls } from "./map/controls.js";
import { Game } from "./game/game.js";
import { Menu } from "./menu/menu.js";
import { fromWire, toWire } from "./menu/config.js";
import { LobbyClient } from "./lobby/client.js";
import { LobbyMenu } from "./lobby/lobby-menu.js";
import { identity } from "./lobby/identity.js";
import { askPlayer, showLobbyGone } from "./lobby/join-dialog.js";

const WMG = window.WMG ?? {};
const loading = document.getElementById("loading");

createMap({ canvas: document.getElementById("map"), dataUrl: WMG.dataUrl ?? "data/world.topo.json" })
  .then(async (map) => {
    bindMapControls(map);
    const game = new Game(map, { apiBase: WMG.apiBase });
    const menu = new Menu(map, (config) => game.newRound(config), {
      onCreateLobby: WMG.lobbyCode ? null : (config) => createLobby(config),
    });
    Object.assign(WMG, { game, map, menu }); // Debug-Zugriff über die Konsole
    loading.hidden = true;

    const roundDialog = document.getElementById("round-dialog");
    document.getElementById("new-round").addEventListener("click", () => menu.open({ canCancel: game.running }));
    document.getElementById("dlg-again").addEventListener("click", () => {
      roundDialog.close();
      game.newRound(game.config); // gleiche Einstellungen, neu gemischt
    });
    document.getElementById("dlg-menu").addEventListener("click", () => {
      roundDialog.close();
      menu.open();
    });

    if (WMG.lobbyCode) await startLobby(WMG.lobbyCode, { map, game, menu });
    else menu.open();
  })
  .catch((err) => {
    loading.hidden = false;
    loading.textContent = `Die Kartendaten konnten nicht geladen werden (${err.message}). Bitte Seite neu laden.`;
    console.error(err);
  });

/** Einzelspiel → neue Lobby mit der aktuellen Menü-Konfiguration */
async function createLobby(config) {
  const who = await askPlayer({
    title: "Lobby erstellen",
    text: "Du wirst Host. Die aktuellen Einstellungen werden übernommen; Passwort und Spielerzahl stellst du danach in der Lobby ein.",
    submit: "Lobby erstellen",
    name: identity.name,
    cancelable: true,
  });
  if (!who) return;
  const res = await fetch(`${WMG.apiBase}/lobbies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: who.name, config: toWire(config) }),
  });
  if (!res.ok) return alert("Die Lobby konnte nicht erstellt werden.");
  const { code, url, player } = await res.json();
  identity.set(code, player);
  identity.name = player.name;
  location.href = url;
}

/** Lobby-Seite: beitreten (Name/Passwort), verbinden, Menü im Lobby-Modus, Runden übernehmen */
async function startLobby(code, { game, menu }) {
  const infoRes = await fetch(`${WMG.apiBase}/lobbies/${code}`);
  if (!infoRes.ok) return showLobbyGone("Diese Lobby gibt es nicht (mehr). Lobbys verfallen nach 24 Stunden ohne Aktivität.");
  const info = await infoRes.json();

  const client = new LobbyClient(code);
  let playingRound = 0; // Nummer der Lobby-Runde, die hier läuft
  const joinRound = (round) => {
    playingRound = round.number;
    if (menu.isOpen) menu.dialog.close();
    document.getElementById("round-dialog").close();
    game.newRound(fromWire(round.config), { seed: round.seed });
  };
  new LobbyMenu(menu, client, {
    onJoinRound: () => joinRound(client.state.round),
    isPlaying: () => playingRound > 0 && game.running,
  });
  document.getElementById("new-round").textContent = "Lobby";
  document.getElementById("dlg-menu").textContent = "Lobby";

  const hud = document.getElementById("lobby-badge");
  hud.hidden = false;
  hud.addEventListener("click", () => menu.open({ canCancel: game.running }));

  client.addEventListener("state", ({ detail: state }) => {
    const online = state.players.filter((p) => p.online).length;
    hud.querySelector("b").textContent = code;
    hud.querySelector("span").textContent = `${online} ${online === 1 ? "Spieler" : "Spieler"}`;
    // Neue Runde vom Host (oder laufende Runde beim ersten Beitritt) → mitspielen
    if (state.round && state.round.number > playingRound) joinRound(state.round);
    menu.setCloseable(game.running);
  });
  // Verlassen: zurück zum Einzelspiel. Beendet (vom Host): Hinweis für alle.
  client.addEventListener("left", () => { location.href = "/"; });
  client.addEventListener("closed", ({ detail }) => {
    if (client.isHost) location.href = "/";
    else showLobbyGone(detail.message, "Lobby beendet");
  });
  client.addEventListener("connection", ({ detail }) => {
    hud.classList.toggle("offline", !detail.connected);
    hud.title = detail.connected ? "Lobby öffnen" : "Verbindung getrennt – verbinde neu …";
  });

  // Beitritt: bekannte Spieler (ID + Token im Browser) direkt, sonst Name/Passwort abfragen
  const known = identity.get(code);
  let join = {};
  if (!known) {
    const who = await askPlayer({
      title: `Lobby ${code} beitreten`,
      text: info.private ? "Diese Lobby ist privat." : "",
      submit: "Beitreten",
      askPassword: info.private,
      name: identity.name,
    });
    join = who;
    identity.name = who.name;
  }
  menu.open();
  client.addEventListener("error", async ({ detail: err }) => {
    if (!err.fatal) return console.warn("Lobby:", err.message);
    if (err.code === "password" || err.code === "full") {
      if (err.code === "password") identity.clear(code);
      const who = await askPlayer({
        title: `Lobby ${code} beitreten`,
        submit: "Beitreten",
        askPassword: err.code === "password",
        name: identity.name,
        error: err.message,
      });
      identity.name = who.name;
      client.connect(who);
    } else {
      showLobbyGone(err.message);
    }
  });
  client.connect(join);
}
