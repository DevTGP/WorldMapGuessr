// Einstiegspunkt: Karte laden, Steuerung binden, Menü öffnen.
//
// Jede Runde läuft auf dem Server als Lobby: das Einzelspiel ist eine Solo-Lobby (nur ein Spieler). Der
// Browser merkt sich ihren Code; die Startseite setzt sie fort (die Adresse wird zu /CODE), bis sie
// verfällt. Gibt es keine, öffnet das Menü – „Runde starten“ legt dann eine Solo-Lobby an.

import { createMap } from "./map/map.js";
import { bindMapControls } from "./map/controls.js";
import { Game } from "./game/game.js";
import { RemoteRound } from "./game/remote.js";
import { Menu } from "./menu/menu.js";
import { toWire } from "./menu/config.js";
import { LobbyClient } from "./lobby/client.js";
import { LobbyMenu } from "./lobby/lobby-menu.js";
import { PlayersRail } from "./lobby/players-rail.js";
import { identity } from "./lobby/identity.js";
import { askPlayer, showLobbyGone } from "./lobby/join-dialog.js";
import { prepareRowIcon } from "./menu/item-picker.js";
import { LoadingScreen, yielder } from "./ui/loading-screen.js";

const WMG = window.WMG ?? {};

// Ladephasen mit Gewicht ≈ typischem Zeitanteil (Download hängt von der Leitung ab). Geladen wird nur
// die grobe Stufe; feinere Kacheln und Items kommen beim Hineinzoomen nach.
const loading = new LoadingScreen(document.getElementById("loading"), [
  { id: "download", label: "Kartendaten herunterladen", weight: 55 },
  { id: "shapes", label: "Umrisse vorbereiten", weight: 10 },
  { id: "icons", label: "Items vorbereiten", weight: 30 },
  { id: "start", label: "Karte zeichnen", weight: 5 },
]);

/** Icons für das Menü vorab berechnen – mit Fortschritt statt einer langen Pause beim Menüaufbau */
async function prepareIcons(features) {
  const tick = yielder();
  loading.enter("icons", `0 / ${features.length} Items`);
  for (let i = 0; i < features.length; i++) {
    prepareRowIcon(features[i]);
    if (await tick()) loading.report((i + 1) / features.length, `${i + 1} / ${features.length} Items`);
  }
}

createMap({
  canvas: document.getElementById("map"),
  base: WMG.mapBase,
  startBytes: WMG.dataSize,
  loading,
})
  .then(async (map) => {
    await prepareIcons(map.features);
    loading.enter("start");
    await yielder()(true);
    bindMapControls(map);
    const game = new Game(map);
    const ctx = { map, game, menu: null };
    const menu = new Menu(map, (config) => startSolo(config, ctx), {
      onCreateLobby: (config) => createLobby(config, menu.ttl.value),
    });
    ctx.menu = menu;
    Object.assign(WMG, { game, map, menu }); // Debug-Zugriff über die Konsole
    loading.done(); // blendet aus, während das Menü schon aufgeht

    const roundDialog = document.getElementById("round-dialog");
    document.getElementById("new-round").addEventListener("click", () => menu.open({ canCancel: game.running }));
    document.getElementById("dlg-again").addEventListener("click", () => {
      roundDialog.close();
      game.again();
    });
    document.getElementById("dlg-menu").addEventListener("click", () => {
      roundDialog.close();
      menu.open();
    });

    if (WMG.lobbyCode) return startLobby(WMG.lobbyCode, ctx);
    // Startseite: eigenes Einzelspiel fortsetzen, falls es noch besteht
    const solo = identity.solo;
    if (solo && identity.get(solo) && (await lobbyInfo(solo))?.solo) {
      history.replaceState(null, "", `/${solo}`);
      return startLobby(solo, ctx);
    }
    identity.solo = null;
    menu.open();
  })
  .catch((err) => {
    loading.fail(`${err.message} – bitte Verbindung prüfen und neu laden.`);
    console.error(err);
  });

/** Öffentliche Infos einer Lobby oder null (gibt es nicht mehr) */
async function lobbyInfo(code) {
  try {
    const res = await fetch(`${WMG.apiBase}/lobbies/${code}`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Neue Lobby anlegen (solo: Einzelspiel) → {code, url, player} */
async function newLobby(body) {
  const res = await fetch(`${WMG.apiBase}/lobbies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const lobby = await res.json();
  identity.set(lobby.code, lobby.player);
  return lobby;
}

/** Einzelspiel starten: Solo-Lobby mit der Menü-Konfiguration anlegen und die Runde darin starten */
async function startSolo(config, ctx) {
  let lobby;
  try {
    lobby = await newLobby({ name: identity.name || "Spieler", config: toWire(config), solo: true, ttl: ctx.menu.ttl.value });
  } catch (err) {
    return alert(`Die Runde konnte nicht gestartet werden (${err.message}).`);
  }
  identity.solo = lobby.code;
  history.replaceState(null, "", lobby.url);
  await startLobby(lobby.code, ctx, { autoStart: true });
}

/** Startseite → neue Mehrspieler-Lobby mit der aktuellen Menü-Konfiguration */
async function createLobby(config, ttl) {
  const who = await askPlayer({
    title: "Lobby erstellen",
    text: "Du wirst Host. Die aktuellen Einstellungen werden übernommen; Passwort und Spielerzahl stellst du danach in der Lobby ein.",
    submit: "Lobby erstellen",
    name: identity.name,
    cancelable: true,
  });
  if (!who) return;
  let lobby;
  try {
    lobby = await newLobby({ name: who.name, config: toWire(config), ttl });
  } catch {
    return alert("Die Lobby konnte nicht erstellt werden.");
  }
  identity.name = lobby.player.name;
  location.href = lobby.url;
}

/**
 * Server-Runde (Einzelspiel oder Lobby): beitreten (Name/Passwort), verbinden, Menü im Lobby-Modus,
 * Runden übernehmen. autoStart: gleich eine Runde starten (neues Einzelspiel).
 */
async function startLobby(code, { game, menu }, { autoStart = false } = {}) {
  const info = await lobbyInfo(code);
  if (!info) {
    if (code === identity.solo) { // eigenes Einzelspiel verfallen → neu anfangen
      identity.solo = null;
      return location.replace("/");
    }
    return showLobbyGone("Diese Lobby gibt es nicht (mehr). Lobbys verfallen nach der eingestellten Zeit ohne Aktivität.");
  }
  if (info.solo && !identity.get(code)) {
    return showLobbyGone("Das ist die Einzelspieler-Runde eines anderen Spielers. Beitreten geht erst, wenn sie zur Lobby gemacht wird.", "Einzelspiel");
  }

  const client = new LobbyClient(code);
  // Gemeinsame Runde: Server verteilt die Teile (jedes nur einmal), Einsetzen wird für alle synchronisiert
  const remote = new RemoteRound(game, client);
  const rail = new PlayersRail(document.getElementById("players-rail"), client, game);
  new LobbyMenu(menu, client, {
    onJoinRound: () => menu.dialog.close(),
    isPlaying: () => remote.number > 0 && game.running,
  });
  const again = document.getElementById("dlg-again");
  game.again = () => client.startRound();

  const hud = document.getElementById("lobby-badge");
  hud.addEventListener("click", () => menu.open({ canCancel: game.running }));

  let started = !autoStart;
  client.addEventListener("state", ({ detail: state }) => {
    // Neues Einzelspiel: Runde starten, sobald die Verbindung steht
    if (!started && client.isHost) {
      started = true;
      if (!state.round) client.startRound();
    }
    // Einzelspiel sieht aus wie bisher; erst als Lobby gibt es Badge, „Lobby“-Knopf und „für alle“
    const solo = !!state.settings.solo;
    hud.hidden = solo;
    document.getElementById("new-round").textContent = solo ? "Neue Runde" : "Lobby";
    document.getElementById("dlg-menu").textContent = solo ? "Einstellungen" : "Lobby";
    again.textContent = solo ? "Nochmal" : "Neue Runde für alle";
    const online = state.players.filter((p) => p.online).length;
    hud.querySelector("b").textContent = code;
    hud.querySelector("span").textContent = `${online} Spieler`;
    // Neue Runde vom Host (oder laufende Runde beim ersten Beitritt) → mitspielen
    if (state.round && state.round.number !== remote.number && menu.isOpen) menu.dialog.close();
    remote.apply(state, client.hand);
    rail.render(state);
    again.hidden = !client.isHost; // neue Runde startet nur der Host
    menu.setCloseable(game.running);
  });
  // Verlassen: zurück zum Einzelspiel. Beendet (vom Host): Hinweis für alle.
  client.addEventListener("left", () => {
    if (code === identity.solo) identity.solo = null;
    location.href = "/";
  });
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
  if (!autoStart) menu.open();
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
