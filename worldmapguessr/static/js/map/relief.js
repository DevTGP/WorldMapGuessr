// Geländeschummerung (Relief, build/4-relief.py): Graustufen-Kacheln in gleichabständiger Projektion
// (128 = neutral), über die Landfarben gelegt mit „hard-light“ – Hänge werden heller bzw. dunkler, die
// Einsetz-Stufen bleiben erkennbar. Einstellung „Relief“: aus / leicht / stark (settings/prefs.js).
//
// Die Karte ist pseudozylindrisch (x = λ · fx(φ), y = Y(φ)): Auf jeder Breite ist x linear in der Länge. Eine
// Rasterkachel lässt sich daher in waagerechten Streifen zeichnen – jeder Streifen ist ein drawImage mit
// eigener Breite. Die Streifen landen erst auf einer grauen Zwischenfläche, die dann einmal überblendet wird
// (keine doppelt überblendeten Kanten zwischen Streifen).

import { RAD, TAU, boxTest, fxOf, viewOf, wrapOffset, yOf } from "./project.js";

const STRIP_PX = 3;          // Streifenhöhe im Stillstand
const STRIP_MOVING_PX = 8;   // beim Ziehen/Zoomen gröber
const MAX_STRIPS = 400;      // je Kachel
const RES_FACTOR = 0.8;      // Quellpixel je Bildschirmpixel, ab dem eine Stufe reicht
const MAX_PARALLEL = 4;

export class ReliefLayer {
  /**
   * @param {string} base  URL-Präfix der Kartendaten
   * @param {{tile: number, levels: {r: number, cols: number, rows: number, tiles: string[]}[]}} info  index.relief
   * @param {() => void} onLoad  Kachel angekommen (neu zeichnen)
   */
  constructor(base, info, onLoad) {
    this.base = base;
    this.tile = info.tile;
    this.levels = info.levels;
    this.exists = info.levels.map((l) => new Set(l.tiles));
    this.onLoad = onLoad;
    this.images = new Map();   // "r/x_y" → HTMLImageElement (geladen)
    this.pending = new Set();
    this.queue = [];
    this.active = 0;
    this.canvas = document.createElement("canvas");
    this.ctx = this.canvas.getContext("2d");
  }

  /** Feinste nötige Stufe für eine Kartenskala (px/rad) */
  levelFor(scale) {
    for (const l of this.levels) if ((l.cols * this.tile) / TAU >= scale * RES_FACTOR) return l.r;
    return this.levels.length - 1;
  }

  /**
   * Relief über die bereits gezeichneten Landflächen legen
   * @param {CanvasRenderingContext2D} ctx  Karten-Kontext (Transformation: devicePixelRatio)
   * @param {d3.GeoProjection} projection
   * @param {{w: number, h: number}} size  in CSS-Pixeln
   * @param {[string, number][]} passes  Überblendungen: [globalCompositeOperation, Deckkraft] (map/schemes.js)
   */
  draw(ctx, projection, { w, h }, passes, moving) {
    if (!passes?.length) return;
    const c = this.canvas;
    const v = viewOf(projection);
    const strip = moving ? STRIP_MOVING_PX : STRIP_PX;
    const tiles = this.visible(projection, { w, h });
    // Zwischenfläche wiederverwenden, solange Ansicht und Bilder gleich sind (z. B. während der Aufhell-
    // Animation nach dem Einsetzen oder wenn Kacheln der Karte nachkommen)
    const key = [v.s, v.tx, v.ty, v.rot, w, h, strip, ...tiles.map((t) => t.src.img.src + t.src.sx + t.src.sy)].join("|");
    if (key !== this._key) {
      this._key = key;
      if (c.width !== Math.ceil(w) || c.height !== Math.ceil(h)) {
        c.width = Math.ceil(w);
        c.height = Math.ceil(h);
      }
      const o = this.ctx;
      o.globalCompositeOperation = "source-over";
      o.fillStyle = "rgb(128,128,128)";
      o.fillRect(0, 0, c.width, c.height);
      o.imageSmoothingEnabled = true;
      for (const t of tiles) this._drawTile(o, v, t.src, t.lon0, t.lat0, t.size, strip);
    }
    ctx.save();
    // nur auf der Erde überblenden – außerhalb kann die Fläche durchsichtig sein (Kosmos)
    ctx.beginPath();
    d3.geoPath(projection, ctx)({ type: "Sphere" });
    ctx.clip();
    for (const [mode, alpha] of passes) {
      ctx.globalCompositeOperation = mode;
      ctx.globalAlpha = alpha;
      ctx.drawImage(c, 0, 0, w, h);
    }
    ctx.restore();
  }

  /**
   * Sichtbare Kacheln der passenden Stufe mit ihrem Bild (geladen oder Ausschnitt einer gröberen Stufe);
   * fehlende werden angefordert. Auch für den WebGL-Renderer.
   * @returns {{src: {img: HTMLImageElement, sx: number, sy: number, sw: number}, lon0: number, lat0: number,
   *            size: number}[]}  lon0/lat0/size in Grad
   */
  visible(projection, { w, h }) {
    const r = this.levelFor(projection.scale());
    const lvl = this.levels[r];
    const size = 360 / lvl.cols; // Grad je Kachel
    const inView = boxTest(projection, [[0, 0], [w, h]]);
    const out = [];
    for (let x = 0; x < lvl.cols; x++) {
      for (let y = 0; y < lvl.rows; y++) {
        const lon0 = -180 + x * size, lat0 = -90 + y * size;
        if (!inView(lon0 * RAD, (lon0 + size) * RAD, lat0 * RAD, (lat0 + size) * RAD)) continue;
        const src = this._source(r, x, y);
        if (src) out.push({ src, lon0, lat0, size });
      }
    }
    return out;
  }

  /**
   * Bild für die Kachel (r, x, y): geladen, sonst nächstgröbere geladene Stufe (Ausschnitt daraus).
   * Fehlt die Kachel in den Daten (reines Meer), gibt es nichts zu zeichnen.
   * @returns {{img: HTMLImageElement, sx: number, sy: number, sw: number}|null}  sx/sy/sw in Quellpixeln
   */
  _source(r, x, y) {
    if (!this.exists[r].has(`${x}_${y}`)) return null;
    this._request(r, x, y);
    for (let rr = r, xx = x, yy = y, span = 1; rr >= 0; rr--, span *= 2) {
      const img = this.images.get(`${rr}/${xx}_${yy}`);
      if (img) {
        const sub = this.tile / span;
        const rows = this.levels[rr].rows;
        // Position der Zielkachel innerhalb der gröberen (y von Süden gezählt, Bildzeilen von Norden)
        const ox = (x - xx * span) * sub, oyFromSouth = (y - yy * span) * sub;
        return { img, sx: ox, sy: this.tile - oyFromSouth - sub, sw: sub, rows };
      }
      xx >>= 1; yy >>= 1;
    }
    return null;
  }

  _drawTile(o, { s, tx, ty, rot }, { img, sx, sy, sw }, lon0, lat0, size, strip) {
    const phiS = lat0 * RAD, phiN = (lat0 + size) * RAD;
    const hPx = s * (yOf(phiN) - yOf(phiS));
    const n = Math.max(1, Math.min(MAX_STRIPS, Math.ceil(hPx / strip)));
    const lamA = lon0 * RAD, lamB = (lon0 + size) * RAD;
    const off = wrapOffset(lamA, rot);
    const la = lamA + rot + off, lb = lamB + rot + off;
    // Teil jenseits der Schnittlinie (λ' > π) um 2π zurück
    const cut = lb > Math.PI ? (Math.PI - la) / (lb - la) : 1;
    for (let i = 0; i < n; i++) {
      const p0 = phiN - ((phiN - phiS) * i) / n, p1 = phiN - ((phiN - phiS) * (i + 1)) / n; // Norden → Süden
      const y0 = ty - s * yOf(p0), y1 = ty - s * yOf(p1);
      const fx = fxOf((p0 + p1) / 2);
      const srcY = sy + (sw * i) / n, srcH = sw / n;
      const segment = (t0, t1, l0, l1) => {
        if (t1 <= t0) return;
        const x0 = tx + s * l0 * fx, x1 = tx + s * l1 * fx;
        // leicht überlappen (deckend auf der Zwischenfläche), damit keine Haarlinien bleiben
        o.drawImage(img, sx + sw * t0, srcY, sw * (t1 - t0), srcH, x0, y0 - 0.25, x1 - x0 + 0.5, y1 - y0 + 0.5);
      };
      segment(0, cut, la, Math.min(lb, Math.PI));
      if (cut < 1) segment(cut, 1, -Math.PI, lb - TAU);
    }
  }

  _request(r, x, y) {
    const id = `${r}/${x}_${y}`;
    if (this.images.has(id) || this.pending.has(id)) return;
    this.pending.add(id);
    this.queue.push([r, x, y]);
    this._pump();
  }

  _pump() {
    while (this.active < MAX_PARALLEL && this.queue.length) {
      const [r, x, y] = this.queue.pop(); // neueste zuerst
      const id = `${r}/${x}_${y}`;
      this.active++;
      const img = new Image();
      img.decoding = "async";
      const done = () => { this.pending.delete(id); this.active--; this._pump(); };
      img.onload = () => { this.images.set(id, img); done(); this.onLoad(); };
      img.onerror = () => { console.warn(`Relief ${id} nicht geladen`); done(); };
      img.src = `${this.base}/relief/r${r}/${x}_${y}.jpg`;
    }
  }
}
