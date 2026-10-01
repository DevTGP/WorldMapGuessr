// Bündelt JS und CSS je Seite (worldmapguessr/pages.json) nach worldmapguessr/static/dist/:
// - je Seite ein JS-Einstieg (ES-Modul) und eine CSS-Datei; gemeinsamer Code in geteilten Teilen (splitting),
//   selten gebrauchte Teile per import() nachgeladen
// - Dateinamen mit Inhalts-Hash → der Server liefert sie mit „immutable“ aus (ein Jahr zwischenspeichern)
// - Schriften werden mitkopiert (ebenfalls mit Hash)
// - manifest.json: Quellpfad → gebaute Datei, dazu je Seite die Teile zum Vorladen (modulepreload)
// Aufruf: cd web && npm ci && npm run build   (im Docker-Build automatisch)
import * as esbuild from "esbuild";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "../worldmapguessr");
const staticDir = join(app, "static");
const outDir = join(staticDir, "dist");
const tmpDir = join(here, "tmp");
const pages = JSON.parse(readFileSync(join(app, "pages.json"), "utf8"));
delete pages._;

rmSync(outDir, { recursive: true, force: true });
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

// CSS-Einstieg je Seite: die Dateien der Seite per @import (esbuild fügt sie zu einer Datei zusammen)
const cssEntries = {};
for (const [name, page] of Object.entries(pages)) {
  const file = join(tmpDir, `${name}.css`);
  writeFileSync(file, page.css.map((p) => `@import "${relative(tmpDir, join(staticDir, p)).replaceAll("\\", "/")}";`).join("\n") + "\n");
  cssEntries[name] = file;
}

// Quelldateien nutzen d3 als globale Variable (ohne Build vom CDN). Im Bündel bekommt jede Datei, die d3
// nutzt, stattdessen einen Import aus d3.js (am Ende angehängt – Importe gelten fürs ganze Modul, Zeilennummern
// bleiben gleich) – so landet d3 nur in Seiten, die es brauchen (nicht in der
// Statistik; esbuilds „inject“ hängt es an jede Seite).
const d3Shim = join(here, "d3.js").replaceAll("\\", "/");
const d3Import = {
  name: "d3-import",
  setup(build) {
    build.onLoad({ filter: /[\\/]static[\\/]js[\\/].*\.js$/ }, (args) => {
      const code = readFileSync(args.path, "utf8");
      return { contents: /\bd3\./.test(code) ? `${code}\nimport { d3 } from ${JSON.stringify(d3Shim)};` : code, loader: "js" };
    });
  },
};

const common = {
  absWorkingDir: here,
  bundle: true,
  minify: true,
  sourcemap: "linked",
  target: ["es2022", "chrome100", "firefox110", "safari16"],
  outdir: outDir,
  metafile: true,
  logLevel: "warning",
  legalComments: "eof",
};
const js = await esbuild.build({
  ...common,
  entryPoints: Object.fromEntries(Object.entries(pages).map(([name, p]) => [name, join(staticDir, p.js)])),
  format: "esm",
  splitting: true,
  entryNames: "[name]-[hash]",
  chunkNames: "chunk-[hash]",
  plugins: [d3Import],
});
const css = await esbuild.build({
  ...common,
  entryPoints: cssEntries,
  entryNames: "[name]-[hash]",
  assetNames: "[name]-[hash]",
  loader: { ".woff2": "file" },
});

// Manifest: Quelle (relativ zu static/) → gebaute Datei (relativ zu static/)
const rel = (p) => relative(staticDir, resolve(here, p)).replaceAll("\\", "/");
const manifest = { files: {}, pages: {} };
const outputs = { ...js.metafile.outputs, ...css.metafile.outputs };
for (const [out, info] of Object.entries(outputs)) {
  if (out.endsWith(".map")) continue;
  if (info.entryPoint) {
    const entry = resolve(here, info.entryPoint);
    const name = Object.keys(pages).find((n) => entry === join(staticDir, pages[n].js) || entry === cssEntries[n]);
    const page = (manifest.pages[name] ??= { modulepreload: [] });
    if (out.endsWith(".js")) {
      page.js = rel(out);
      // alle statisch importierten Teile (auch über Ecken), damit der Browser sie gleich mitlädt
      const seen = new Set();
      const walk = (o) => {
        for (const i of outputs[o]?.imports ?? []) {
          if (i.kind === "import-statement" && !seen.has(i.path)) { seen.add(i.path); walk(i.path); }
        }
      };
      walk(out);
      page.modulepreload = [...seen].map(rel);
    } else {
      page.css = rel(out);
    }
  } else {
    // Schriften: Eingabe → Ausgabe
    for (const input of Object.keys(info.inputs)) {
      if (input.endsWith(".woff2")) manifest.files[rel(input)] = rel(out);
    }
  }
}
// Kennung des Builds (für den Service Worker): Hash über alle Ausgabedateien
manifest.build = createHash("sha256").update(Object.keys(outputs).sort().join("\n")).digest("hex").slice(0, 12);
writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
rmSync(tmpDir, { recursive: true, force: true });

const size = (o) => (o.bytes / 1024).toFixed(1).padStart(7) + " kB";
for (const [out, info] of Object.entries(outputs)) if (!out.endsWith(".map")) console.log(size(info), rel(out));
