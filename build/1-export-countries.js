// Schritt 1: Länder (Natural Earth 1:10m via world-atlas) als GeoJSON exportieren –
// mit Kontinent-Zuordnung und, für spielbare Staaten (Europa, Nord-/Südamerika, Afrika), ISO-Code,
// deutschem Namen und Region.
const fs = require("fs");
const topo = require("world-atlas/countries-10m.json");
const wc = require("world-countries");
const { feature } = require("topojson-client");

const byNum = Object.fromEntries(wc.map((c) => [c.ccn3, c]));

// Kontinent-Sonderfälle (Features ohne ISO-Nummer oder mit abweichender Zuordnung)
const OVERRIDE_ID = { "010": "AN", "239": "SA", "260": "AF", "074": "AF", "334": "OC", "643": "RU" };
const OVERRIDE_NAME = {
  Somaliland: "AF", Kosovo: "EU", "N. Cyprus": "EU", "Cyprus U.N. Buffer Zone": "EU",
  Dhekelia: "EU", Akrotiri: "EU", "Indian Ocean Ter.": "OC", "Coral Sea Is.": "OC",
  "Siachen Glacier": "AS", Baikonur: "AS", "Spratly Is.": "AS", "Scarborough Reef": "AS",
  "USNB Guantanamo Bay": "NA", "Clipperton I.": "NA", "Bajo Nuevo Bank": "NA", "Serranilla Bank": "NA",
};
const REGION = { Africa: "AF", Asia: "AS", Europe: "EU", Oceania: "OC", Antarctic: "AN" };

// "Klassisch Europa": unabhängige Staaten der Region Europa ohne Zypern, dazu Kosovo (45 Staaten)
const EXCLUDED_EUROPE = new Set(["CYP"]);
const KOSOVO = { code: "XKX", name: "Kosovo" };

// world-atlas 1:10m ist auf ~400 m quantisiert: der Vatikan fällt dabei zu einer Linie zusammen.
// Ersatz: vereinfachter Umriss (Grenzverlauf von Hand nachgezogen, ca. 0,45 km²).
const VATICAN_OUTLINE = [[
  [12.4457, 41.9040], [12.4462, 41.9022], [12.4482, 41.9010], [12.4519, 41.9002], [12.4541, 41.9016],
  [12.4577, 41.9014], [12.4583, 41.9026], [12.4556, 41.9048], [12.4551, 41.9068], [12.4527, 41.9072],
  [12.4490, 41.9075], [12.4468, 41.9063], [12.4457, 41.9040],
]];

function continentOf(f) {
  if (OVERRIDE_ID[f.id]) return OVERRIDE_ID[f.id];
  if (OVERRIDE_NAME[f.properties.name]) return OVERRIDE_NAME[f.properties.name];
  const c = byNum[f.id];
  if (!c) throw new Error("Unbekanntes Land: " + f.properties.name);
  if (c.region === "Americas") return c.subregion === "South America" ? "SA" : "NA";
  if (!REGION[c.region]) throw new Error("Unbekannte Region: " + c.region);
  return REGION[c.region];
}

// Deutsche Namen, wo world-countries veraltet oder mehrdeutig ist
const NAME_OVERRIDE = {
  SWZ: "Eswatini", COD: "Demokratische Republik Kongo", COG: "Republik Kongo", CIV: "Elfenbeinküste",
  CAF: "Zentralafrikanische Republik",
};

/** Spielbarer Staat? → {code, name, region} oder null */
function countryItem(f) {
  if (f.properties.name === "Kosovo") return { ...KOSOVO, region: "EU" };
  // Somaliland (international nicht anerkannt) gehört zum Item Somalia – Schritt 2 vereinigt beide Flächen
  if (f.properties.name === "Somaliland") return { code: "SOM", name: "Somalia", region: "AF" };
  const c = byNum[f.id];
  if (!c || c.independent !== true) return null;
  const item = { code: c.cca3, name: NAME_OVERRIDE[c.cca3] ?? c.translations.deu.common };
  // "Klassisch Europa": unabhängige Staaten der Region Europa ohne Zypern (+ Kosovo) – 45 Staaten
  if (c.region === "Europe" && !EXCLUDED_EUROPE.has(c.cca3)) return { ...item, region: "EU" };
  // Nordamerika: Nord-, Mittelamerika und Karibik – 23 Staaten
  if (c.region === "Americas" && c.subregion !== "South America") return { ...item, region: "NA" };
  // Südamerika – 12 Staaten (ohne Französisch-Guayana und Falklandinseln)
  if (c.region === "Americas" && c.subregion === "South America") return { ...item, region: "SA" };
  // Afrika – 54 Staaten (ohne Westsahara, Réunion, Mayotte, St. Helena …)
  if (c.region === "Africa") return { ...item, region: "AF" };
  return null;
}

const fc = feature(topo, topo.objects.countries);
const count = { EU: 0, NA: 0, SA: 0, AF: 0 };
for (const f of fc.features) {
  if (f.properties.name === "Vatican") f.geometry = { type: "Polygon", coordinates: VATICAN_OUTLINE };
  f.properties.continent = continentOf(f);
  const item = countryItem(f);
  if (item) { f.properties.country = item; count[item.region]++; }
}
fs.mkdirSync("tmp", { recursive: true });
fs.writeFileSync("tmp/countries.geojson", JSON.stringify(fc));
console.log("Länder:", fc.features.length, "spielbare Staaten:", count);
