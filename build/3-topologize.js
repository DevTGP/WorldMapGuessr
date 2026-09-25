// Schritt 3: Kontinente und spielbare Staaten in eine gemeinsame TopoJSON überführen.
// Gemeinsame Topologie = gemeinsame Kanten: Küsten und Grenzen passen zwischen beiden Ebenen exakt.
// Vereinfachung ortsabhängig: Europa volle 1:10m-Genauigkeit, Amerika, Afrika und Asien fast 1:10m, sonst etwa 1:50m.
const fs = require("fs");
const { topology } = require("topojson-server");
const { presimplify, sphericalTriangleArea } = require("topojson-simplify");
const { quantize } = require("topojson-client");

const OUT = "../worldmapguessr/static/data/world.topo.json";
// Detailregionen (erste passende gilt); Gewicht = kleinste behaltene Dreiecksfläche in Steradiant
const REGIONS = [
  { name: "Europa", lon: [-32, 62], lat: [27, 83], minWeight: 1e-11 },          // nur fast kollineare Punkte weg
  { name: "Nordamerika", lon: [-180, -10], lat: [5, 84], minWeight: +(process.env.NA_WEIGHT ?? 1e-10) },
  // inkl. Galápagos und Osterinsel (Chile)
  { name: "Südamerika", lon: [-110, -25], lat: [-60, 13], minWeight: +(process.env.SA_WEIGHT ?? 1e-10) },
  // inkl. Kap Verde, Madagaskar, Mauritius/Rodrigues, Seychellen, Prinz-Edward-Inseln
  { name: "Afrika", lon: [-26, 64], lat: [-48, 38], minWeight: +(process.env.AF_WEIGHT ?? 1e-10) },
  // Staaten Asiens bis Japan und Indonesien; Sibirien nördlich von 56° N bleibt gröber
  { name: "Asien", lon: [25, 150], lat: [-11, 56], minWeight: +(process.env.AS_WEIGHT ?? 1e-10) },
];
const MIN_WEIGHT_OUTSIDE = 8e-7;   // übrige Welt: etwa 1:50m-Detailgrad

const continents = JSON.parse(fs.readFileSync("tmp/continents.geojson"));
const countries = JSON.parse(fs.readFileSync("tmp/countries-items.geojson"));

let t = topology({ continents, countries }, 1e6);
t = presimplify(t, sphericalTriangleArea); // Bögen jetzt absolut (lon/lat) mit Gewicht als 3. Wert

const minWeight = ([x, y]) => {
  const r = REGIONS.find((r) => x >= r.lon[0] && x <= r.lon[1] && y >= r.lat[0] && y <= r.lat[1]);
  return r ? r.minWeight : MIN_WEIGHT_OUTSIDE;
};
let before = 0;
let after = 0;
t.arcs = t.arcs.map((arc) => {
  before += arc.length;
  const kept = arc.filter((p) => p[2] >= minWeight(p));
  after += kept.length;
  return kept.map(([x, y]) => [x, y]);
});
delete t.transform;
t = quantize(t, 1e6);

fs.mkdirSync("../worldmapguessr/static/data", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(t));
console.log(`Punkte: ${before} → ${after}`);
console.log("Bytes:", fs.statSync(OUT).size);
