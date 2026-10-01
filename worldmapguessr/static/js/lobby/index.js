// Lobby-Teile, die main.js erst bei Bedarf lädt (import()): ein Einstieg, damit sie im Bündel ein Teil sind
export { LobbyClient } from "./client.js";
export { RemoteRound } from "../game/remote.js";
export { LobbyMenu } from "./lobby-menu.js";
export { PlayersRail } from "./players-rail.js";
export { askPlayer, showLobbyGone } from "./join-dialog.js";
