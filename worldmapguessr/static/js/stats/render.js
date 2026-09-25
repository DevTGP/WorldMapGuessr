// Darstellung: Tabellenzeilen, Summen, Zusammenfassung, JSON-Ansicht.

import { hitRate, placeRate } from "./sort.js";

const KIND_LABEL = { continent: "Kontinent", country: "Staat" };
const pct = new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("de-DE");
const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short" });

function cell(text, className) {
  const td = document.createElement("td");
  if (className) td.className = className;
  if (text instanceof Node) td.append(text);
  else td.textContent = text;
  return td;
}

function rateCell(r) {
  if (r === null) return cell("—", "num muted");
  const wrap = document.createElement("span");
  wrap.className = "rate";
  const bar = document.createElement("span");
  bar.className = r < 0.5 ? "bar low" : "bar";
  bar.innerHTML = `<i style="width:${Math.min(100, Math.round(r * 100))}%"></i>`;
  wrap.append(pct.format(r), bar);
  return cell(wrap, "num");
}

export function renderRows(tbody, items) {
  tbody.replaceChildren(...items.map((it) => {
    const tr = document.createElement("tr");
    const kind = document.createElement("span");
    kind.className = `kind ${it.kind}`;
    kind.textContent = KIND_LABEL[it.kind] ?? it.kind;
    const updated = it.spawned || it.correct || it.incorrect ? dateFmt.format(new Date(it.updated)) : "—";
    const uid = cell(it.uid.slice(0, 8) + "…", "mono muted uid");
    uid.title = `${it.uid} – klicken zum Kopieren`;
    uid.dataset.uid = it.uid;
    tr.append(
      cell(it.name),
      cell(kind),
      cell(it.code, "mono"),
      cell(int.format(it.spawned), "num"),
      cell(int.format(it.correct), "num"),
      cell(int.format(it.incorrect), "num"),
      rateCell(placeRate(it)),
      rateCell(hitRate(it)),
      cell(updated, updated === "—" ? "muted" : ""),
      uid,
    );
    return tr;
  }));
}

/** Summen über die (gefilterten) Items */
export function totals(items) {
  const sum = (k) => items.reduce((s, i) => s + i[k], 0);
  return { spawned: sum("spawned"), correct: sum("correct"), incorrect: sum("incorrect") };
}

export function renderSummary(el, items) {
  const seen = items.filter((i) => i.spawned > 0).length;
  el.innerHTML = `<b>${int.format(items.length)}</b> Items · davon <b>${int.format(seen)}</b> schon gespawnt`;
}

/** Kacheln oben: Summen und Quoten */
export function renderTotals(items) {
  const t = totals(items);
  const $ = (id) => document.getElementById(id);
  const place = placeRate(t);
  const hit = hitRate(t);
  $("t-spawned").textContent = int.format(t.spawned);
  $("t-correct").textContent = int.format(t.correct);
  $("t-incorrect").textContent = int.format(t.incorrect);
  $("t-place-rate").textContent = place === null ? "—" : pct.format(place);
  $("t-place-bar").style.width = `${place === null ? 0 : Math.min(100, Math.round(place * 100))}%`;
  $("t-hit-rate").textContent = hit === null ? "—" : pct.format(hit);
}

/** Summenzeile unter der Tabelle */
export function renderFoot(tfoot, items) {
  const t = totals(items);
  const tr = document.createElement("tr");
  const label = cell(`Summe (${int.format(items.length)} Items)`);
  label.colSpan = 3;
  tr.append(
    label,
    cell(int.format(t.spawned), "num"),
    cell(int.format(t.correct), "num"),
    cell(int.format(t.incorrect), "num"),
    rateCell(placeRate(t)),
    rateCell(hitRate(t)),
    cell(""),
    cell(""),
  );
  tfoot.replaceChildren(tr);
}

export function renderJson(el, items) {
  el.textContent = JSON.stringify(items, null, 2);
}
