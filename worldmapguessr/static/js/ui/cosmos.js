// Kosmos-Hintergrund hinter der Karte (und durch Hauptmenü und Spielmenü sichtbar) sowie auf der Statistikseite: dunkler Raum,
// einige weiche Nebel und Sterne, von denen ein Teil ganz leicht funkelt. Einstellung „Kosmos“ (prefs.cosmos);
// aus: die Seite sieht aus wie ohne (Hintergrund --outside, der Renderer füllt das Außen wieder selbst).
//
// Nebel und ruhige Sterne werden je Fenstergröße einmal auf eine Zwischenfläche gezeichnet; je Bild kommen
// nur die funkelnden Sterne dazu (≈ 20 Bilder/s). Pausiert, solange der Tab verborgen ist; bei „weniger
// Bewegung“ (prefers-reduced-motion) steht das Bild still.

import { prefs } from "../settings/prefs.js";

/** Sterne je Megapixel (ruhig / funkelnd) */
const STARS_PER_MPX = 520;
const TWINKLE_SHARE = 0.22;
const FRAME_MS = 50;
/** Nebel: [x, y (Anteil des Bildes), Radius (Anteil der Diagonale), Farbe r,g,b, Deckkraft] */
const NEBULAE = [
  [0.12, 0.22, 0.38, [96, 70, 170], 0.20],
  [0.86, 0.78, 0.42, [40, 110, 160], 0.18],
  [0.72, 0.12, 0.26, [170, 70, 120], 0.10],
  [0.25, 0.88, 0.30, [60, 140, 150], 0.11],
  [0.52, 0.48, 0.55, [50, 60, 120], 0.10],
];
/** Sternfarben (leicht bläulich, weiß, warm) */
const TINTS = [[200, 215, 255], [255, 255, 255], [255, 236, 210], [220, 230, 255]];

export class Cosmos {
  /** @param {HTMLElement} stage  #stage (die Fläche kommt hinter die Karte) oder body der Statistikseite */
  constructor(stage) {
    this.canvas = document.createElement("canvas");
    this.canvas.id = "cosmos";
    this.canvas.setAttribute("aria-hidden", "true");
    stage.prepend(this.canvas);
    this.ctx = this.canvas.getContext("2d");
    this.base = document.createElement("canvas");
    this.stars = [];
    this.twinkling = [];
    this.still = matchMedia("(prefers-reduced-motion: reduce)");
    this._raf = 0;
    this._last = 0;
    addEventListener("resize", () => this._layout());
    document.addEventListener("visibilitychange", () => this._run());
    this.still.addEventListener?.("change", () => this._run());
    prefs.onChange((key) => { if (key === "cosmos") this._apply(); });
    this._apply();
  }

  get on() { return prefs.get("cosmos"); }

  _apply() {
    document.documentElement.classList.toggle("cosmos", this.on);
    this.canvas.hidden = !this.on;
    if (this.on) this._layout(); else this._run();
  }

  _layout() {
    if (!this.on) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = innerWidth, h = innerHeight;
    for (const c of [this.canvas, this.base]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    this.dpr = dpr; this.w = w; this.h = h;
    const rnd = mulberry32(0x5eed ^ Math.round(w) * 31 ^ Math.round(h));
    const n = Math.round((w * h) / 1e6 * STARS_PER_MPX);
    this.stars = Array.from({ length: n }, () => {
      const big = rnd() < 0.06;
      return {
        x: rnd() * w, y: rnd() * h,
        r: big ? 0.9 + rnd() * 0.6 : 0.35 + rnd() ** 2 * 0.6,
        a: 0.35 + rnd() * 0.6,
        tint: TINTS[Math.floor(rnd() * TINTS.length)],
        twinkle: rnd() < TWINKLE_SHARE,
        speed: 0.4 + rnd() * 1.4, phase: rnd() * Math.PI * 2,
      };
    });
    this.twinkling = this.stars.filter((s) => s.twinkle);
    this._paintBase();
    this._frame(performance.now());
    this._run();
  }

  /** Raum, Nebel und ruhige Sterne */
  _paintBase() {
    const { w, h } = this, g = this.base.getContext("2d");
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const bg = g.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.6);
    bg.addColorStop(0, "#0b1224");
    bg.addColorStop(1, "#03050b");
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const diag = Math.hypot(w, h);
    g.globalCompositeOperation = "lighter";
    for (const [x, y, r, [cr, cg, cb], a] of NEBULAE) {
      // jeder Nebel aus einigen versetzten Wolken – wirkt weniger wie ein Kreis
      for (let k = 0; k < 4; k++) {
        const ox = Math.sin(k * 2.1 + x * 9) * r * diag * 0.25, oy = Math.cos(k * 1.7 + y * 7) * r * diag * 0.18;
        const rr = r * diag * (0.55 + 0.15 * k);
        const grad = g.createRadialGradient(x * w + ox, y * h + oy, 0, x * w + ox, y * h + oy, rr);
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},${a / 1.5})`);
        grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},${a / 4})`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, w, h);
      }
    }
    g.globalCompositeOperation = "source-over";
    for (const s of this.stars) if (!s.twinkle) star(g, s, s.a);
  }

  _frame(now) {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.base, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const t = this.still.matches ? 0 : now / 1000;
    for (const s of this.twinkling) {
      // leichtes Funkeln: Helligkeit schwankt um ±35 %
      const k = 0.65 + 0.35 * Math.sin(t * s.speed + s.phase);
      star(ctx, s, s.a * k);
    }
  }

  _run() {
    const active = this.on && !document.hidden && !this.still.matches;
    if (!active) { cancelAnimationFrame(this._raf); this._raf = 0; return; }
    if (this._raf) return;
    const loop = (now) => {
      this._raf = requestAnimationFrame(loop);
      if (now - this._last < FRAME_MS) return;
      this._last = now;
      this._frame(now);
    };
    this._raf = requestAnimationFrame(loop);
  }
}

function star(g, s, alpha) {
  const [r, gg, b] = s.tint;
  g.fillStyle = `rgba(${r},${gg},${b},${alpha.toFixed(3)})`;
  if (s.r < 0.8) {
    g.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    return;
  }
  // größere Sterne mit weichem Hof
  const halo = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3.2);
  halo.addColorStop(0, `rgba(${r},${gg},${b},${alpha.toFixed(3)})`);
  halo.addColorStop(0.35, `rgba(${r},${gg},${b},${(alpha * 0.35).toFixed(3)})`);
  halo.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = halo;
  g.fillRect(s.x - s.r * 3.2, s.y - s.r * 3.2, s.r * 6.4, s.r * 6.4);
}

/** Kleiner, fester Zufallsgenerator – dieselbe Fenstergröße ergibt denselben Himmel */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
