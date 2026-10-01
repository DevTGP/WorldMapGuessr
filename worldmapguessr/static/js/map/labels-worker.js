// Worker: Kandidaten für die Namen auf der Karte (labels-core.js) – außerhalb des Hauptthreads, damit das
// Auslegen vieler Namen auf einmal die Seite nicht anhält. Rastert auf einer OffscreenCanvas und misst den
// Text mit derselben Schrift wie die Seite (Cinzel, URLs aus deren @font-face-Regeln).
//
// Nachrichten (map/labels.js):
//   {type: "init", fonts: [{family, url, weight, unicodeRange}], d3: URL des d3-Skripts der Seite (ohne Bündel)}
//   {type: "geometry", key, geometry}   Umriss eines Items (einmal je Detailstufe)
//   {type: "candidates", key, gen, kind, text, projection, neighbours: [key]}  → {key, gen, cands}
// Fehler → {type: "error", message}; die Seite rechnet dann selbst weiter.

/* global __BUNDLED__ */
const geometries = new Map();
let core = null;
let fontsReady = null;
let canvas = null, measureCtx = null;

const env = {
  canvas(w, h) {
    if (!canvas) canvas = new OffscreenCanvas(w, h);
    if (canvas.width < w) canvas.width = w;
    if (canvas.height < h) canvas.height = h;
    return canvas;
  },
  measure(font, text) {
    measureCtx ??= new OffscreenCanvas(1, 1).getContext("2d");
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  },
};

let ready = null;

/** Ohne Bündel (Entwicklung) gibt es im Worker kein globales d3: dasselbe Skript wie die Seite laden (UMD) */
async function load(d3Url) {
  if (typeof __BUNDLED__ === "undefined" && !self.d3) {
    if (!d3Url) throw new Error("d3 fehlt");
    const code = await (await fetch(d3Url)).text();
    (0, eval)(code); // setzt self.d3
  }
  core = await import("./labels-core.js");
}

let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  // der Reihe nach: Umrisse kommen vor den Anfragen, die sie brauchen
  queue = queue.then(() => handle(data)).catch((err) => self.postMessage({ type: "error", message: String(err?.message ?? err) }));
};

async function handle(msg) {
  if (msg.type === "init") {
    ready = load(msg.d3);
    fontsReady = Promise.all(msg.fonts.map(async (f) => {
      const face = new FontFace(f.family, `url(${f.url})`, { weight: f.weight, unicodeRange: f.unicodeRange });
      self.fonts.add(face);
      await face.load().catch(() => {});
    }));
    return;
  }
  if (msg.type === "geometry") {
    geometries.set(msg.key, msg.geometry);
    return;
  }
  if (msg.type === "candidates") {
    await ready;
    await fontsReady;
    const item = { kind: msg.kind, text: msg.text, geometry: geometries.get(msg.key) };
    const neighbours = msg.neighbours.map((k) => geometries.get(k)).filter(Boolean);
    const cands = item.geometry ? core.candidates(item, neighbours, msg.projection, env) : [];
    self.postMessage({ type: "candidates", key: msg.key, gen: msg.gen, cands });
  }
}
