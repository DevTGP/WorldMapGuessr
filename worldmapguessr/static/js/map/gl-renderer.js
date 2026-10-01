// WebGL-2-Renderer: zeichnet dasselbe Bild wie der Canvas-Renderer (renderer.js), rechnet aber auf der GPU.
//
// Die Projektion ist pseudozylindrisch (x = tx + s · (λ + Drehung) · fx(φ), y = ty − s · Y(φ)) und fx, Y sind
// geschlossene Formeln – der Vertex-Shader projiziert jeden Punkt selbst. Die Kacheln liegen einmal als
// (λ, φ) im Grafikspeicher (Flächen fertig trianguliert, build/5-binary.mjs); Drehen, Zoomen und Verschieben
// ändern nur ein paar Uniforms. Die Kosten je Bild hängen damit kaum noch von Punktzahl und Pixeldichte ab.
//
// Ablauf je Bild:
//   1. Schein um die Erde (Kosmos), Meer – die Erdform kommt dabei in den Stencil-Puffer: Alles Weitere wird
//      auf die Erde beschnitten. Kacheln an der Schnittlinie (Längengrad gegenüber der Mitte) werden einfach
//      zweimal gezeichnet (um 2π versetzt); der Stencil schneidet ab, was über den Rand hinausragt.
//   2. Gradnetz, Schelf-Saum (Küsten, breit), Landflächen (Farbe je Zelle aus einer Textur, map/schemes.js).
//   3. Relief: Das Bild bis hierher wird in eine Textur übernommen; jede Rasterkachel wird als Gitter über die
//      Erde gelegt und mischt ihren Grauwert mit „hard-light“/„soft-light“ wie das Canvas (Formeln der
//      W3C-Compositing-Spezifikation).
//   4. Seen und Flüsse, Grenzen (Bundesland gestrichelt, Staat, Kontinent), Küsten.
//   5. Ringe um Kleinststaaten und Namen auf einer 2D-Fläche darüber (renderer.js, labels.js).
//
// Linien sind Kapseln je Strecke (Instanzen; runde Enden und Ecken, Kantenglättung im Fragment-Shader). Jede
// Linienart entsteht zuerst als Deckung in einer eigenen Textur (MAX: überlappende Kapseln zählen einmal – bei
// kleinem Zoom liegen viele Strecken im selben Pixel) und wird dann einmal in ihrer Farbe überblendet, wie ein
// Canvas-Strich über den ganzen Pfad. Welche
// Grenze zu welcher Art gehört (sichtbar erst, wenn eine Seite eingesetzt ist), entscheidet der Shader aus
// einer Textur mit Kontinent, Staat, Bundesland und Einsetz-Stand je Zelle.

import { RendererBase, BORDER_PX, COAST_PX, GLOW, GLOW_RGB, SHELF_PX, STATE_DASH } from "./renderer.js";
import { TAU, viewOf, wrapOffset } from "./project.js";
import { projectionId } from "./projections.js";
import { PROJECTION_DEFS } from "./projection-defs.js";
import { prefs } from "../settings/prefs.js";

const RAD = Math.PI / 180;
/** Linienarten (Shader: u_kind) */
const KIND = { all: 0, coast: 1, river: 5, borders: 6 };
const NONE = [0, 0, 0, 0];
/** Relief: Zeilen je Rasterkachel höchstens / Zielhöhe einer Zeile (px) */
const RELIEF_ROWS_MAX = 256, RELIEF_ROW_PX = 4;
/** So viele Bilder darf eine Kachel ungenutzt bleiben, bevor ihre Puffer frei werden (wenn es zu viele sind) */
const TILE_IDLE_FRAMES = 300, TILE_BUFFERS_MAX = 900;

const PROJECT_GLSL = `
uniform int u_proj;      // 0 Natural Earth, 1 Equal Earth (map/projection-defs.js)
uniform vec4 u_view;     // s, tx, ty, Verschiebung (Drehung + 2π-Vielfaches) – CSS-Pixel
uniform vec2 u_size;     // Fläche in CSS-Pixeln
const float M = 0.8660254037844386;
float fxOf(float phi) {
  if (u_proj == 0) {
    float p2 = phi * phi, p4 = p2 * p2;
    return 0.8707 - 0.131979 * p2 + p4 * (-0.013791 + p4 * (0.003971 * p2 - 0.001529 * p4));
  }
  float l = asin(M * sin(phi)), l2 = l * l, l6 = l2 * l2 * l2;
  return cos(l) / (M * (1.340264 + 3.0 * -0.081106 * l2 + l6 * (7.0 * 0.000893 + 9.0 * 0.003796 * l2)));
}
float yOf(float phi) {
  if (u_proj == 0) {
    float p2 = phi * phi, p4 = p2 * p2;
    return phi * (1.007226 + p2 * (0.015085 + p4 * (-0.044475 + 0.028874 * p2 - 0.005916 * p4)));
  }
  float l = asin(M * sin(phi)), l2 = l * l, l6 = l2 * l2 * l2;
  return l * (1.340264 + -0.081106 * l2 + l6 * (0.000893 + 0.003796 * l2));
}
vec2 project(vec2 ll) {
  return vec2(u_view.y + u_view.x * (ll.x + u_view.w) * fxOf(ll.y), u_view.z - u_view.x * yOf(ll.y));
}
vec4 toClip(vec2 p) { return vec4(p.x / u_size.x * 2.0 - 1.0, 1.0 - p.y / u_size.y * 2.0, 0.0, 1.0); }
const vec4 NOWHERE = vec4(2.0, 2.0, 2.0, 1.0);
`;

const FILL_VS = `#version 300 es
${PROJECT_GLSL}
in vec2 a_pos;
in float a_attr;
uniform int u_mode;            // 0 Land (Farbe je Zelle), 1 einfarbig, 2 einfarbig ab Kartenskala a_attr (Seen)
uniform sampler2D u_cellColors;
uniform vec4 u_color;
flat out vec4 v_color;
void main() {
  if (u_mode == 2 && a_attr > u_view.x) { gl_Position = NOWHERE; return; }
  v_color = u_mode == 0 ? texelFetch(u_cellColors, ivec2(int(a_attr + 0.5), 0), 0) : u_color;
  gl_Position = toClip(project(a_pos));
}`;

const FILL_FS = `#version 300 es
precision highp float;
flat in vec4 v_color;
out vec4 o;
void main() { o = v_color; }`;

const LINE_VS = `#version 300 es
${PROJECT_GLSL}
in vec4 a_seg;    // λ0, φ0, λ1, φ1
in vec2 a_ab;     // Zellen a, b (b < 0: Küste) bzw. sMin, 0 (Flüsse)
in vec2 a_dist;   // Strecke ab Linienanfang und Länge dieser Strecke (Karteneinheiten, ungedreht)
in float a_ext;   // Ausdehnung der ganzen Linie (Karteneinheiten): unter MIN_SIZE_PX wird sie nicht gezeichnet
// Art: 0 alle Strecken, Breiten je Kanal (Schein: vier Ringe) · 1 nur Küsten (Kanal R) · 5 Flüsse (R, Breite nach
// sMin) · 6 Grenzen und Küsten nach Klasse: Bundesland R, Staat G, Kontinent B, Küste A
uniform int u_kind;
uniform vec4 u_widths;  // CSS-Pixel je Kanal (0: Kanal aus)
uniform float u_dpr;
uniform highp usampler2D u_cellInfo;  // je Zelle: Kontinent, Staat + 1, Bundesland + 1, eingesetzt (Bits)
out vec2 v_local;        // Gerätepixel: längs ab p0, quer
flat out vec4 v_hw, v_cover;
flat out float v_len, v_dist0, v_dlen;

int category() {
  if (a_ab.y < 0.0) return 1;
  uvec4 A = texelFetch(u_cellInfo, ivec2(int(a_ab.x + 0.5), 0), 0);
  uvec4 B = texelFetch(u_cellInfo, ivec2(int(a_ab.y + 0.5), 0), 0);
  uint f = A.w | B.w;
  if (A.x != B.x && (f & 1u) != 0u) return 2;
  if (A.y != B.y && (f & 6u) != 0u) return 3;
  if (A.z != B.z && (f & 4u) != 0u) return 4;
  return 0;
}

void main() {
  vec4 w = u_widths;
  if (a_ext * u_view.x < 0.5) { gl_Position = NOWHERE; return; } // wie renderer.js MIN_SIZE_PX
  if (u_kind == 5) {
    float sMin = a_ab.x;
    if (sMin > u_view.x) { gl_Position = NOWHERE; return; }
    float t = clamp(log2(u_view.x / sMin) / 3.0, 0.0, 1.0);
    w = vec4(floor((0.45 + (sMin < 400.0 ? 0.35 : 0.0) + t * 0.9) * 4.0 + 0.5) / 4.0, 0.0, 0.0, 0.0); // water.js
  } else if (u_kind == 1) {
    if (a_ab.y >= 0.0) { gl_Position = NOWHERE; return; }
    w = vec4(u_widths.x, 0.0, 0.0, 0.0);
  } else if (u_kind == 6) {
    int c = category();
    if (c == 0) { gl_Position = NOWHERE; return; }
    w = c == 4 ? vec4(u_widths.x, 0.0, 0.0, 0.0) : c == 3 ? vec4(0.0, u_widths.y, 0.0, 0.0)
      : c == 2 ? vec4(0.0, 0.0, u_widths.z, 0.0) : vec4(0.0, 0.0, 0.0, u_widths.w);
  }
  vec2 p0 = project(a_seg.xy) * u_dpr, p1 = project(a_seg.zw) * u_dpr;
  vec2 d = p1 - p0;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0), nrm = vec2(-dir.y, dir.x);
  vec4 wd = w * u_dpr;
  // dünne Linien: 1 Gerätepixel breit, dafür blasser (v_cover); Kanal aus: Breite 0
  v_hw = mix(vec4(0.0), max(wd, vec4(1.0)) * 0.5, step(vec4(1e-6), wd));
  v_cover = min(wd, vec4(1.0));
  float ext = max(max(v_hw.x, v_hw.y), max(v_hw.z, v_hw.w)) + 1.0; // + Rand für die Kantenglättung
  int id = gl_VertexID;
  float along = (id >= 2 ? len + ext : -ext);
  float across = ((id & 1) == 1 ? ext : -ext);
  vec2 p = p0 + dir * along + nrm * across;
  v_local = vec2(along, across);
  v_len = len;
  v_dist0 = a_dist.x * u_view.x * u_dpr; v_dlen = a_dist.y * u_view.x * u_dpr;
  gl_Position = vec4(p.x / (u_size.x * u_dpr) * 2.0 - 1.0, 1.0 - p.y / (u_size.y * u_dpr) * 2.0, 0.0, 1.0);
}`;

// Deckung je Kanal (die Deckungstextur wird mit MAX gemischt)
const LINE_FS = `#version 300 es
precision highp float;
in vec2 v_local;
flat in vec4 v_hw, v_cover;
flat in float v_len, v_dist0, v_dlen;
uniform vec2 u_dash;    // Strich, Lücke (Gerätepixel) für Kanal R; 0: durchgezogen
out vec4 o;
void main() {
  float t = clamp(v_local.x, 0.0, v_len);
  float d = length(vec2(v_local.x - t, v_local.y));
  vec4 a = clamp(v_hw + 0.5 - d, 0.0, 1.0) * v_cover * step(vec4(1e-6), v_hw);
  if (u_dash.x > 0.0) {
    float pos = v_dist0 + (v_len > 0.0 ? t / v_len : 0.0) * v_dlen;
    if (mod(pos, u_dash.x + u_dash.y) > u_dash.x) a.r = 0.0;
  }
  if (max(max(a.r, a.g), max(a.b, a.a)) <= 0.003) discard;
  o = a;
}`;

// Ganze Fläche (ein Dreieck): Deckung einer Linienart in ihrer Farbe überblenden
const COVER_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID & 1) * 4 - 1), float((gl_VertexID & 2) * 2 - 1));
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const COVER_FS = `#version 300 es
precision highp float;
uniform sampler2D u_cover;
uniform vec4 u_c0, u_c1, u_c2, u_c3;   // Farbe je Kanal (vormultipliziert), übereinander in dieser Reihenfolge
out vec4 o;
vec4 over(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }
void main() {
  vec4 a = texelFetch(u_cover, ivec2(gl_FragCoord.xy), 0);
  if (max(max(a.r, a.g), max(a.b, a.a)) <= 0.0) discard;
  o = over(u_c3 * a.a, over(u_c2 * a.b, over(u_c1 * a.g, u_c0 * a.r)));
}`;

const RELIEF_VS = `#version 300 es
${PROJECT_GLSL}
uniform vec4 u_tile;   // λ West, λ Ost (Bogenmaß), φ Süd, φ Nord
uniform vec3 u_uv;     // Ausschnitt im Bild: x, y (von oben), Seite – Anteile der Bildgröße
uniform float u_rows;
out vec2 v_uv;
void main() {
  int row = gl_VertexID / 2, side = gl_VertexID % 2;
  float f = float(row) / u_rows;                       // 0 Norden … 1 Süden
  float phi = mix(u_tile.w, u_tile.z, f);
  float lam = side == 0 ? u_tile.x : u_tile.y;
  v_uv = vec2(u_uv.x + u_uv.z * float(side), u_uv.y + u_uv.z * f);
  gl_Position = toClip(project(vec2(lam, phi)));
}`;

const RELIEF_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_relief;
uniform sampler2D u_base;
uniform ivec2 u_modes;   // je Durchgang: 0 aus, 1 hard-light, 2 soft-light
uniform vec2 u_alphas;
out vec4 o;
vec3 multiply(vec3 b, vec3 s) { return b * s; }
vec3 screenB(vec3 b, vec3 s) { return b + s - b * s; }
vec3 hardLight(vec3 b, vec3 s) {
  return mix(multiply(b, 2.0 * s), screenB(b, 2.0 * s - 1.0), step(0.5, s));
}
vec3 softLight(vec3 b, vec3 s) {
  vec3 d = mix(((16.0 * b - 12.0) * b + 4.0) * b, sqrt(b), step(0.25, b));
  return mix(b - (1.0 - 2.0 * s) * b * (1.0 - b), b + (2.0 * s - 1.0) * (d - b), step(0.5, s));
}
vec3 blendWith(int mode, vec3 b, vec3 s) { return mode == 1 ? hardLight(b, s) : softLight(b, s); }
void main() {
  vec4 base = texelFetch(u_base, ivec2(gl_FragCoord.xy), 0);
  if (base.a <= 0.0) discard;
  vec3 b = base.rgb / base.a;
  vec3 s = vec3(texture(u_relief, v_uv).r);
  if (u_modes.x > 0) b = mix(b, blendWith(u_modes.x, b, s), u_alphas.x);
  if (u_modes.y > 0) b = mix(b, blendWith(u_modes.y, b, s), u_alphas.y);
  o = vec4(clamp(b, 0.0, 1.0) * base.a, base.a);
}`;

/**
 * WebGL-2-Renderer erzeugen oder null – dann Canvas (renderer.js): ohne WebGL 2, bei einem Fehler und ohne
 * Hardware-Beschleunigung (Software-WebGL wie SwiftShader wäre um ein Vielfaches langsamer als Canvas 2D).
 * Zum Vergleichen: ?canvas erzwingt Canvas, ?webgl WebGL auch ohne Beschleunigung.
 */
export function createGLRenderer(canvas, index, itemOf) {
  const params = new URLSearchParams(location.search);
  if (params.has("canvas")) return null;
  try {
    const gl = canvas.getContext("webgl2", {
      antialias: true, stencil: true, alpha: true, premultipliedAlpha: true,
      failIfMajorPerformanceCaveat: !params.has("webgl"),
    });
    if (!gl) return null;
    return new GLRenderer(canvas, gl, index, itemOf);
  } catch (err) {
    console.warn("WebGL nicht verfügbar:", err);
    return null;
  }
}

export class GLRenderer extends RendererBase {
  constructor(canvas, gl, index, itemOf) {
    super(index, itemOf);
    this.canvas = canvas;
    this.gl = gl;
    this.webgl = true;
    // Namen und Ringe: 2D-Fläche über der Karte (Ereignisse gehen durch zur Karte)
    this.overlay = document.createElement("canvas");
    this.overlay.className = "map-overlay";
    this.overlay.setAttribute("aria-hidden", "true");
    canvas.after(this.overlay);
    this.octx = this.overlay.getContext("2d");
    this.frame = 0;
    this.tileGL = new Map(); // Kachel → {fill, lines, used}
    this.reliefTex = new WeakMap(); // Bild → Textur
    this._cellBytes = new Uint8Array(4 * this.cells.length);
    this._infoWords = new Uint16Array(4 * this.cells.length);
    this._ids();
    this._init();
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener("webglcontextrestored", () => {
      this.lost = false;
      this.tileGL.clear();
      this.reliefTex = new WeakMap();
      this._init();
      this.onColorsChanged?.(); // neu zeichnen
    });
  }

  /** Ganzzahlige Kennungen für Kontinent, Staat, Bundesland je Zelle (Grenz-Klassen im Shader) */
  _ids() {
    const ids = new Map();
    const id = (k) => { if (!k) return 0; if (!ids.has(k)) ids.set(k, ids.size + 1); return ids.get(k); };
    this.cellIds = this.cells.map((c) => [id(c.continent), id(c.item), id(c.state)]);
  }

  // ---------- Aufbau ----------
  _init() {
    const gl = this.gl;
    this.prog = {
      fill: program(gl, FILL_VS, FILL_FS),
      line: program(gl, LINE_VS, LINE_FS),
      relief: program(gl, RELIEF_VS, RELIEF_FS),
      cover: program(gl, COVER_VS, COVER_FS),
    };
    this.cellColorTex = texture(gl, gl.RGBA8, this.cells.length, 1, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
    this.cellInfoTex = texture(gl, gl.RGBA16UI, this.cells.length, 1, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, gl.NEAREST);
    this.baseTex = null;
    this.baseFbo = gl.createFramebuffer();
    this.coverTex = null;
    this.coverFbo = gl.createFramebuffer();
    this._buildStatic();
  }

  /** Erdform (Meer, Stencil), ihr Umriss (Schein) und das Gradnetz */
  _buildStatic() {
    const gl = this.gl;
    // Meer: Streifen zwischen linkem und rechtem Rand je Breite (auf jeder Breite ist x linear in λ)
    const sea = [];
    for (let d = -90; d <= 90; d += 1) sea.push(-Math.PI, d * RAD, Math.PI, d * RAD);
    this.sphere = fillVao(gl, this.prog.fill, new Float32Array(sea), new Float32Array(sea.length / 2), null);
    // Umriss: rechts hinauf, oben nach links, links hinab, unten nach rechts
    const ring = [];
    for (let d = -90; d <= 90; d += 1) ring.push([Math.PI, d * RAD]);
    for (let l = 180; l >= -180; l -= 10) ring.push([l * RAD, Math.PI / 2]);
    for (let d = 90; d >= -90; d -= 1) ring.push([-Math.PI, d * RAD]);
    for (let l = -180; l <= 180; l += 10) ring.push([l * RAD, -Math.PI / 2]);
    this.outline = lineVao(gl, this.prog.line, segments([ring.flat()], [0], [0]));
    // Gradnetz (d3.geoGraticule10), fein unterteilt: Meridiane sind in der Projektion gekrümmt
    const lines = this.graticule.coordinates.map((line) => {
      const out = [];
      for (let i = 0; i < line.length - 1; i++) {
        const [x0, y0] = line[i], [x1, y1] = line[i + 1];
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / 2));
        for (let k = 0; k < n; k++) out.push((x0 + ((x1 - x0) * k) / n) * RAD, (y0 + ((y1 - y0) * k) / n) * RAD);
      }
      out.push(line[line.length - 1][0] * RAD, line[line.length - 1][1] * RAD);
      return out;
    });
    this.graticuleVao = lineVao(gl, this.prog.line, segments(lines, lines.map(() => 0), lines.map(() => 0)));
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (const c of [this.canvas, this.overlay]) {
      c.width = Math.round(w * this.dpr);
      c.height = Math.round(h * this.dpr);
    }
    this.w = w;
    this.h = h;
    this.baseSize = null; // Relief- und Deckungstextur neu anlegen
    this.coverSize = null;
  }

  // ---------- Zeichnen ----------
  draw(projection, tiles, moving, extras = {}) {
    if (this.lost) return;
    const { gl } = this;
    const now = performance.now();
    this.frame++;
    const v = viewOf(projection);
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    const cosmos = prefs.get("cosmos");
    const bg = cosmos ? [0, 0, 0, 0] : rgba(this.colors.outside, 1);
    gl.clearColor(...bg);
    gl.clearStencil(0);
    gl.stencilMask(0xff);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.STENCIL_TEST);

    // Uniforms, die für alle Programme gleich sind
    this._common = { proj: projectionId() === "equal" ? 1 : 0, s: v.s, tx: v.tx, ty: v.ty };

    // 1. Schein und Meer (Erdform → Stencil-Bit 1)
    if (cosmos) this._glow();
    gl.stencilFunc(gl.ALWAYS, 1, 0x01);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE);
    gl.stencilMask(0x01);
    this._fill(this.sphere, 0, 1, rgba(this.colors.sea, 1));
    gl.stencilMask(0x00);
    gl.stencilFunc(gl.EQUAL, 1, 0x01);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);

    // Zellfarben (mit Aufhell-Animation) und Einsetz-Stand je Zelle
    this._uploadCells(now);

    // 2. Gradnetz, Schelf-Saum, Land
    const copies = this._copies(tiles, v);
    const shelf = rgba(this.colors["sea-shelf"], 1);
    if (this.showGraticule) {
      const g0 = v.rot + wrapOffset(-Math.PI, v.rot);
      this._stroke([[this.graticuleVao, g0], [this.graticuleVao, g0 - TAU]], KIND.all, [0.6, 0, 0, 0], [shelf]);
    }
    const tileLines = copies.map(([t, shift]) => [this._tile(t).lines, shift]);
    this._stroke(tileLines, KIND.coast, [SHELF_PX, 0, 0, 0], [shelf]);
    for (const [t, shift] of copies) this._fill(this._tile(t).fill, shift, 0, null);

    // 3. Relief
    if (extras.relief) this._relief(projection, v, extras.relief);

    // 4. Wasser, Grenzen, Küsten
    if (extras.water?.length) {
      const water = rgba(this.colors.water, 1);
      const wcopies = this._copies(extras.water, v);
      for (const [t, shift] of wcopies) this._fill(this._tile(t).fill, shift, 2, water);
      this._stroke(wcopies.map(([t, shift]) => [this._tile(t).lines, shift]), KIND.river, [1, 0, 0, 0], [water]);
    }
    const border = rgba(this.colors.border, 1);
    // Bundesland (gestrichelt), Staat, Kontinent, Küste – in dieser Reihenfolge übereinander
    this._stroke(tileLines, KIND.borders, [BORDER_PX.state, BORDER_PX.country, BORDER_PX.continent, COAST_PX],
      [border, border, border, rgba(this.colors.coast, 1)], STATE_DASH);
    gl.disable(gl.STENCIL_TEST);
    this._collect();

    // 5. Ringe und Namen
    const o = this.octx;
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, this.overlay.width, this.overlay.height);
    o.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._drawOverlay(o, projection, now, moving);
  }

  /** Je Kachel die Verschiebungen, mit denen sie gezeichnet wird (zweimal an der Schnittlinie) */
  _copies(tiles, v) {
    const out = [];
    for (const t of tiles) {
      const off = wrapOffset(t.lon0, v.rot);
      out.push([t, v.rot + off]);
      if (t.lon1 + v.rot + off > Math.PI + 1e-9) out.push([t, v.rot + off - TAU]);
    }
    return out;
  }

  _uniforms(p, shift) {
    const { gl } = this, c = this._common;
    gl.useProgram(p.program);
    gl.uniform1i(p.u.u_proj, c.proj);
    gl.uniform4f(p.u.u_view, c.s, c.tx, c.ty, shift);
    gl.uniform2f(p.u.u_size, this.w, this.h);
  }

  /** Flächen: mode 0 Land (Zellfarben), 1 einfarbig, 2 Seen (einfarbig, ab sMin) */
  _fill(vao, shift, mode, color) {
    if (!vao || !vao.count) return;
    const { gl } = this, p = this.prog.fill;
    this._uniforms(p, shift);
    gl.uniform1i(p.u.u_mode, mode);
    if (color) gl.uniform4f(p.u.u_color, ...color);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.cellColorTex);
    gl.uniform1i(p.u.u_cellColors, 0);
    gl.bindVertexArray(vao.vao);
    if (vao.indexed) gl.drawElements(gl.TRIANGLES, vao.count, gl.UNSIGNED_INT, 0);
    else gl.drawArrays(gl.TRIANGLE_STRIP, 0, vao.count);
    gl.bindVertexArray(null);
  }

  /** Linien als Kapseln in die Deckungstextur (Breiten je Kanal) */
  _lines(vao, shift, kind, widths, dash = null) {
    if (!vao || !vao.count) return;
    const { gl } = this, p = this.prog.line;
    this._uniforms(p, shift);
    gl.uniform1i(p.u.u_kind, kind);
    gl.uniform4f(p.u.u_widths, ...widths);
    gl.uniform1f(p.u.u_dpr, this.dpr);
    gl.uniform2f(p.u.u_dash, dash ? dash[0] * this.dpr : 0, dash ? dash[1] * this.dpr : 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.cellInfoTex);
    gl.uniform1i(p.u.u_cellInfo, 1);
    gl.bindVertexArray(vao.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, vao.count);
    gl.bindVertexArray(null);
  }

  /** Schein um die Erde: breite, schwache Striche entlang des Umrisses (außerhalb der Erde, ohne Stencil) */
  _glow() {
    const { gl } = this;
    gl.disable(gl.STENCIL_TEST);
    // vier Ringe, je einer in einem Kanal
    const colors = GLOW.map(([, alpha]) => [GLOW_RGB[0] / 255 * alpha, GLOW_RGB[1] / 255 * alpha, GLOW_RGB[2] / 255 * alpha, alpha]);
    this._stroke([[this.outline, 0]], KIND.all, GLOW.map(([width]) => width), colors, null, false);
    gl.enable(gl.STENCIL_TEST);
  }

  /**
   * Linien als ein Strich je Kanal: Deckung (MAX) in die Deckungstextur, dann in den Farben überblenden
   * (Kanal R zuunterst, A zuoberst)
   * @param {[object, number][]} draws  [Linien-VAO, Verschiebung]
   * @param {number[]} widths  Breite je Kanal (CSS-Pixel, 0: aus)
   * @param {number[][]} colors  vormultiplizierte Farbe je Kanal
   * @param {boolean} [clip]  auf die Erde beschneiden (Stencil)
   */
  _stroke(draws, kind, widths, colors, dash = null, clip = true) {
    const { gl } = this;
    if (!draws.some(([vao]) => vao?.count)) return;
    const W = this.canvas.width, H = this.canvas.height;
    if (!this.coverSize || this.coverSize[0] !== W || this.coverSize[1] !== H) {
      if (this.coverTex) gl.deleteTexture(this.coverTex);
      this.coverTex = texture(gl, gl.RGBA8, W, H, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.coverFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.coverTex, 0);
      this.coverSize = [W, H];
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.coverFbo);
    const stencil = gl.isEnabled(gl.STENCIL_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendEquation(gl.MAX);
    for (const [vao, shift] of draws) this._lines(vao, shift, kind, widths, dash);
    gl.blendEquation(gl.FUNC_ADD);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (clip && stencil) gl.enable(gl.STENCIL_TEST);
    const p = this.prog.cover;
    gl.useProgram(p.program);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.coverTex);
    gl.uniform1i(p.u.u_cover, 4);
    for (let i = 0; i < 4; i++) gl.uniform4f(p.u[`u_c${i}`], ...(colors[i] ?? NONE));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (stencil) gl.enable(gl.STENCIL_TEST);
  }

  _uploadCells(now) {
    const { gl } = this;
    this._cellRgba(now, this._cellBytes);
    gl.bindTexture(gl.TEXTURE_2D, this.cellColorTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cells.length, 1, gl.RGBA, gl.UNSIGNED_BYTE, this._cellBytes);
    const words = this._infoWords;
    this.cells.forEach((c, i) => {
      const [cont, item, state] = this.cellIds[i];
      words[4 * i] = cont;
      words[4 * i + 1] = item;
      words[4 * i + 2] = state;
      words[4 * i + 3] = (this.placed.has(c.continent) ? 1 : 0) | (c.item && this.placed.has(c.item) ? 2 : 0) |
        (c.state && this.placed.has(c.state) ? 4 : 0);
    });
    gl.bindTexture(gl.TEXTURE_2D, this.cellInfoTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.cells.length, 1, gl.RGBA_INTEGER, gl.UNSIGNED_SHORT, words);
  }

  /** Puffer einer Kachel (beim ersten Zeichnen angelegt) */
  _tile(t) {
    let e = this.tileGL.get(t);
    if (!e) {
      const d = t.data;
      // Gruppenwert (Zelle bzw. sMin) je Flächenpunkt
      const attr = new Float32Array(d.poly.length / 2);
      for (let g = 0, ring = 0, pt = 0; g < d.groupAttr.length; g++) {
        for (let r = 0; r < d.groupRings[g]; r++, ring++) {
          attr.fill(d.groupAttr[g], pt, pt + d.ringPoints[ring]);
          pt += d.ringPoints[ring];
        }
      }
      const lines = [];
      for (let l = 0, start = 0; l < d.lineA.length; l++) {
        const n = d.linePoints[l];
        lines.push(d.line.subarray(2 * start, 2 * (start + n)));
        start += n;
      }
      e = {
        fill: fillVao(this.gl, this.prog.fill, d.poly, attr, d.triangles),
        lines: lineVao(this.gl, this.prog.line, segments(lines, d.lineA, d.lineB)),
      };
      this.tileGL.set(t, e);
    }
    e.used = this.frame;
    return e;
  }

  /** Puffer lange nicht gezeichneter Kacheln freigeben (nur, wenn es viele sind) */
  _collect() {
    if (this.tileGL.size <= TILE_BUFFERS_MAX) return;
    for (const [t, e] of this.tileGL) {
      if (this.frame - e.used < TILE_IDLE_FRAMES) continue;
      for (const vao of [e.fill, e.lines]) releaseVao(this.gl, vao);
      this.tileGL.delete(t);
    }
  }

  // ---------- Relief ----------
  _relief(projection, v, { layer, passes }) {
    const { gl } = this;
    const W = this.canvas.width, H = this.canvas.height;
    if (!this.baseSize || this.baseSize[0] !== W || this.baseSize[1] !== H) {
      if (this.baseTex) gl.deleteTexture(this.baseTex);
      this.baseTex = texture(gl, gl.RGBA8, W, H, gl.RGBA, gl.UNSIGNED_BYTE, gl.NEAREST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.baseFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.baseTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.baseSize = [W, H];
    }
    // bisheriges Bild (geglättet) in die Textur übernehmen
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.baseFbo);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const p = this.prog.relief;
    const modes = [0, 0], alphas = [0, 0];
    passes.slice(0, 2).forEach(([mode, alpha], i) => { modes[i] = mode === "hard-light" ? 1 : 2; alphas[i] = alpha; });
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.baseTex);
    for (const t of layer.visible(projection, { w: this.w, h: this.h })) {
      const tex = this._reliefTexture(t.src.img);
      const T = t.src.img.naturalWidth || layer.tile;
      const lam0 = t.lon0 * RAD, lam1 = (t.lon0 + t.size) * RAD;
      const phiS = t.lat0 * RAD, phiN = (t.lat0 + t.size) * RAD;
      const off = wrapOffset(lam0, v.rot);
      const hPx = v.s * Math.abs(phiN - phiS) * 1.3;
      const rows = Math.max(2, Math.min(RELIEF_ROWS_MAX, Math.ceil(hPx / RELIEF_ROW_PX)));
      for (const shift of lam1 + v.rot + off > Math.PI + 1e-9 ? [v.rot + off, v.rot + off - TAU] : [v.rot + off]) {
        this._uniforms(p, shift);
        gl.uniform4f(p.u.u_tile, lam0, lam1, phiS, phiN);
        gl.uniform3f(p.u.u_uv, t.src.sx / T, t.src.sy / T, t.src.sw / T);
        gl.uniform1f(p.u.u_rows, rows);
        gl.uniform2i(p.u.u_modes, modes[0], modes[1]);
        gl.uniform2f(p.u.u_alphas, alphas[0], alphas[1]);
        gl.activeTexture(gl.TEXTURE3);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(p.u.u_relief, 3);
        gl.uniform1i(p.u.u_base, 2);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 2 * (rows + 1));
      }
    }
    gl.enable(gl.BLEND);
  }

  _reliefTexture(img) {
    let tex = this.reliefTex.get(img);
    if (!tex) {
      const { gl } = this;
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, img);
      const f = window.__reliefFilter === "nearest" ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.reliefTex.set(img, tex);
    }
    return tex;
  }
}

// ---------- Hilfen ----------

/** Farbe (CSS) → vormultipliziertes RGBA 0…1 */
const colorCache = new Map();
function rgba(css, alpha = 1) {
  const key = `${css}|${alpha}`;
  let c = colorCache.get(key);
  if (!c) {
    const { r, g, b, opacity } = d3.rgb(css);
    const a = (Number.isFinite(opacity) ? opacity : 1) * alpha;
    c = [(r / 255) * a, (g / 255) * a, (b / 255) * a, a];
    colorCache.set(key, c);
  }
  return c;
}

function program(gl, vs, fs) {
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  };
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
    const name = gl.getActiveUniform(p, i).name;
    u[name] = gl.getUniformLocation(p, name);
  }
  const a = {};
  for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES); i < n; i++) {
    const name = gl.getActiveAttrib(p, i).name;
    a[name] = gl.getAttribLocation(p, name);
  }
  return { program: p, u, a };
}

function texture(gl, internal, w, h, format, type, filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/** Flächen-VAO: Punkte (λ, φ), Gruppenwert je Punkt, Dreiecke (oder null: Dreiecksstreifen) */
function fillVao(gl, prog, pos, attr, triangles) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buffers = [];
  const attrib = (name, data, size) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(prog.a[name]);
    gl.vertexAttribPointer(prog.a[name], size, gl.FLOAT, false, 0, 0);
    buffers.push(b);
  };
  attrib("a_pos", pos, 2);
  attrib("a_attr", attr, 1);
  let count = pos.length / 2;
  if (triangles) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, triangles, gl.STATIC_DRAW);
    buffers.push(b);
    count = triangles.length;
  }
  gl.bindVertexArray(null);
  return { vao, buffers, count, indexed: !!triangles };
}

/**
 * Linien → Strecken je Instanz: [λ0, φ0, λ1, φ1, a, b, Strecke bis hier, Länge, Ausdehnung der Linie] (in
 * Karteneinheiten der ungedrehten Karte: Strichelung, winzige Linien weglassen)
 * @param {Float32Array[]|number[][]} lines  Punkte (λ, φ) je Linie
 */
function segments(lines, a, b) {
  let n = 0;
  for (const l of lines) n += Math.max(0, l.length / 2 - 1);
  const out = new Float32Array(n * SEG_FLOATS);
  const proj = PROJECTION_DEFS[projectionId()];
  let k = 0;
  lines.forEach((l, li) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < l.length; i += 2) {
      const x = l[i] * proj.fx(l[i + 1]), y = proj.y(l[i + 1]);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const ext = Math.max(x1 - x0, y1 - y0);
    let dist = 0;
    for (let i = 0; i + 3 < l.length; i += 2) {
      const ax = l[i] * proj.fx(l[i + 1]), ay = proj.y(l[i + 1]);
      const bx = l[i + 2] * proj.fx(l[i + 3]), by = proj.y(l[i + 3]);
      const len = Math.hypot(bx - ax, by - ay);
      out.set([l[i], l[i + 1], l[i + 2], l[i + 3], a[li], b[li], dist, len, ext], k);
      k += SEG_FLOATS;
      dist += len;
    }
  });
  return out;
}

const SEG_FLOATS = 9;

function lineVao(gl, prog, data) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const stride = SEG_FLOATS * 4;
  const attrib = (name, size, offset) => {
    gl.enableVertexAttribArray(prog.a[name]);
    gl.vertexAttribPointer(prog.a[name], size, gl.FLOAT, false, stride, offset);
    gl.vertexAttribDivisor(prog.a[name], 1);
  };
  attrib("a_seg", 4, 0);
  attrib("a_ab", 2, 16);
  attrib("a_dist", 2, 24);
  attrib("a_ext", 1, 32);
  gl.bindVertexArray(null);
  return { vao, buffers: [b], count: data.length / SEG_FLOATS };
}

function releaseVao(gl, v) {
  if (!v) return;
  gl.deleteVertexArray(v.vao);
  for (const b of v.buffers) gl.deleteBuffer(b);
}
