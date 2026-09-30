// Statistik-Seite: Items vom Server laden, filtern, sortieren, anzeigen.

import { fetchItems } from "../api/items-api.js";
import { sortItems, NUMERIC_KEYS } from "./sort.js";
import { renderRows, renderSummary, renderFoot, renderJson } from "./render.js";
import { LANG, t } from "../i18n/index.js";
import { Cosmos } from "../ui/cosmos.js";

const $ = (id) => document.getElementById(id);
const state = { items: [], raw: new Map(), kind: "", region: "", query: "", key: "name", dir: 1 };

function visibleItems() {
  const q = state.query.trim().toLowerCase();
  const filtered = state.items.filter((i) =>
    (!state.kind || i.kind === state.kind) &&
    (!state.region || i.region === state.region) &&
    (!q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q)));
  return sortItems(filtered, state.key, state.dir);
}

function render() {
  const items = visibleItems();
  renderRows($("rows"), items);
  renderSummary($("summary"), items);
  renderFoot($("foot"), items);
  renderJson($("json"), items.map((i) => state.raw.get(i.uid)));
  $("empty").hidden = items.length > 0;
  document.querySelectorAll("th[data-key]").forEach((th) => {
    if (th.dataset.key === state.key) th.setAttribute("aria-sort", state.dir > 0 ? "ascending" : "descending");
    else th.removeAttribute("aria-sort");
  });
}

async function load() {
  $("summary").textContent = t("stats.loading");
  try {
    const items = await fetchItems(window.WMG?.apiBase);
    state.raw = new Map(items.map((i) => [i.uid, i]));
    // Anzeige (Tabelle, Suche, Sortierung) in der Sprache der Seite; Rohdaten bleiben unverändert
    state.items = LANG === "en" ? items.map((i) => ({ ...i, name: i.nameEn ?? i.name })) : items;
    regionButtons();
    render();
  } catch (err) {
    $("summary").textContent = t("stats.failed", { error: err.message });
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

/** Auswahlgruppe: Klick auf einen Knopf setzt state[field] auf dessen data-Wert */
function segmented(group, field) {
  group.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b === btn)));
    state[field] = btn.dataset[field];
    render();
  });
}
segmented($("kind"), "kind");
segmented($("region"), "region");

/** Kontinent-Filter: ein Knopf je Kontinent-Item (Name in der Sprache der Seite), alphabetisch */
function regionButtons() {
  const group = $("region");
  const conts = state.items.filter((i) => i.kind === "continent")
    .sort((a, b) => a.name.localeCompare(b.name, LANG));
  if (!conts.some((c) => c.code === state.region)) state.region = "";
  group.replaceChildren(group.querySelector('[data-region=""]'), ...conts.map((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "radio");
    btn.dataset.region = c.code;
    btn.textContent = c.name;
    return btn;
  }));
  group.querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.region === state.region)));
}

$("search").addEventListener("input", (e) => { state.query = e.target.value; render(); });
$("refresh").addEventListener("click", load);

// Kosmos-Hintergrund wie auf der Karte (Einstellung „Kosmos“)
new Cosmos(document.body);
load();
