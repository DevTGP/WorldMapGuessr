// Hauptmenü (Startseite): Spielen, Lobby beitreten, Statistik, Einstellungen und die laufenden Spiele.
//
// „Laufende Spiele“ sind alle Lobbys, die dieser Browser kennt (lobby/identity.js – eigene Einzelspiele und
// beigetretene Lobbys). Der Server liefert je Lobby einen Überblick (POST /api/lobbies/mine); was es nicht mehr
// gibt, vergisst der Browser. „Entfernen“: als Host wird die Lobby gelöscht (für alle), sonst verlässt man sie.

import { identity } from "../lobby/identity.js";
import { confirmDialog } from "../lobby/confirm.js";
import { LEVELS, MODE } from "../menu/presets.js";

const ROTATE_DEG_PER_S = 4; // Karte dreht sich im Hintergrund langsam weiter

const ICON_SOLO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.9-3.8 3.6-5.6 7-5.6s6.1 1.8 7 5.6"/></svg>';
const ICON_LOBBY = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.8-3.4 3.2-5 6-5s5.2 1.6 6 5M16 5.5a3 3 0 010 5.6M18.5 14c1.4.7 2.2 2.2 2.5 4"/></svg>';
const ICON_TRASH = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/></svg>';

export class Home {
  /**
   * @param {object} opts
   * @param {import("../map/map.js").WorldMap} opts.map
   * @param {string} opts.apiBase
   * @param {(config: object) => string} opts.mapLabel  Kartenauswahl als Text („Länder · Europa“)
   * @param {() => string|null} opts.current  Code der Lobby, die auf dieser Seite gerade verbunden ist
   * @param {{play: () => void, join: () => void, settings: () => void, resume: (code: string) => void,
   *          removed: (code: string) => void}} opts.on
   */
  constructor({ map, apiBase, mapLabel, current, on }) {
    this.map = map;
    this.apiBase = apiBase;
    this.mapLabel = mapLabel;
    this.current = current;
    this.on = on;
    this.el = document.getElementById("home");
    this.list = document.getElementById("home-games");
    document.getElementById("home-play").addEventListener("click", () => on.play());
    document.getElementById("home-join").addEventListener("click", () => on.join());
    document.getElementById("home-settings").addEventListener("click", () => on.settings());
    document.getElementById("home-refresh").addEventListener("click", () => this.refresh());
    this._spin = this._spin.bind(this);
  }

  get visible() { return !this.el.hidden; }

  show() {
    this.el.hidden = false;
    document.body.classList.add("at-home");
    this.refresh();
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this._last = null;
      cancelAnimationFrame(this._raf);
      this._raf = requestAnimationFrame(this._spin);
    }
  }

  hide() {
    this.el.hidden = true;
    document.body.classList.remove("at-home");
    cancelAnimationFrame(this._raf);
  }

  /** Karte im Hintergrund langsam drehen (nur solange sichtbar und der Tab aktiv ist) */
  _spin(t) {
    if (!this.visible) return;
    if (this._last !== null && !document.hidden && !document.querySelector("dialog[open]")) {
      const dt = Math.min(0.1, (t - this._last) / 1000);
      const v = this.map.view;
      this.map.setView({ ...v, lambda: v.lambda + ROTATE_DEG_PER_S * dt });
    }
    this._last = t;
    this._raf = requestAnimationFrame(this._spin);
  }

  /** Überblick aller bekannten Lobbys vom Server holen und anzeigen */
  async refresh() {
    const known = identity.all();
    const seq = (this._seq = (this._seq ?? 0) + 1);
    if (!known.length) return this._render([]);
    this.list.classList.add("loading");
    let data;
    try {
      const res = await fetch(`${this.apiBase}/lobbies/mine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lobbies: known }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      console.warn("Laufende Spiele nicht geladen:", err.message);
      this.list.classList.remove("loading");
      return;
    }
    if (seq !== this._seq) return; // neuere Abfrage unterwegs
    this.list.classList.remove("loading");
    for (const code of data.gone ?? []) identity.clear(code);
    this._render(data.lobbies ?? []);
  }

  _render(games) {
    games.sort((a, b) => b.lastActive - a.lastActive);
    const cur = this.current();
    // die gerade verbundene Lobby zuerst
    games.sort((a, b) => (b.code === cur) - (a.code === cur));
    document.getElementById("home-count").textContent = games.length ? String(games.length) : "";
    document.getElementById("home-empty").hidden = games.length > 0;
    this.list.replaceChildren(...games.map((g) => this._item(g, g.code === cur)));
  }

  _item(g, current) {
    const li = document.createElement("li");
    li.className = `game-item${current ? " current" : ""}`;
    const r = g.round;
    const pct = r ? Math.round((100 * r.placed) / Math.max(1, r.total)) : 0;
    const config = { ...g.config, kinds: new Set(g.config.kinds ?? []), excluded: new Set(g.config.excluded ?? []) };
    const mode = MODE[g.config.mode] ? `${MODE[g.config.mode].title} ${LEVELS[g.config.level] ?? ""}`.trim() : "Eigene Einstellungen";
    li.innerHTML = `
      <span class="game-icon">${g.solo ? ICON_SOLO : ICON_LOBBY}</span>
      <div class="game-main">
        <p class="game-title"></p>
        <p class="game-sub"></p>
        <div class="game-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
        <p class="game-meta"></p>
      </div>
      <div class="game-actions">
        <button type="button" class="btn btn-primary" data-act="resume"></button>
        <button type="button" class="btn btn-icon" data-act="remove">${ICON_TRASH}</button>
      </div>`;
    const title = li.querySelector(".game-title");
    title.append(g.solo ? "Einzelspiel" : "Lobby ");
    if (!g.solo) title.append(Object.assign(document.createElement("code"), { textContent: g.code }));
    if (current) title.append(tag("gerade offen", true));
    if (!g.solo && g.isHost) title.append(tag("Host"));
    if (g.private) title.append(tag("Passwort"));
    li.querySelector(".game-sub").textContent = `${mode} · ${this.mapLabel(config)}`;

    const meta = li.querySelector(".game-meta");
    const parts = [];
    if (!r) parts.push("noch keine Runde");
    else {
      const status = r.status === "won" ? '<span class="won">geschafft</span>'
        : r.status === "lost" ? '<span class="lost">verloren</span>' : "";
      parts.push(`Runde ${r.number}${status ? ` ${status}` : ""}`, `${r.placed} / ${r.total} eingesetzt`,
        `${r.lives} / ${r.livesMax} Leben`);
    }
    if (!g.solo) parts.push(`${g.online} von ${g.players} online`);
    parts.push(`verfällt ${untilText(g.expiresAt)}`);
    meta.innerHTML = parts.join(" · ");

    const resume = li.querySelector('[data-act="resume"]');
    resume.textContent = current ? "Zurück" : !r || r.status !== "running" ? "Öffnen" : "Fortsetzen";
    resume.addEventListener("click", () => this.on.resume(g.code));
    const remove = li.querySelector('[data-act="remove"]');
    const what = g.solo ? "Einzelspiel löschen" : g.isHost ? "Lobby beenden (für alle)" : "Lobby verlassen";
    remove.title = what;
    remove.setAttribute("aria-label", what);
    remove.addEventListener("click", () => this._remove(g));
    return li;
  }

  async _remove(g) {
    const others = g.players - 1;
    let opts;
    if (g.solo) {
      opts = { title: "Einzelspiel löschen?", text: "Die Runde und ihr Fortschritt werden gelöscht.", confirm: "Löschen", danger: true };
    } else if (g.isHost) {
      opts = {
        title: `Lobby ${g.code} beenden?`,
        text: others > 0
          ? `Du bist Host: Die Lobby wird für alle gelöscht (${others} ${others === 1 ? "weiterer Spieler" : "weitere Spieler"}). Der Link funktioniert danach nicht mehr.`
          : "Du bist Host: Die Lobby wird gelöscht. Der Link funktioniert danach nicht mehr.",
        confirm: "Lobby beenden",
        danger: true,
      };
    } else {
      opts = {
        title: `Lobby ${g.code} verlassen?`,
        text: "Deine Items gehen zurück in den Vorrat. Über den Link kannst du später als neuer Spieler wieder beitreten.",
        confirm: "Verlassen",
      };
    }
    if (!(await confirmDialog(opts))) return;
    const me = identity.get(g.code);
    try {
      const res = await fetch(`${this.apiBase}/lobbies/${g.code}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: me?.id, token: me?.token }),
      });
      if (!res.ok && res.status !== 400) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      alert(`Das hat nicht geklappt (${err.message}). Bitte später noch einmal versuchen.`);
      return;
    }
    identity.clear(g.code); // auch wenn es sie schon nicht mehr gab
    this.on.removed(g.code);
    this.refresh();
  }
}

function tag(text, accent = false) {
  return Object.assign(document.createElement("span"), { className: `tag${accent ? " accent" : ""}`, textContent: text });
}

/** "in 23 h", "in 3 Tagen", "in 12 min" (expiresAt: Unix-Sekunden) */
function untilText(expiresAt) {
  const s = Math.max(0, expiresAt - Date.now() / 1000);
  if (s < 3600) return `in ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 48 * 3600) return `in ${Math.round(s / 3600)} h`;
  return `in ${Math.round(s / 86400)} Tagen`;
}
