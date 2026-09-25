// Mitspieler-Spalte am linken Rand (Lobby): ein Feld je Online-Mitspieler mit Anzahl seiner Umrisse.
// Umriss aufnehmen, dann ein Feld anklicken → Umriss wird an diesen Spieler gesendet.
// Nur sichtbar, wenn der Host das Senden erlaubt und eine Runde läuft.

export class PlayersRail {
  /**
   * @param {HTMLElement} el
   * @param {import("./client.js").LobbyClient} client
   * @param {import("../game/game.js").Game} game
   */
  constructor(el, client, game) {
    this.el = el;
    this.list = el.querySelector("ul");
    this.client = client;
    this.game = game;
  }

  /** @param {object} state  Lobby-Zustand vom Server */
  render(state) {
    const me = this.client.me?.id;
    const round = state.round;
    const others = state.players.filter((p) => p.online && p.id !== me);
    const show = !!state.settings.allowSend && round?.status === "running" && others.length > 0;
    this.el.hidden = !show;
    if (!show) return;

    const counts = round.handCounts ?? {};
    this.list.replaceChildren(...others.map((p) => {
      const n = counts[p.id] ?? 0;
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rail-player";
      btn.innerHTML = '<span class="avatar" aria-hidden="true"></span><span class="rail-name"></span><span class="rail-count"></span>';
      btn.querySelector(".avatar").textContent = initials(p.name);
      btn.querySelector(".rail-name").textContent = p.name;
      const count = btn.querySelector(".rail-count");
      count.innerHTML = "<b></b><span></span>";
      count.firstChild.textContent = n;
      count.lastChild.textContent = n === 1 ? " Umriss" : " Umrisse";
      btn.title = `Gehaltenen Umriss an ${p.name} senden`;
      btn.setAttribute("aria-label", `${p.name}, ${n} Umrisse – gehaltenen Umriss senden`);
      btn.addEventListener("click", () => this._send(p, btn));
      li.append(btn);
      return li;
    }));
  }

  _send(player, btn) {
    const g = this.game;
    if (g.busy) return;
    if (!g.held.active) return g.toast("Erst einen Umriss aus dem Inventar aufnehmen");
    g.giveHeld(player.id, player.name, btn.querySelector(".avatar"));
  }
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
