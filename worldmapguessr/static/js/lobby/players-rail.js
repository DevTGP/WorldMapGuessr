// Mitspieler-Spalte am linken Rand (Lobby): ein Feld je Online-Mitspieler mit Anzahl seiner Items.
// Item aufnehmen, dann ein Feld anklicken → Item wird an diesen Spieler gesendet.
// Nur sichtbar, wenn der Host das Senden erlaubt und eine Runde läuft.

import { t } from "../i18n/index.js";

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
      count.lastChild.textContent = ` ${t("unit.itemsWord", { n })}`;
      btn.title = t("rail.sendTo", { name: p.name });
      btn.setAttribute("aria-label", t("rail.sendLabel", { name: p.name, n }));
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
    this.quota.innerHTML = q.left > 0 ? t("rail.quota", { n: q.left }) : t("rail.quotaNext", { n: q.next });
    this.quota.classList.toggle("empty", q.left === 0);
    this.quota.title = t("rail.quotaTitle", { n: q.every });
  }

  _send(player, btn) {
    const g = this.game;
    if (g.busy) return;
    if (!g.held.active) return g.toast(t("rail.pickFirst"), "hint");
    const q = this.client.sends;
    if (q && q.left === 0) {
      return g.toast(t("err.send_limit", { n: q.next }), "hint");
    }
    const round = this.client.state?.round;
    if (round?.handCap && (round.handCounts?.[player.id] ?? 0) >= round.handCap) {
      return g.toast(t("err.hand_full"), "hint");
    }
    g.giveHeld(player.id, player.name, btn.querySelector(".avatar"));
  }
}

function initials(name) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
