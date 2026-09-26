// Item-Statistik über die Server-API (/api/items). Gezählt wird auf dem Server (jede Runde läuft dort).

/** Alle Items mit Zählern laden (für die Statistik-Seite) */
export async function fetchItems(apiBase = "/api", kind) {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/items${query}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).items;
}
