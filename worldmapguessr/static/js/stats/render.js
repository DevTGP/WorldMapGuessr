// Darstellung: Tabellenzeilen, Summen, Zusammenfassung, JSON-Ansicht.

import { hitRate, placeRate } from "./sort.js";
import { locale, t } from "../i18n/index.js";

const KIND_LABEL = { continent: t("stats.kind.continent"), country: t("stats.kind.country") };
const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat(locale);
const dateFmt = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" });

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

const dec = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Schwierigkeit 0…10: Zahl + Balken (grün → rot) */
function difficultyCell(d) {
  if (d == null) return cell("—", "num muted");
  const wrap = document.createElement("span");
  wrap.className = "rate difficulty";
  const bar = document.createElement("span");
  bar.className = "bar";
  const hue = Math.round(130 - d * 13); // 130° grün … 0° rot
  bar.innerHTML = `<i style="width:${d * 10}%;background:hsl(${hue} 55% 45%)"></i>`;
  wrap.append(dec.format(d), bar);
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
    uid.title = t("stats.copyUid", { uid: it.uid });
    uid.dataset.uid = it.uid;
    tr.append(
      cell(it.name),
      cell(kind),
      cell(it.code, "mono"),
      difficultyCell(it.difficulty),
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
  el.innerHTML = t("stats.summary", { n: `<b>${int.format(items.length)}</b>`, seen: `<b>${int.format(seen)}</b>` });
}

/** Kacheln oben: Summen und Quoten */
export function renderTotals(items) {
  const sum = totals(items);
  const $ = (id) => document.getElementById(id);
  const place = placeRate(sum);
  const hit = hitRate(sum);
  $("t-spawned").textContent = int.format(sum.spawned);
  $("t-correct").textContent = int.format(sum.correct);
  $("t-incorrect").textContent = int.format(sum.incorrect);
  $("t-place-rate").textContent = place === null ? "—" : pct.format(place);
  $("t-place-bar").style.width = `${place === null ? 0 : Math.min(100, Math.round(place * 100))}%`;
  $("t-hit-rate").textContent = hit === null ? "—" : pct.format(hit);
  const withD = items.filter((i) => typeof i.difficulty === "number");
  $("t-difficulty").textContent = withD.length
    ? dec.format(withD.reduce((s, i) => s + i.difficulty, 0) / withD.length) : "—";
}

/** Summenzeile unter der Tabelle */
export function renderFoot(tfoot, items) {
  const sum = totals(items);
  const tr = document.createElement("tr");
  const label = cell(t("stats.sum", { n: int.format(items.length) }));
  label.colSpan = 3;
  const withD = items.filter((i) => typeof i.difficulty === "number");
  tr.append(
    label,
    difficultyCell(withD.length ? Math.round(10 * withD.reduce((s, i) => s + i.difficulty, 0) / withD.length) / 10 : null),
    cell(int.format(sum.spawned), "num"),
    cell(int.format(sum.correct), "num"),
    cell(int.format(sum.incorrect), "num"),
    rateCell(placeRate(sum)),
    rateCell(hitRate(sum)),
    cell(""),
    cell(""),
  );
  tfoot.replaceChildren(tr);
}

export function renderJson(el, items) {
  el.textContent = JSON.stringify(items, null, 2);
}
