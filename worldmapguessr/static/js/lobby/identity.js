// Wer bin ich in dieser Lobby? Spieler-ID + Token pro Lobby (auch jedes Einzelspiel ist eine Lobby) und der
// Spielername – nur im Browser (localStorage), damit Neuladen und späteres Zurückkommen ohne neuen Beitritt
// gehen. Das Hauptmenü listet alle bekannten Lobbys als „Laufende Spiele“ (home/home.js).

const KEY_NAME = "wmg.playerName";
const PREFIX = "wmg.lobby.";
const keyLobby = (code) => `${PREFIX}${code}`;

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
  /** Alle bekannten Lobbys → [{code, id, token}] */
  all() {
    const out = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        const v = read(key);
        if (v?.id && v?.token) out.push({ code: key.slice(PREFIX.length), id: v.id, token: v.token });
      }
    } catch { /* ohne Speicher: keine */ }
    return out;
  },
  get name() { return read(KEY_NAME) ?? ""; },
  set name(v) { write(KEY_NAME, v); },
};
