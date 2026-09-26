// Kacheln der Karte: laden, entpacken, für den sichtbaren Ausschnitt auswählen.
//
// Stufen (LOD): Stufe 0 = Welt in 8 Kacheln à 90°, jede weitere halbiert die Kachelseite und enthält
// feinere Umrisse; die feinste Stufe hat alle Punkte der Quelle (Natural Earth 1:10m). Welche Stufe
// gezeichnet wird, hängt von der Kartenskala ab (index.levels[].sMax). Fehlt eine Kachel noch, wird bis
// zum Eintreffen die nächstgröbere vorhandene gezeichnet – die Karte bleibt immer bedienbar.

import { RAD, boxTest, prepare } from "./project.js";

const MAX_PARALLEL = 6;
const MAX_POINTS = 2_500_000; // entpackte Punkte im Speicher, darüber werden alte Kacheln verworfen

export class TileStore {
  /**
   * @param {string} base   URL-Präfix der Kartendaten (…/map)
   * @param {object} index  index.json
   * @param {() => void} onLoad  eine Kachel ist angekommen (neu zeichnen)
   */
  constructor(base, index, onLoad) {
    this.base = base;
    this.version = index.version;
    this.levels = index.levels;
    this.onLoad = onLoad;
    this.exists = index.levels.map((l) => new Set(index.tiles[l.z] ?? []));
    this.tiles = new Map();     // "z/x_y" → entpackte Kachel
    this.pending = new Map();   // "z/x_y" → Promise
    this.queue = [];
    this.active = 0;
    this.points = 0;
    this.stamp = 0;
    // Mittelpunkt und Radius je vorhandener Kachel (für den Sichtbarkeitstest)
    this.geo = this.levels.map((l) => new Map([...this.exists[l.z]].map((k) => [k, tileBounds(l, k)])));
  }

  /** Stufe für eine Kartenskala (Pixel pro Bogenmaß) */
  levelFor(scale) {
    const i = this.levels.findIndex((l) => l.sMax === null || scale <= l.sMax);
    return i < 0 ? this.levels.length - 1 : i;
  }

  /** Kachel aus Rohdaten (JSON) übernehmen – auch für die Startkacheln */
  add(z, key, raw) {
    const id = `${z}/${key}`;
    if (this.tiles.has(id)) return;
    const t = decode(this.levels[z], key, raw);
    t.used = ++this.stamp;
    this.tiles.set(id, t);
    this.points += t.points;
    this._evict();
  }

  /** Alle Kacheln einer Stufe laden (Start: Stufe 0), mit Fortschritt in Bytes */
  async loadLevel(z, onBytes) {
    await Promise.all([...this.exists[z]].map(async (key) => {
      const res = await fetch(this.url(z, key));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      onBytes?.(text.length);
      this.add(z, key, JSON.parse(text));
    }));
  }

  url(z, key) { return `${this.base}/tiles/z${z}/${key}.json`; }

  /**
   * Kacheln zum Zeichnen: die passende Stufe für den Ausschnitt; fehlende werden angefordert und bis
   * dahin durch die nächstgröbere geladene ersetzt (ohne Überlappung).
   * @param {number} z  Zielstufe
   * @param {d3.GeoProjection} projection
   * @param {{w: number, h: number}} size
   */
  select(z, projection, size) {
    const keys = this.visible(z, projection, size);
    const chosen = new Map();
    for (const key of keys) {
      let id = `${z}/${key}`;
      let t = this.tiles.get(id);
      if (!t) {
        this.request(z, key);
        // nächstgröbere geladene Kachel
        let [x, y] = key.split("_").map(Number);
        for (let zz = z - 1; zz >= 0 && !t; zz--) {
          x >>= 1; y >>= 1;
          id = `${zz}/${x}_${y}`;
          t = this.tiles.get(id);
        }
      }
      if (t) chosen.set(id, t);
    }
    // Kacheln weglassen, die schon durch eine gröbere (Ersatz-)Kachel abgedeckt sind
    const out = [];
    for (const t of chosen.values()) {
      let covered = false;
      let { x, y } = t;
      for (let zz = t.z - 1; zz >= 0 && !covered; zz--) {
        x >>= 1; y >>= 1;
        covered = chosen.has(`${zz}/${x}_${y}`);
      }
      if (!covered) { t.used = ++this.stamp; out.push(t); }
    }
    return out;
  }

  /** Vorhandene Kacheln der Stufe z, die im Ausschnitt liegen */
  visible(z, projection, size) {
    const inView = boxTest(projection, [[0, 0], [size.w, size.h]]);
    const out = [];
    for (const [key, g] of this.geo[z]) if (inView(g.lon0, g.lon1, g.lat0, g.lat1)) out.push(key);
    return out;
  }

  request(z, key) {
    const id = `${z}/${key}`;
    if (this.tiles.has(id) || this.pending.has(id)) return;
    this.pending.set(id, null);
    this.queue.push([z, key]);
    this._pump();
  }

  _pump() {
    while (this.active < MAX_PARALLEL && this.queue.length) {
      // neueste Anforderung zuerst: das ist, wo der Nutzer gerade hinschaut
      const [z, key] = this.queue.pop();
      this.active++;
      fetch(this.url(z, key))
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((raw) => { this.add(z, key, raw); this.onLoad(); })
        .catch((err) => console.warn(`Kachel ${z}/${key} nicht geladen:`, err.message))
        .finally(() => {
          this.pending.delete(`${z}/${key}`);
          this.active--;
          this._pump();
        });
    }
  }

  _evict() {
    if (this.points <= MAX_POINTS) return;
    const old = [...this.tiles.entries()].filter(([, t]) => t.z > 0).sort((a, b) => a[1].used - b[1].used);
    for (const [id, t] of old) {
      if (this.points <= MAX_POINTS * 0.8) break;
      this.tiles.delete(id);
      this.points -= t.points;
    }
  }
}

/** Kachel entpacken: Differenzen → Längen/Breiten → vorbereitete Projektionswerte */
function decode(level, key, raw) {
  const [x, y] = key.split("_").map(Number);
  const size = level.tile, q = level.q, e = level.overlap ?? 0;
  const lon0 = -180 + x * size, lat0 = -90 + y * size;
  let points = 0;
  const pts = (ints) => {
    const out = new Float64Array(ints.length);
    let qx = 0, qy = 0;
    for (let i = 0; i < ints.length; i += 2) {
      qx += ints[i]; qy += ints[i + 1];
      out[i] = lon0 + (qx / q) * size;
      out[i + 1] = lat0 + (qy / q) * size;
    }
    points += ints.length / 2;
    return prepare(out);
  };
  return {
    z: level.z, x, y, key,
    // Kacheln überlappen um e (siehe build/2-tiles.mjs); für die Schnittlinie zählt der erweiterte Bereich
    lon0: (lon0 - e) * RAD, lon1: (lon0 + size + e) * RAD,
    fills: raw.f.map(([cell, ...rings]) => ({ cell, rings: rings.map(pts) })),
    lines: raw.l.map(([a, b, ints]) => ({ a, b, pts: pts(ints) })),
    get points() { return points; },
  };
}

/** Grenzen einer Kachel in Bogenmaß */
function tileBounds(level, key) {
  const [x, y] = key.split("_").map(Number);
  const t = level.tile;
  return { lon0: (-180 + x * t) * RAD, lon1: (-180 + (x + 1) * t) * RAD, lat0: (-90 + y * t) * RAD, lat1: (-90 + (y + 1) * t) * RAD };
}
