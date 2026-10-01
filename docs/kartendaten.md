# Kartendaten

## Neu erzeugen

```
cd build
npm install
pip install -r requirements.txt
npm run build
```

`npm run build` führt fünf Schritte aus (Dauer: unter einer Minute plus einmalig die Downloads, ~55 MB):

1. `python 1-cells.py` – lädt Natural Earth 1:10m Admin-0 und Admin-1 (nach `build/tmp/src`), ordnet jedes Landstück einem Kontinent, höchstens einem Staat-Item und höchstens einem Bundesland zu („Zelle“, z. B. Europa × Russland, Europa × Deutschland × Bayern) und wendet die Sonderfälle unten an. Ausgabe in `build/tmp/`.
2. `node 2-tiles.mjs` – baut daraus `worldmapguessr/static/data/map/`:
   - `tiles/z0…z4/{x}_{y}.json` (nach Schritt 5 `.bin`) – Karte in 5 Detailstufen, je Stufe ein Längen-/Breitengrad-Raster (90°, 45°, 22,5°, 11,25°, 5,625°). Inhalt je Kachel: Landflächen je Zelle und Linien (Küsten, Kontinent- und Staatsgrenzen), ganzzahlig und als Differenzen kodiert.
   - `items/i0.json` – alle Items in der Startstufe; `items/i1…i4/{kind}-{id}.json` – feinere Umrisse je Item.
   - `index.json` – Stufen, Zellen, Items (Name, englischer Name `nameEn` aus `world-countries`, Gruppe, Anker, Fläche), Kachelliste, Version (Hash über die Daten).

3. `python 3-water.py` – Flüsse und Seen (Natural Earth 1:10m `rivers_lake_centerlines`, `lakes`, von GitHub) als Kacheln `water/z0…z4/{x}_{y}.json` im selben Raster: je Objekt die Kartenskala `sMin = 256 · 2^min_zoom / 2π` (aus Natural Earths `min_zoom`), ab der der Browser es zeichnet; je Stufe nur Objekte bis zu ihrem `sMax`, vereinfacht auf 0,6 px. ~5 MB, nur bei Bedarf geladen.
4. `python 4-relief.py` – Geländeschummerung als Graustufen-JPEGs `relief/r0…r3/{x}_{y}.jpg` (512 px; Welt 1024 … 8192 px breit, reine Meereskacheln fehlen; ~2,9 MB). Quelle: Natural Earth „Shaded Relief, High Res“ (`SR_HR.tif`, 21600 × 10800, gemeinfrei, reine Graustufen-Schummerung) vom S3-Spiegel `naturalearth.s3.amazonaws.com` (naturalearthdata.com ist aus der Build-Umgebung nicht erreichbar). Ebenes Gelände hat dort den Grauwert 206; Abweichungen werden mit `GAIN` = 1,5 um 128 (neutral) gelegt. Meer und ein 1-px-Küstensaum sind neutral (Landmaske aus Schritt 1). Braucht `numpy`, `scipy`, `pillow`.

5. `node 5-binary.mjs` – wandelt die Land- und Wasserkacheln (Schritte 2 und 3) in ein Binärformat (`.bin`) und zerlegt die Flächen dabei in Dreiecke (earcut); die JSON-Kacheln werden gelöscht. Der Browser muss so weder JSON parsen noch triangulieren, der WebGL-Renderer lädt die Dreiecke direkt hoch. Format: Kopf und Gliederung (Gruppen = Zelle bzw. sMin, Ringe, Linien mit Zellen a/b bzw. sMin) als 4-Byte-Felder, Koordinaten (Differenzen wie im JSON) und Dreiecksindizes (Differenz zum vorigen) als Zickzack-Varints; Beschreibung im Kopf von `build/5-binary.mjs`, Leser `static/js/map/tile-format.js`.

   | Stufe | JSON (roh / Brotli) | binär mit Dreiecken (roh / Brotli) |
   |---|---|---|
   | Land z0 | 142 / 37 kB | 92 / 40 kB |
   | Land z4 | 9,0 / 2,1 MB | 5,8 / 2,5 MB |

   Außenringe und Löcher haben entgegengesetzten Umlaufsinn (der Canvas-Renderer füllt „nonzero“); je Zelle gilt der Umlaufsinn des größten Rings als außen, jedes Loch gehört zum kleinsten Außenring, der es enthält.

Schritte 3 bis 5 ergänzen `index.json` (`water`, `relief`, `tileFormat`) und setzen die Version neu (`versions`: Hash je Teil). Nach Schritt 2 müssen sie erneut laufen.

## Relief zeichnen

Die Karte ist pseudozylindrisch (x = λ · fx(φ)), auf jeder Breite ist x also linear in der Länge. Jede Rasterkachel wird in waagerechten Streifen (3 px, beim Bewegen 8 px) auf eine graue Zwischenfläche gezeichnet, die dann einmal über die Landfarben geblendet wird – „hard-light“ auf hellem Land (B), „soft-light“ auf dunklem (A, C; ruhiger, kein Grieseln). Reihenfolge: Landflächen → Relief → Seen und Flüsse → Grenzen → Küsten → Namen.

## Grenzen und Namen

- Grenzen sind je Ebene abgestuft (`BORDER_PX` in `map/renderer.js`): Kontinentgrenzen 2,2 px, Staatsgrenzen 0,8 px, Küsten 0,7 px in der Küstenfarbe. So bleibt die übergeordnete Grenze sichtbar, auch wenn alle Unterteilungen eingesetzt sind. Grenzen zwischen Bundesländern sind die schwächste Stufe: 0,45 px, gestrichelt; sichtbar, sobald eines der angrenzenden Länder eingesetzt ist. Die Außengrenze eines Bundeslands ist eine Staatsgrenze und wird wie diese gezeichnet.
- Namen eingesetzter Items (`map/labels.js`) im Stil der Paradox-Karten (Victoria 3): Versalien in Cinzel (Google Fonts; Ersatz Cormorant SC, Georgia), gesperrt, entlang der Form gebogen, so groß, wie das Item es hergibt – und **fest auf der Erde**: Jeder Name wird einmal ausgelegt (unabhängig von Zoom und Drehung), jeder Buchstabe hängt an seinem Punkt in Länge/Breite, die Schrift wächst mit der Karte. Sichtbar ist ein Name, solange seine Schrift auf dem Bildschirm zwischen 7,5 und 170 px liegt (Kontinente 10–90 px, Bundesländer 7–140 px; weich ein- und ausgeblendet) – kleine Länder zeigen ihren Namen erst beim Hineinzoomen, ganz nah tritt er zurück.
  - Auslegen je Item in einer eigenen Bezugsansicht (Projektion auf das Item gedreht, Item ≈ 260 px): Hauptteil und nahe Inseln (höchstens 1,2 Durchmesser des Hauptteils entfernt – Griechenland mit Kreta, die USA ohne Alaska/Hawaii) werden in eine Maske (2-px-Zellen) gerastert. Die Hauptachse der Fläche gibt die Richtung (runde Formen waagerecht, höchstens 65° steil, Leserichtung links → rechts), die Mitten der längsten Querschnitte die Mittellinie (quadratisch ausgeglichen, Biegung ≤ 16 % der Länge). Der Name füllt 80 % der Länge: Die Höhe begrenzt die Dicke (≤ 70 %), den Rest füllt die Sperrung.
  - Hülle: Für Form und Größe zählen Meerengen und Buchten mit (morphologisches Schließen der Maske, ohne fremdes Land). Wie weit, hängt vom Inselanteil ab (Fläche außerhalb des größten Teils): ohne Inseln Lücken bis 4 % der Itemgröße, ab 15 % Inselanteil bis 36 % – Griechenland samt Ägäis, Italien samt Sizilien, Indonesien, Dänemark. Inselstaaten dürfen ihren Namen zudem bis zu 35 % über die Enden der Form hinaus aufs Meer laufen lassen und probieren neben der Hauptachse schräge Richtungen (±20°, ±40°; gewählt, wenn der Name dort mindestens 5 % größer wird). Staaten ohne Inseln (Spanien: Balearen ≈ 1 %) bleiben bei der Hauptachse und der Länge der Form.
  - Toleranz wie in den Paradox-Spielen: Der Name darf über Meer, Buchten, Inseln und Nachbarn laufen, solange mindestens 60 % seiner Buchstabenfläche in der Hülle liegen, mindestens 40 % auf eigenem Land, höchstens 20 % auf Land anderer Staaten und kein Buchstabe mehr als 0,6 Schrifthöhen von der Hülle entfernt ist. Sonst wird die Linie quer verschoben bzw. die Schrift kleiner (7 Stufen).
  - Überschneidungen werden in einer gemeinsamen Weltansicht geprüft, nur wenn sich die eingesetzten Items ändern: Staaten zuerst (größere zuerst), Bundesländer untereinander, Kontinente nur, wo sie keinen Staatsnamen berühren. Sind Bundesländer eines Staates lesbar, tritt dessen Name zurück (30 % Deckkraft). Schriftfarbe hell oder dunkel nach der Landfarbe darunter, große Namen halbtransparent.
  - Kosten: je Item einmal ≈ 2 ms (zwischengespeichert), alle ~200 Staaten auf einmal ≈ 0,3–0,4 s (nur beim Laden eines Spielstands mit vielen eingesetzten Items).

Der Server liefert die Dateien unter `/data/<version>/…` mit einem Jahr Cache und gzip-komprimiert aus ([server.md](server.md#komprimierung)); nach einem neuen Build ändert sich die Version und der Browser lädt neu.

## Detailstufen (LOD)

- Vereinfachung nach Visvalingam mit sphärischer Dreiecksfläche auf einer gemeinsamen Topologie: Grenzen zweier Zellen werden überall gleich vereinfacht, es entstehen keine Lücken – das gilt auch für Bundesländer, deren Außengrenzen genau auf den Staatsgrenzen liegen.
- Stufe z wird bis zur Kartenskala `sMax` benutzt (Pixel je Bogenmaß: 450, 1100, 2800, 7000, ∞; bei 1280 px Breite ≈ Zoom 200 %, 500 %, 1250 %, 3100 %). Ein Punkt bleibt, wenn sein Dreieck bei `sMax` mindestens `PX2` = 4 px² groß wäre; Inseln unter 1 px fallen weg. Die feinste Stufe enthält jeden Punkt der Quelle.
- Beim Zeichnen: nur Kacheln im Ausschnitt; fehlt eine, wird die nächstgröbere geladene gezeichnet, bis sie da ist. Punkte näher als *Schritt* px am vorigen werden übersprungen, Ringe unter 0,5 px ganz. Flächen werden je Kachel und Farbe zu einem Pfad gebündelt (ein `fill` statt eines je Zelle). Höchstens *Speicher* Punkte bleiben im Speicher (älteste Kacheln fallen raus).
- Kartenqualität: Der Detailfaktor multipliziert die Kartenskala bei der Wahl der Stufe – bei „Hoch“ wird Stufe z also schon bei einem Sechstel ihres `sMax` durch die feinere ersetzt. Während Ziehen/Zoomen wird mit dem Bewegungsfaktor gezeichnet und nach dem Loslassen fein nachgezeichnet.

  | | Niedrig | Mittel | Hoch |
  |---|---|---|---|
  | Detailfaktor (Ruhe / Bewegung) | 1 / 1 | 2,5 / 1 | 6 / 2,5 |
  | Schritt (Ruhe / Bewegung, px) | 0,75 / 0,75 | 0,6 / 0,75 | 0,5 / 0,7 |
  | Gehaltenes Item, Schritt (px) | 0,5 | 0,35 | 0,25 |
  | Speicher (Punkte) | 2,5 Mio. | 4 Mio. | 6 Mio. |

  Der größte Zoom ist bei jeder Qualität 16000 %. „Niedrig“ entspricht dem früheren Verhalten. Die Daten sind für alle Stufen dieselben; höhere Qualität lädt nur früher die feineren Kacheln und Item-Umrisse nach.
- Kacheln überlappen um 1/512 ihrer Seite, und Kanten entlang eines Meridians (Kachelrand, ±180°) sind fein unterteilt – so bleiben keine Haarlinien an Kachelrändern. Unsichtbare Grenzen zwischen gleichfarbigen Zellen werden in der Flächenfarbe nachgezogen.
- Items: Die Startstufe ist je Item so fein, wie sein Inventar-Icon oder die Weltansicht es braucht. Ein aufgenommenes Item lädt die zum Zoom passende Stufe nach (Kontinente höchstens Stufe 3); gezeichnet wird nur der Teil, der beim Verschieben sichtbar werden kann.
- Inventar-Icons (unabhängig von der Kartenqualität): Jedes Icon lädt die Stufe nach, die das Icon bei 4 × Größe × Pixeldichte braucht, und wird neu gezeichnet (Icon-Cache je Stufe). Eingepasst wird immer auf die Startstufe – feinere Stufen bringen winzige, weit entfernte Inseln mit (Clipperton, Kokosinsel, Prinz-Edward-Inseln …), die das Hauptland sonst schrumpfen ließen; was außerhalb liegt, wird abgeschnitten. Umgekehrt lassen feinere Stufen Inseln unter 1 px ihrer Skala weg (Atolle von Kiribati, Malediven …); solche Inseln der Startstufe werden im Icon ergänzt.
- Umlaufsinn: Nach dem Runden auf ganze Zahlen kann ein winziger Ring seine Richtung umkehren; d3 liest ihn dann als „alles außer dieser Fläche“ (z. B. füllte Kiribatis Icon die ganze Box). Der Build dreht Polygone mit sphärischer Fläche > 2π nach dem Runden wieder um.
- Startpaket: `index.json` + `i0.json` + Stufe 0 ≈ 0,4 MB; alles Weitere nach Bedarf.

## Datenentscheidungen

- Quelle: Natural Earth 1:10m Admin-0 in voller Genauigkeit (GeoJSON aus dem Natural-Earth-Repository, nicht quantisiert), Regionen und deutsche Namen aus `world-countries`. Weltweit gleicher Detailgrad, alle Inseln; die Detailstufen sorgen dafür, dass beim Herauszoomen nur so viel gezeichnet wird, wie sichtbar ist. Volle Genauigkeit ist auch die Grundlage für Bundesländer (Natural Earth Admin-1), deren Grenzen exakt auf die Staatsgrenzen passen müssen.
- Bundesländer (`STATES` in `build/1-cells.py`, bisher Deutschland → Gruppe `state-de`, Items `state:DE-BY` …): Admin-1-Flächen, zugeschnitten auf den Admin-0-Umriss des Staates (die Umrisse stimmen dort bis auf ~1e-8 Grad² überein; Splitter bekommt das Land mit der längsten gemeinsamen Grenze). Jede Zelle Deutschlands trägt dazu ihr Bundesland (`index.json` → `cells`: `[Kontinent, Staat, Bundesland]`), die Stufe einer Fläche ist Kontinent + Staat + Bundesland. Deutsche Namen aus Admin-1 `name`, englische aus `name_en` (Bremen gekürzt). Weitere Staaten: Eintrag in `STATES`, Gruppe in `lobbies/settings.py` (`KINDS`) und `menu/config.js` (`GROUPS`), Texte `group.state-xx`.
- Europäische Staaten nur mit ihren europäischen Landesteilen; Russland ganz. Überseegebiete (Französisch-Guayana, Guadeloupe, Martinique, Réunion, Karibische Niederlande …) gehören zum Kontinent, auf dem sie liegen – nicht mehr zu Europa.
- Staaten Nord- und Südamerikas mit allen Landesteilen: USA inkl. Alaska, Aleuten (über die Datumsgrenze ohne Naht) und Hawaii; Ecuador inkl. Galápagos, Chile inkl. Osterinsel.
- Afrika: Somaliland (in den Quelldaten eigene Fläche, international nicht anerkannt) gehört zum Item Somalia. Marokko ist in den Quelldaten samt dem von ihm kontrollierten Teil der Westsahara eingezeichnet; als Item gilt es wie bei den Vereinten Nationen ohne Westsahara (Grenze 27°40′ N, `CUT_TO` in `build/1-cells.py`) – die Westsahara ist nur Kontinentfläche. Namen: Eswatini (statt Swasiland), Demokratische Republik Kongo / Republik Kongo, Elfenbeinküste.
- Asien: Zypern gehört (samt Nordzypern, UN-Pufferzone und den britischen Basen Akrotiri/Dhekelia) als ein Item zu den Staaten Asiens und auch zur Kontinentfläche Asien. Taiwan und Palästina (Westjordanland + Gaza) sind eigene Items, obwohl sie nicht als unabhängig geführt werden (wie Kosovo). Hongkong und Macao zählen zu China, Baikonur zu Kasachstan; der Siachen-Gletscher ist nur Kontinentfläche.
- Inselstaaten aus weit verstreuten Atollen (Tuvalu, Kiribati, Marshallinseln …): Im Inventar und Menü zeigen ihre Icons zu kleine Inseln als Punkte, damit sie sichtbar bleiben.
- Item-Gruppen: Staaten tragen in `index.json` `region` (`EU`/`NA`/`SA`/`AF`/`AS`/`OC`); daraus entstehen die Gruppen `continent`, `country-eu`, `country-na`, `country-sa`, `country-af`, `country-as`, `country-oc` und `state-de` (Bundesländer Deutschlands; Menü-Karten, `config.kinds`). Ohne Angabe spielt eine Lobby alle Gruppen außer den Bundesländern. Item-Keys bleiben `country:USA` usw., die Statistik ist davon unberührt. Ältere Lobbys mit `kinds: ["country"]` werden beim Laden zu `country-eu`.
- Projektion: Natural Earth 1, wahlweise Equal Earth (flächentreu, Einstellung „Projektion“).
- Europa/Asien: Ural-Kamm → Ural-Fluss → Kaspisches Meer → Kaukasus; Türkei, Georgien, Armenien, Aserbaidschan, Kasachstan = Asien.
- Afrika/Asien: Grenze Ägypten/Israel (Sinai zählt zu Afrika). Nord-/Südamerika: Grenze Panama/Kolumbien.
- Datumsgrenze: Die Quelle ist bei ±180° geteilt. Diese Schnittkanten gelten nicht als Küste (keine Linie), und die Flächen daran ragen wie an Kachelrändern minimal über die Kante – beim Drehen bleibt an der Datumsgrenze keine Naht.
