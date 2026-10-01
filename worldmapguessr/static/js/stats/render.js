// Darstellung: Tabellenzeilen, Summen, Zusammenfassung, JSON-Ansicht.

import { hitRate, placeRate } from "./sort.js";
import { locale, t } from "../i18n/index.js";

const KIND_LABEL = { continent: t("stats.kind.continent"), country: t("stats.kind.country"), state: t("stats.kind.state") };
const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat(locale);

function cell(text, className) {
  const td = document.createElement("td");
  if (className) td.className = className;
  if (text instanceof Node) td.append(text);
  else td.textContent = text;
  return td;
}

function rateCell(r, extra = "") {
  if (r === null) return cell("—", `num muted ${extra}`.trim());
  const wrap = document.createElement("span");
  wrap.className = "rate";
  const bar = document.createElement("span");
  bar.className = r < 0.5 ? "bar low" : "bar";
  bar.innerHTML = `<i style="width:${Math.min(100, Math.round(r * 100))}%"></i>`;
  wrap.append(pct.format(r), bar);
  return cell(wrap, `num ${extra}`.trim());
}

const dec = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Ø eingesetzte Items der Lobby, bis das Item sitzt bzw. verloren geht (Anzahl gemessener Spawns im Titel) */
function durationCell(d, n, extra = "") {
  if (d == null) return cell("—", `num muted ${extra}`.trim());
  const td = cell(dec.format(d), `num ${extra}`.trim());
  td.title = t("stats.durationTitle", { n });
  return td;
}

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
    tr.append(
      cell(it.name),
      cell(kind, "col-kind"),
      cell(it.code, "mono col-code"),
      difficultyCell(it.difficulty),
      cell(int.format(it.spawned), "num"),
      cell(int.format(it.correct), "num"),
      cell(int.format(it.incorrect), "num col-incorrect"),
      rateCell(placeRate(it), "col-place"),
      rateCell(hitRate(it)),
      durationCell(it.duration, it.waitedCount, "col-duration"),
    );
    return tr;
  }));
}

/** Summen über die (gefilterten) Items */
export function totals(items) {
  const sum = (k) => items.reduce((s, i) => s + (i[k] ?? 0), 0);
  const waitedCount = sum("waitedCount");
  return {
    spawned: sum("spawned"), correct: sum("correct"), incorrect: sum("incorrect"), waitedCount,
    duration: waitedCount ? sum("waited") / waitedCount : null,
  };
}

export function renderSummary(el, items) {
  const seen = items.filter((i) => i.spawned > 0).length;
  el.innerHTML = t("stats.summary", { n: `<b>${int.format(items.length)}</b>`, seen: `<b>${int.format(seen)}</b>` });
}

/** Summenzeile unter der Tabelle */
export function renderFoot(tfoot, items) {
  const sum = totals(items);
  const tr = document.createElement("tr");
  // Name, Art, Code als eigene Zellen statt colSpan, damit ausgeblendete Spalten (schmale Fenster) nichts verschieben
  const label = cell(t("stats.sum", { n: int.format(items.length) }));
  const withD = items.filter((i) => typeof i.difficulty === "number");
  tr.append(
    label,
    cell("", "col-kind"),
    cell("", "col-code"),
    difficultyCell(withD.length ? Math.round(10 * withD.reduce((s, i) => s + i.difficulty, 0) / withD.length) / 10 : null),
    cell(int.format(sum.spawned), "num"),
    cell(int.format(sum.correct), "num"),
    cell(int.format(sum.incorrect), "num col-incorrect"),
    rateCell(placeRate(sum), "col-place"),
    rateCell(hitRate(sum)),
    durationCell(sum.duration, sum.waitedCount, "col-duration"),
  );
  tfoot.replaceChildren(tr);
}

export function renderJson(el, items) {
  el.textContent = JSON.stringify(items, null, 2);
}
