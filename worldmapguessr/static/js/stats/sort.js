// Sortierung der Statistik-Tabelle.

/** Trefferquote 0…1 oder null, wenn es noch keinen Einsetzversuch gab */
export function hitRate(item) {
  const attempts = item.correct + item.incorrect;
  return attempts ? item.correct / attempts : null;
}

/** Einsetzquote 0…1 (eingesetzt / spawns) oder null, wenn das Item nie gespawnt ist */
export function placeRate(item) {
  return item.spawned ? item.correct / item.spawned : null;
}

const collator = new Intl.Collator("de", { sensitivity: "base", numeric: true });

/** Wert, nach dem eine Spalte sortiert wird */
function value(item, key) {
  if (key === "rate") return hitRate(item);
  if (key === "placeRate") return placeRate(item);
  return item[key];
}

/**
 * @param {object[]} items
 * @param {string} key   Spalte
 * @param {1|-1} dir     1 = aufsteigend, -1 = absteigend
 * Leere Werte (z. B. keine Trefferquote) stehen immer unten; bei Gleichstand nach Name.
 */
export function sortItems(items, key, dir) {
  return items.slice().sort((a, b) => {
    const va = value(a, key);
    const vb = value(b, key);
    if (va == null && vb != null) return 1;
    if (vb == null && va != null) return -1;
    let c = 0;
    if (typeof va === "number" && typeof vb === "number") c = va - vb;
    else if (va != null) c = collator.compare(String(va), String(vb));
    return c * dir || collator.compare(a.name, b.name);
  });
}

/** Standard-Richtung beim ersten Klick: Zahlen absteigend, Text aufsteigend */
export const NUMERIC_KEYS = new Set(["spawned", "correct", "incorrect", "placeRate", "rate", "updated"]);
