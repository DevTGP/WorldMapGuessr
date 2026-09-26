// Items (Kontinente, Staaten, später Regionen) mit Detailstufen.
//
// Beim Start kommt eine grobe Stufe aller Items (items/i0.json, reicht für Icons und das Spiel bei
// kleinem Zoom). Wird ein Item bei stärkerem Zoom gebraucht (gehaltenes Item, Treffertest), lädt
// ensure() die passende feinere Stufe nach (items/i{z}/{kind}-{id}.json) und tauscht die Geometrie aus.

import { partsOf } from "./geometry.js";
import { RAD } from "./project.js";

export class ItemStore {
  /**
   * @param {string} base   URL-Präfix der Kartendaten (…/map)
   * @param {object} index  index.json
   */
  constructor(base, index) {
    this.base = base;
    this.version = index.version;
    this.levels = index.levels;
    this.startQ = index.itemStart.itemQ;
    this.features = index.items.map((it) => ({
      type: "Feature",
      id: it.id,
      key: it.key,
      kind: it.kind,
      group: it.group,
      properties: { name: it.name, region: it.region },
      geom: { anchor: it.anchor, area: it.area, centerLon: it.centerLon },
      geometry: { type: "MultiPolygon", coordinates: [] },
      parts: [],
      level: -1, // -1 = Startstufe
    }));
    this.byKey = new Map(this.features.map((f) => [f.key, f]));
    this.loading = new Map();
    this.onUpgrade = null; // (feature) → void
  }

  /** Startstufe aller Items übernehmen (i0.json) */
  setStart(raw) {
    for (const f of this.features) {
      const [q, polys] = raw[f.key] ?? [this.startQ, []];
      this._set(f, polys, q, -1);
    }
  }

  /** Stufe für eine Kartenskala (wie bei den Kacheln) */
  levelFor(scale) {
    const i = this.levels.findIndex((l) => l.sMax === null || scale <= l.sMax);
    return i < 0 ? this.levels.length - 1 : i;
  }

  /**
   * Feinere Stufe eines Items laden (falls noch nicht da). Stufe 0 der Kacheln entspricht hier der
   * Startstufe; nachgeladen wird ab Stufe 1.
   * @returns {Promise<object>} das Feature (mit der neuen Geometrie)
   */
  async ensure(f, z) {
    if (z < 1 || f.level >= z) return f;
    const id = `${f.key}@${z}`;
    if (!this.loading.has(id)) {
      const url = `${this.base}/items/i${z}/${f.kind}-${f.id}.json`;
      this.loading.set(id, fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((raw) => {
          if (f.level < z) {
            const [q, polys] = raw;
            this._set(f, polys, q, z);
            this.onUpgrade?.(f);
          }
          return f;
        })
        .catch((err) => { console.warn(`Item ${f.key} (Stufe ${z}) nicht geladen:`, err.message); return f; })
        .finally(() => this.loading.delete(id)));
    }
    return this.loading.get(id);
  }

  _set(f, encoded, q, level) {
    // entartete Ringe (< 4 Punkte) verwerfen – d3 erwartet geschlossene Ringe
    encoded = encoded.map((poly) => poly.filter((ints) => ints.length >= 8)).filter((poly) => poly.length);
    f.geometry = { type: "MultiPolygon", coordinates: decodePolys(encoded, q) };
    // Box je Polygon (Bogenmaß) – zum schnellen Aussortieren unsichtbarer Teile
    f.boxes = f.geometry.coordinates.map(([outer]) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of outer) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return [x0 * RAD, x1 * RAD, y0 * RAD, y1 * RAD];
    });
    f.parts = [...partsOf(f.geometry)];
    f.level = level;
  }
}

/** [[ring, …], …] mit Differenzen in 1/q Grad → GeoJSON-Koordinaten */
function decodePolys(polys, q) {
  return polys.map((poly) => poly.map((ints) => {
    const ring = new Array(ints.length / 2);
    let x = 0, y = 0;
    for (let i = 0; i < ints.length; i += 2) {
      x += ints[i]; y += ints[i + 1];
      ring[i / 2] = [x / q, y / q];
    }
    return ring;
  }));
}
