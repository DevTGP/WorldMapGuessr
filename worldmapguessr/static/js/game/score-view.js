// Punkte im Rundenende-Dialog (#dlg-score). Die Punkte rechnet der Server (lobbies/scoring.py) und schickt sie
// mit der Runde: score = {players: {id: {points, hits, misses}}, bonus: {lives, win, total} | null, total, mult}.
//   Einzelspiel: Aufschlüsselung (Treffer, Fehlwürfe, Leben- und Siegbonus, Multiplikator, Gesamt)
//   Lobby:       Rangliste der Spieler, darunter Teambonus und Teamsumme

import { fmt, t } from "../i18n/index.js";
import { playerHue } from "../ui/feed.js";

const MISS = -30; // wie scoring.MISS

/**
 * @param {HTMLElement} root  #dlg-score
 * @param {{score?: object}} round  Runde vom Server
 * @param {{solo: boolean, me?: string, players: {id: string, name: string}[]}} ctx
 */
export function renderScore(root, round, { solo, me, players }) {
  const score = round?.score;
  root.hidden = !score;
  if (!score) return;
  const signed = (n) => (n > 0 ? "+" : "") + fmt(n);
  const row = (label, value, cls = "") => {
    const tr = document.createElement("tr");
    if (cls) tr.className = cls;
    const th = document.createElement("th");
    th.scope = "row";
    if (label instanceof Node) th.append(label); else th.textContent = label;
    const td = document.createElement("td");
    td.textContent = value;
    tr.append(th, td);
    return tr;
  };
  const table = document.createElement("table");
  table.className = "score-table";
  const body = document.createElement("tbody");
  const bonus = score.bonus ?? { lives: 0, win: 0, total: 0 };
  const mult = t("score.mult", { mult: fmt(score.mult, { minimumFractionDigits: score.mult % 1 ? 1 : 0 }) });

  if (solo) {
    const s = Object.values(score.players)[0] ?? { points: 0, hits: 0, misses: 0 };
    const missPts = s.misses * Math.round(MISS * score.mult);
    body.append(
      row(t("score.hits", { n: s.hits }), signed(s.points - missPts)),
      row(t("score.misses", { n: s.misses }), signed(missPts)),
    );
    if (bonus.lives) body.append(row(t("score.livesBonus"), signed(bonus.lives)));
    if (bonus.win) body.append(row(t("score.winBonus"), signed(bonus.win)));
  } else {
    const names = new Map(players.map((p) => [p.id, p.name]));
    const ranked = Object.entries(score.players).sort(([, a], [, b]) => b.points - a.points);
    let rank = 0, last = null;
    ranked.forEach(([id, s], i) => {
      if (s.points !== last) rank = i + 1;
      last = s.points;
      const label = document.createElement("span");
      const who = document.createElement("b");
      who.className = "who";
      who.style.setProperty("--hue", playerHue(id));
      who.textContent = (names.get(id) ?? t("feed.someone")) + (id === me ? ` ${t("lobby.you")}` : "");
      const detail = document.createElement("small");
      detail.textContent = t("score.detail", { hits: s.hits, misses: s.misses });
      label.append(`${rank}. `, who, " ", detail);
      body.append(row(label, fmt(s.points), id === me ? "me" : ""));
    });
    if (bonus.total) body.append(row(t("score.teamBonus", { lives: fmt(bonus.lives), win: fmt(bonus.win) }), signed(bonus.total), "bonus"));
  }
  const foot = document.createElement("tfoot");
  foot.append(row(t(solo ? "score.total" : "score.teamTotal"), fmt(score.total), "total"));
  table.append(body, foot);
  const note = document.createElement("p");
  note.className = "score-note";
  note.textContent = mult;
  root.replaceChildren(table, note);
}
