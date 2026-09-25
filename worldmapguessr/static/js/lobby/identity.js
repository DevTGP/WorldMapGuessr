// Wer bin ich in dieser Lobby? Spieler-ID + Token pro Lobby und der zuletzt benutzte Name –
// nur im Browser (localStorage), damit Neuladen und späteres Zurückkommen ohne neuen Beitritt gehen.

const KEY_NAME = "wmg.playerName";
const keyLobby = (code) => `wmg.lobby.${code}`;

function read(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* privates Fenster o. Ä. */ }
}

export const identity = {
  get(code) { return read(keyLobby(code)); },                 // {id, token} | null
  set(code, { id, token }) { write(keyLobby(code), { id, token }); },
  clear(code) { try { localStorage.removeItem(keyLobby(code)); } catch { /* egal */ } },
  get name() { return read(KEY_NAME) ?? ""; },
  set name(v) { write(KEY_NAME, v); },
};
