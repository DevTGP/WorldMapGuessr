// Einstiegspunkt: Karte laden, Steuerung binden, Hauptmenü oder Spiel öffnen.
//
// Jede Runde läuft auf dem Server als Lobby: das Einzelspiel ist eine Solo-Lobby (nur ein Spieler). Die
// Startseite (/) zeigt das Hauptmenü (home/home.js) mit den laufenden Spielen; /CODE öffnet ein Spiel. Auf einer
// Seite ist höchstens eine Lobby verbunden: Wechselt man aus dem Hauptmenü in ein anderes Spiel, nachdem hier
// schon eins lief, lädt die Seite neu (sauberer Zustand); „Zurück“ zum laufenden Spiel geht ohne Neuladen.

import { createMap } from "./map/map.js";
import { bindMapControls } from "./map/controls.js";
import { Game } from "./game/game.js";
import { Menu } from "./menu/menu.js";
import { toWire } from "./menu/config.js";
import { MODE } from "./menu/presets.js";
import { identity } from "./lobby/identity.js";
import { prepareRowIcon } from "./menu/item-picker.js";
import { LoadingScreen, yielder } from "./ui/loading-screen.js";
import { Home } from "./home/home.js";
import { askLobbyCode } from "./home/code-dialog.js";
import { SettingsDialog } from "./settings/settings-dialog.js";
import { Cosmos } from "./ui/cosmos.js";
import { serverError, t } from "./i18n/index.js";

const WMG = window.WMG ?? {};

/** Lobby-Teile (Verbindung, Runde, Lobby-Menü, Dialoge) erst bei Bedarf laden: Das Hauptmenü braucht sie
 *  nicht. Nach dem Start werden sie im Leerlauf vorgeladen, damit „Spielen“ nicht auf den Download wartet. */
const lobbyModules = () => import("./lobby/index.js");
const NEW_GAME_URL = "/?neu"; // Startseite direkt mit dem Spielmenü öffnen (nach einem Wechsel mit Neuladen)

// Ladephasen mit Gewicht ≈ typischem Zeitanteil (Download hängt von der Leitung ab). Geladen wird nur
// die grobe Stufe; feinere Kacheln und Items kommen beim Hineinzoomen nach.
const loading = new LoadingScreen(document.getElementById("loading"), [
  { id: "download", weight: 55 },
  { id: "shapes", weight: 10 },
  { id: "icons", weight: 30 },
  { id: "start", weight: 5 },
].map((p) => ({ ...p, label: t(`loading.${p.id}`) })));

/** Icons für das Menü vorab berechnen – mit Fortschritt statt einer langen Pause beim Menüaufbau */
async function prepareIcons(features) {
  const tick = yielder();
  loading.enter("icons", t("loading.itemsOf", { i: 0, n: features.length }));
  for (let i = 0; i < features.length; i++) {
    prepareRowIcon(features[i]);
    if (await tick()) loading.report((i + 1) / features.length, t("loading.itemsOf", { i: i + 1, n: features.length }));
  }
}

const cosmos = new Cosmos(document.getElementById("stage"));

// Kartendaten und Bündel im Service Worker zwischenspeichern (static/sw.js); ohne Bündel (Entwicklung) nicht
if (WMG.serviceWorker && "serviceWorker" in navigator) {
  navigator.serviceWorker.register(WMG.serviceWorker).catch((err) => console.warn("Service Worker:", err));
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
    cosmos.busy = () => map.moving; // Funkeln pausiert, solange die Karte bewegt wird
    const game = new Game(map);
    /** used: auf dieser Seite wurde schon ein Spiel verbunden · code: das gerade verbundene (oder null) */
    const ctx = { map, game, menu: null, home: null, client: null, used: false, code: null };
    const menu = new Menu(map, (config) => startSolo(config, ctx), {
      onCreateLobby: (config) => createLobby(config, menu.ttl.value, ctx),
    });
    ctx.menu = menu;
    const settings = new SettingsDialog();
    settings.onName = (name) => ctx.client?.rename(name);
    const home = new Home({
      map,
      apiBase: WMG.apiBase,
      mapLabel: (config) => menu.mapLabel(config),
      current: () => ctx.code,
      on: {
        play: () => openNewGame(ctx),
        join: async () => {
          const code = await askLobbyCode(WMG.apiBase);
          if (code) openGame(code, ctx);
        },
        settings: () => settings.open(),
        resume: (code) => openGame(code, ctx),
        removed: (code) => { if (code === ctx.code) ctx.code = null; },
      },
    });
    ctx.home = home;
    Object.assign(WMG, { game, map, menu, home, settings }); // Debug-Zugriff über die Konsole
    loading.done(); // blendet aus, während das Hauptmenü schon aufgeht

    // Im Spiel: Einstellungen, zurück zum Hauptmenü, Rundenende-Dialog
    document.getElementById("open-settings").addEventListener("click", () => settings.open());
    document.getElementById("to-home").addEventListener("click", () => showHome(ctx));
    const roundDialog = document.getElementById("round-dialog");
    document.getElementById("dlg-again").addEventListener("click", () => {
      roundDialog.close();
      game.again();
    });
    document.getElementById("dlg-menu").addEventListener("click", () => {
      roundDialog.close();
      openGameMenu(ctx);
    });
    // Nach Sieg oder Niederlage ist das Spiel vorbei: Host (auch im Einzelspiel) beendet die Lobby, Gäste
    // verlassen sie – danach geht es über „closed“/„left“ ins Hauptmenü (startLobby)
    document.getElementById("dlg-home").addEventListener("click", () => {
      roundDialog.close();
      const client = ctx.client;
      if (game.over && client?.connected) {
        if (client.isHost) client.close();
        else client.leave();
        return;
      }
      showHome(ctx);
    });

    if (WMG.lobbyCode) return startLobby(WMG.lobbyCode, ctx);
    (window.requestIdleCallback ?? setTimeout)(() => lobbyModules());
    const newGame = new URLSearchParams(location.search).has("neu");
    showHome(ctx); // setzt die Adresse auf /
    if (newGame) openNewGame(ctx);
  })
  .catch((err) => {
    loading.fail(t("loading.failed", { error: err.message }));
    console.error(err);
  });

// ---------- Navigation ----------

/** Hauptmenü zeigen; ein verbundenes Spiel bleibt im Hintergrund (Einzelspiel: Timer pausiert) */
function showHome(ctx) {
  ctx.game.cancelHeld();
  if (ctx.menu.isOpen) ctx.menu.dialog.close();
  history.replaceState(null, "", "/");
  ctx.home.show();
}

/** Spielmenü „Neues Spiel“ – auf einer Seite, auf der schon ein Spiel lief, erst neu laden */
function openNewGame(ctx) {
  if (ctx.used) {
    location.href = NEW_GAME_URL;
    return;
  }
  ctx.menu.open({ canCancel: true, back: t("common.back"), onDismiss: () => ctx.home.show() });
}

/** Laufendes Spiel öffnen: das verbundene ohne Neuladen, sonst verbinden (bzw. Seite neu laden) */
function openGame(code, ctx) {
  if (code === ctx.code) {
    ctx.home.hide();
    history.replaceState(null, "", `/${code}`);
    return;
  }
  if (ctx.used) {
    location.href = `/${code}`;
    return;
  }
  ctx.home.hide();
  history.replaceState(null, "", `/${code}`);
  startLobby(code, ctx);
}

/** Einstellungen des laufenden Spiels (Einzelspiel oder Lobby) */
function openGameMenu(ctx) {
  ctx.menu.open({ canCancel: ctx.game.running, back: t("home.title"), onBack: () => showHome(ctx) });
}

// ---------- Server ----------

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
    lobby = await newLobby({
      name: identity.name || t("player.default"), config: toWire(config), solo: true, ttl: ctx.menu.ttl.value,
      sendEvery: MODE[config.mode]?.sendEvery,
    });
  } catch (err) {
    return alert(t("error.startRound", { error: err.message }));
  }
  ctx.home.hide();
  history.replaceState(null, "", lobby.url);
  await startLobby(lobby.code, ctx, { autoStart: true });
}

/** Neue Mehrspieler-Lobby mit der aktuellen Menü-Konfiguration */
async function createLobby(config, ttl, ctx) {
  const { askPlayer } = await lobbyModules();
  const who = await askPlayer({
    title: t("menu.createLobby"),
    text: t("create.text"),
    submit: t("menu.createLobby"),
    name: identity.name,
    cancelable: true,
  });
  if (!who) return;
  let lobby;
  try {
    lobby = await newLobby({ name: who.name, config: toWire(config), ttl, sendEvery: MODE[config.mode]?.sendEvery });
  } catch {
    return alert(t("error.createLobby"));
  }
  identity.name = lobby.player.name;
  ctx.menu.dialog.close();
  ctx.home.hide();
  history.replaceState(null, "", lobby.url);
  await startLobby(lobby.code, ctx);
}

/**
 * Server-Runde (Einzelspiel oder Lobby): beitreten (Name/Passwort), verbinden, Menü im Lobby-Modus,
 * Runden übernehmen. autoStart: gleich eine Runde starten (neues Einzelspiel).
 */
async function startLobby(code, ctx, { autoStart = false } = {}) {
  const { game, menu, home } = ctx;
  ctx.used = true;
  const [{ LobbyClient, RemoteRound, LobbyMenu, PlayersRail, askPlayer, showLobbyGone }, info] =
    await Promise.all([lobbyModules(), lobbyInfo(code)]);
  if (!info) {
    identity.clear(code);
    return showLobbyGone(t("gone.notFound"));
  }
  if (info.solo && !identity.get(code)) {
    return showLobbyGone(t("err.solo"), t("game.solo"));
  }
  ctx.code = info.code;

  const client = new LobbyClient(code);
  ctx.client = client;
  // Gemeinsame Runde: Server verteilt die Teile (jedes nur einmal), Einsetzen wird für alle synchronisiert
  const remote = new RemoteRound(game, client);
  const rail = new PlayersRail(document.getElementById("players-rail"), client, game);
  new LobbyMenu(menu, client, {
    onJoinRound: () => menu.dialog.close(),
    isPlaying: () => remote.number > 0 && game.running,
  });
  const again = document.getElementById("dlg-again");
  game.again = () => client.startRound();

  // Badge oben rechts: Einzelspiel bzw. Lobby-Code + Spielerzahl → Einstellungen dieses Spiels
  const badge = document.getElementById("lobby-badge");
  badge.hidden = false;
  badge.addEventListener("click", () => openGameMenu(ctx));

  let started = !autoStart;
  client.addEventListener("state", ({ detail: state }) => {
    // Neues Einzelspiel: Runde starten, sobald die Verbindung steht
    if (!started && client.isHost) {
      started = true;
      if (!state.round) client.startRound();
    }
    const solo = !!state.settings.solo;
    document.getElementById("dlg-menu").textContent = t(solo ? "end.adjust" : "lobby.title");
    document.getElementById("dlg-home").title = t(client.isHost ? "end.homeClose" : "end.homeLeave");
    again.textContent = t(solo ? "end.again" : "end.againAll");
    const online = state.players.filter((p) => p.online).length;
    badge.querySelector("b").textContent = solo ? t("game.solo") : code;
    badge.querySelector("span").textContent = solo ? "" : t("unit.players", { n: online });
    badge.title = t(solo ? "hud.gameSettings" : "hud.openLobby");
    badge.classList.toggle("solo", solo);
    // Neue Runde vom Host (oder laufende Runde beim ersten Beitritt) → mitspielen
    if (state.round && state.round.number !== remote.number && menu.isOpen) menu.dialog.close();
    remote.apply(state, client.hand);
    rail.render(state);
    again.hidden = !client.isHost; // neue Runde startet nur der Host
    menu.setCloseable(game.running);
  });
  // Verlassen bzw. vom Host beendet: im Hauptmenü nur die Liste aktualisieren, sonst dorthin
  const gone = (message, title) => {
    identity.clear(code);
    ctx.code = null;
    ctx.client = null;
    if (home.visible) return home.refresh();
    if (message) showLobbyGone(message, title);
    else location.href = "/";
  };
  client.addEventListener("left", () => gone());
  client.addEventListener("kicked", () => gone(t("gone.kicked"), t("gone.kickedTitle")));
  client.addEventListener("closed", () => gone(client.isHost ? null : t("gone.closed"), t("gone.closedTitle")));
  client.addEventListener("connection", ({ detail }) => {
    badge.classList.toggle("offline", !detail.connected);
    if (!detail.connected) badge.title = t("hud.reconnecting");
  });

  // Beitritt: bekannte Spieler (ID + Token im Browser) direkt, sonst Name/Passwort abfragen
  const known = identity.get(code);
  let join = {};
  if (!known) {
    const who = await askPlayer({
      title: t("join.title", { code }),
      text: info.private ? t("join.private") : "",
      submit: t("join.submit"),
      askPassword: info.private,
      name: identity.name,
    });
    join = who;
    identity.name = who.name;
  }
  if (!autoStart) openGameMenu(ctx);
  client.addEventListener("error", async ({ detail: err }) => {
    if (!err.fatal) return console.warn("Lobby:", err.message);
    if (err.code === "password" || err.code === "full") {
      if (err.code === "password") identity.clear(code);
      const who = await askPlayer({
        title: t("join.title", { code }),
        submit: t("join.submit"),
        askPassword: err.code === "password",
        name: identity.name,
        error: serverError(err),
      });
      identity.name = who.name;
      client.connect(who);
    } else {
      showLobbyGone(serverError(err));
    }
  });
  client.connect(join);
}
