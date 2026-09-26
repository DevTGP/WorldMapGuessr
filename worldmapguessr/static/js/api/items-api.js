// Item-Tracking über die Server-API (/api/items). Der Client speichert nichts selbst,
// er meldet nur Ereignisse: spawned, correct, incorrect.

export class ItemTracker {
  constructor(apiBase = "/api") {
    this.base = apiBase.replace(/\/$/, "");
    this.uids = new Map(); // "kind:code" → uid
    this.difficulties = new Map(); // "kind:code" → Schwierigkeit 0…10
  }

  /** UIDs laden (optional nur eine Art). Schlägt das fehl, läuft das Spiel ohne Tracking weiter. */
  async load(kind) {
    try {
      const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
      const res = await fetch(`${this.base}/items${query}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { items } = await res.json();
      for (const i of items) {
        this.uids.set(`${i.kind}:${i.code}`, i.uid);
        this.difficulties.set(`${i.kind}:${i.code}`, i.difficulty);
      }
    } catch (err) {
      console.warn("Item-Tracking nicht verfügbar:", err.message);
    }
  }

  uid(kind, code) { return this.uids.get(`${kind}:${code}`); }
  /** Schwierigkeit 0…10 oder undefined (unbekannt) */
  difficulty(kind, code) { return this.difficulties.get(`${kind}:${code}`); }

  /** Ereignis melden (fire-and-forget; Fehler werden nur protokolliert) */
  record(kind, code, event) {
    const uid = this.uid(kind, code);
    if (!uid) return Promise.resolve(null);
    return fetch(`${this.base}/items/${uid}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event }),
      keepalive: true,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .catch((err) => {
        console.warn(`Tracking fehlgeschlagen (${code}, ${event}):`, err.message);
        return null;
      });
  }
}

/** Alle Items mit Zählern laden (für die Statistik-Seite) */
export async function fetchItems(apiBase = "/api", kind) {
  const query = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  const res = await fetch(`${apiBase.replace(/\/$/, "")}/items${query}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).items;
}
