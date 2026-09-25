// Statistik-Seite: Items vom Server laden, filtern, sortieren, anzeigen.

import { fetchItems } from "../api/items-api.js";
import { sortItems, NUMERIC_KEYS } from "./sort.js";
import { renderRows, renderSummary, renderJson } from "./render.js";

const $ = (id) => document.getElementById(id);
const state = { items: [], kind: "", query: "", key: "name", dir: 1 };

function visibleItems() {
  const q = state.query.trim().toLowerCase();
  const filtered = state.items.filter((i) =>
    (!state.kind || i.kind === state.kind) &&
    (!q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q) || i.uid.includes(q)));
  return sortItems(filtered, state.key, state.dir);
}

function render() {
  const items = visibleItems();
  renderRows($("rows"), items);
  renderSummary($("summary"), items);
  renderJson($("json"), items);
  $("empty").hidden = items.length > 0;
  document.querySelectorAll("th[data-key]").forEach((th) => {
    if (th.dataset.key === state.key) th.setAttribute("aria-sort", state.dir > 0 ? "ascending" : "descending");
    else th.removeAttribute("aria-sort");
  });
}

async function load() {
  $("summary").textContent = "Lade Daten …";
  try {
    state.items = await fetchItems(window.WMG?.apiBase);
    render();
  } catch (err) {
    $("summary").textContent = `Die Statistik konnte nicht geladen werden (${err.message}). Läuft der Server?`;
  }
}

// Sortieren per Klick (oder Enter) auf den Spaltenkopf; zweiter Klick kehrt die Richtung um
document.querySelectorAll("th[data-key]").forEach((th) => {
  th.tabIndex = 0;
  const sortBy = () => {
    const key = th.dataset.key;
    state.dir = state.key === key ? -state.dir : (NUMERIC_KEYS.has(key) ? -1 : 1);
    state.key = key;
    render();
  };
  th.addEventListener("click", sortBy);
  th.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sortBy(); } });
});

document.querySelectorAll(".segmented button").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".segmented button").forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
    state.kind = btn.dataset.kind;
    render();
  });
});

$("search").addEventListener("input", (e) => { state.query = e.target.value; render(); });
$("refresh").addEventListener("click", load);

// UID kopieren
$("rows").addEventListener("click", (e) => {
  const td = e.target.closest("td.uid");
  if (!td) return;
  navigator.clipboard?.writeText(td.dataset.uid).then(
    () => { td.textContent = "kopiert"; setTimeout(() => { td.textContent = td.dataset.uid.slice(0, 8) + "…"; }, 900); },
    () => {},
  );
});

load();
