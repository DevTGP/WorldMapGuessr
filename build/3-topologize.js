// Schritt 3: Kontinente und europäische Staaten in eine gemeinsame TopoJSON überführen.
// Gemeinsame Topologie = gemeinsame Kanten: Küsten und Grenzen passen zwischen beiden Ebenen exakt.
// Vereinfachung ortsabhängig: in Europa volle 1:10m-Genauigkeit, sonst etwa 1:50m.
const fs = require("fs");
const { topology } = require("topojson-server");
const { presimplify, sphericalTriangleArea } = require("topojson-simplify");
const { quantize } = require("topojson-client");

const OUT = "../worldmapguessr/static/data/world.topo.json";
const EUROPE = { lon: [-32, 62], lat: [27, 83] };
const MIN_WEIGHT_OUTSIDE = 8e-7;   // Steradiant – außerhalb Europas etwa 1:50m-Detailgrad
const MIN_WEIGHT_EUROPE = 1e-11;     // nur fast kollineare Punkte entfernen

const continents = JSON.parse(fs.readFileSync("tmp/continents.geojson"));
const countries = JSON.parse(fs.readFileSync("tmp/countries-europe.geojson"));

let t = topology({ continents, countries }, 1e6);
t = presimplify(t, sphericalTriangleArea); // Bögen jetzt absolut (lon/lat) mit Gewicht als 3. Wert

const inEurope = ([x, y]) => x >= EUROPE.lon[0] && x <= EUROPE.lon[1] && y >= EUROPE.lat[0] && y <= EUROPE.lat[1];
let before = 0;
let after = 0;
t.arcs = t.arcs.map((arc) => {
  before += arc.length;
  const kept = arc.filter((p) => p[2] >= (inEurope(p) ? MIN_WEIGHT_EUROPE : MIN_WEIGHT_OUTSIDE));
  after += kept.length;
  return kept.map(([x, y]) => [x, y]);
});
delete t.transform;
t = quantize(t, 1e6);

fs.mkdirSync("../worldmapguessr/static/data", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(t));
console.log(`Punkte: ${before} → ${after}`);
console.log("Bytes:", fs.statSync(OUT).size);
