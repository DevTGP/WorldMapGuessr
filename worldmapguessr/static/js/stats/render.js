// Darstellung: Tabellenzeilen, Zusammenfassung, JSON-Ansicht.

import { hitRate } from "./sort.js";

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

function rateCell(item) {
  const r = hitRate(item);
  if (r === null) return cell("—", "num muted");
  const wrap = document.createElement("span");
  wrap.className = "rate";
  const bar = document.createElement("span");
  bar.className = r < 0.5 ? "bar low" : "bar";
  bar.innerHTML = `<i style="width:${Math.round(r * 100)}%"></i>`;
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
      rateCell(it),
      cell(updated, updated === "—" ? "muted" : ""),
      uid,
    );
    return tr;
  }));
}

export function renderSummary(el, items) {
  const sum = (k) => items.reduce((s, i) => s + i[k], 0);
  const correct = sum("correct");
  const attempts = correct + sum("incorrect");
  const seen = items.filter((i) => i.spawned > 0).length;
  el.innerHTML =
    `<b>${int.format(items.length)}</b> Items · <b>${int.format(seen)}</b> schon gespawnt · ` +
    `<b>${int.format(attempts)}</b> Einsetzversuche · Trefferquote <b>${attempts ? pct.format(correct / attempts) : "—"}</b>`;
}

export function renderJson(el, items) {
  el.textContent = JSON.stringify(items, null, 2);
}
