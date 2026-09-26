// Mitspieler-Spalte am linken Rand (Lobby): ein Feld je Online-Mitspieler mit Anzahl seiner Items.
// Item aufnehmen, dann ein Feld anklicken → Item wird an diesen Spieler gesendet.
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
    this.quota = el.querySelector(".rail-quota");
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

    this._renderQuota();
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
      count.lastChild.textContent = n === 1 ? " Item" : " Items";
      btn.title = `Gehaltenes Item an ${p.name} senden`;
      btn.setAttribute("aria-label", `${p.name}, ${n} Items – gehaltenes Item senden`);
      btn.addEventListener("click", () => this._send(p, btn));
      li.append(btn);
      return li;
    }));
  }

  /** Sendelimit: wie viele Items man noch senden darf bzw. wann wieder */
  _renderQuota() {
    const q = this.client.sends;
    this.quota.hidden = !q || q.left === null;
    if (this.quota.hidden) return;
    this.quota.innerHTML = q.left > 0
      ? `Du kannst <b>${q.left}</b> ${q.left === 1 ? "Item" : "Items"} senden`
      : `Senden wieder nach <b>${q.next}</b> ${q.next === 1 ? "Item" : "Items"}`;
    this.quota.classList.toggle("empty", q.left === 0);
    this.quota.title = `Je ${q.every} vom Server erhaltene Items darfst du 1 Item senden`;
  }

  _send(player, btn) {
    const g = this.game;
    if (g.busy) return;
    if (!g.held.active) return g.toast("Erst ein Item aus dem Inventar aufnehmen", "hint");
    const q = this.client.sends;
    if (q && q.left === 0) {
      return g.toast(`Senden wieder möglich nach ${q.next} weiteren ${q.next === 1 ? "Item" : "Items"} vom Server`, "hint");
    }
    g.giveHeld(player.id, player.name, btn.querySelector(".avatar"));
  }
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
