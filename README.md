# WorldMapGuessr

Geografie-Spiel: Kontinente, Länder, Bundesländer und Regionen auf einer Weltkarte korrekt einsetzen.

**Stand:** Schritt 7: Daten in MongoDB (JSON-Dateien als Fallback).

## Spielablauf

- Die Karte lässt sich wie ein Globus um die Längsachse drehen: seitlich ziehen oder die Pfeile oben (bzw. `←`/`→`), die in 45°-Schritten (π/4) auf 0°, 45°, 90° … weiterdrehen. Was in der Mitte liegt, ist am wenigsten verzerrt.
- Bei 100 % ist die Y-Achse fest (Ziehen dreht nur). Erst nach dem Hineinzoomen lässt sich die Karte auch senkrecht verschieben.
- Vor jeder Runde öffnet sich das Menü (auch über „Neue Runde“ oben rechts und nach Rundenende über „Einstellungen“):
  - **Spielteile:** Arten an-/abwählen (7 Kontinente, 45 Staaten Europas – klassisches Europa inkl. Russland und Kosovo, ohne Türkei, Zypern und Kaukasus).
  - **Auswahl:** einzelne Teile ausschließen (Suche, „Alle“/„Keine“ je Gruppe).
  - **Regeln:** Leben (Standard 10), Startteile (Standard 5), Nachschub: neue Teile (Standard 4) nach je … Treffern (Standard 3).
  - Die Einstellungen gelten nur für die gestartete Runde und werden nicht gespeichert; solange die Seite offen ist, merkt sich das Menü die letzte Auswahl. „Nochmal“ im Rundenende-Dialog startet mit denselben Einstellungen neu gemischt.
  - Während einer laufenden Runde schließt `Esc` bzw. × das Menü wieder, ohne die Runde zu verlieren.
- Staatsgrenzen sind auf der Karte unsichtbar, sichtbar sind nur Küsten und Kontinentgrenzen. Ein richtig eingesetzter Staat erscheint aufgehellt mit seinem Umriss (Kleinststaaten zusätzlich mit einem Ring, solange sie zu klein zum Erkennen sind).
- Ein gehaltener Kleinststaat (Vatikan, Monaco, San Marino …) bekommt einen gestrichelten Ring, damit man ihn sieht.
- Klick auf einen Umriss nimmt ihn auf; er folgt dem Mauszeiger in der aktuellen Ansicht (gleiche Drehung, gleicher Zoom).
- Klick auf die Karte setzt ihn ein. Liegt er innerhalb einer kleinen Toleranz richtig, rastet er ein und die Fläche wird eine Stufe heller.
- Helligkeitsstufen: Das Land startet fast schwarz. Jedes eingesetzte Teil hellt seine Fläche um eine Stufe auf (additiv, Reihenfolge egal). Sind alle Ebenen an einer Stelle eingesetzt – derzeit Kontinent und Staat –, ist sie fast weiß. Kommen später Ebenen hinzu (Bundesländer, Regionen), werden die Stufen automatisch feiner.
- Daneben: Der Umriss fliegt zurück ins Inventar, ein Leben weniger. Bei 0 Leben endet die Runde. Ab 11 Leben zeigt die Anzeige ein Herz mit Zahl statt einzelner Herzen.
- Nachschub: Nach der eingestellten Zahl richtiger Treffer kommen neue Umrisse ins Inventar, bis der Vorrat leer ist.
- Zurücklegen ohne Strafe: Klick auf den Slot, `Esc` oder Rechtsklick.

## Lobbys

- **Erstellen:** im Menü „Lobby erstellen“ → Name eingeben → Weiterleitung auf den Lobby-Link. Die aktuellen Menü-Einstellungen werden übernommen, der Ersteller ist Host.
- **Link:** so kurz wie möglich, `http://127.0.0.1:5000/K7Q2M` – 5 Zeichen aus `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (ohne 0/O, 1/I/L), ≈ 28,6 Mio. Codes. Klein geschrieben wird weitergeleitet.
- **Beitreten:** Link öffnen → Name (und ggf. Passwort). Jederzeit möglich, auch während einer Runde: Wer später kommt, steigt direkt in die laufende Runde ein.
- **Wiedererkennung:** Spieler-ID und Token liegen im Browser (localStorage). Neu laden oder später zurückkommen führt ohne erneuten Beitritt in dieselbe Rolle – auch als Host.
- **Einstellungen (nur Host):** Spielkonfiguration wie im Einzelspiel, max. Spielerzahl (Standard 8), Passwort (setzen/entfernen), „Items senden“ (Standard an, wirkt sofort). Gäste sehen alles live, aber gesperrt.
- **Host-Wechsel:** Ist der Host länger als 10 s getrennt, übernimmt der am längsten anwesende Spieler.
- **Verlassen (alle):** „Lobby verlassen“ im Lobby-Bereich des Menüs → Bestätigung → zurück zum Einzelspiel. Der Spieler wird aus der Lobby entfernt, seine gespeicherte Identität gelöscht; über den Link kann er später als neuer Spieler wieder beitreten. Verlässt der Host, geht die Rolle sofort an den am längsten anwesenden Online-Spieler. Verlässt der letzte Spieler, wird die Lobby gelöscht.
- **Beenden (nur Host):** „Lobby beenden“ → Bestätigung → die Lobby wird für alle gelöscht. Alle anderen sehen „Lobby beendet“ mit dem Weg zum Einzelspiel; der Link funktioniert danach nicht mehr.
- **Runde starten:** Der Host startet für alle („Neue Runde für alle“ im Menü oder im Rundenende-Dialog). Ablauf siehe *Mehrspieler-Runde*.
- **Speicherung:** MongoDB-Collection `lobbies` bzw. Fallback `instance/lobbies.json` (Passwörter nur als Hash, Spieler-Tokens als SHA-256). Lobbys ohne Aktivität verfallen nach 24 Stunden.
- **Technik:** WebSocket `/ws/lobby/<code>` über `flask-sock`. Protokoll (JSON): Client → `join`, `settings`, `start`, `place {key, correct}`, `give {key, to}`, `rename`, `leave`, `close`, `ping`; Server → `welcome`, `state {lobby, hand}`, `error`, `left`, `closed`, `pong`. HTTP: `POST /api/lobbies`, `GET /api/lobbies/<code>`.

## Mehrspieler-Runde

Der Server führt die Runde (`lobbies/round.py`); der Browser prüft nur, ob ein Teil passt, und meldet das Ergebnis.

- **Jedes Teil nur einmal:** Ein gemeinsamer, gemischter Vorrat. Jedes Teil liegt entweder im Vorrat, im Inventar genau eines Spielers oder ist eingesetzt. Fremde Inventare sieht niemand (nur deren Größe); Teile anderer Spieler kann man nicht einsetzen.
- **Eingesetzte Teile synchron:** Jeder richtig eingesetzte Umriss erscheint sofort bei allen auf der Karte (mit Helligkeitsstufe und Grenze), dazu eine kurze Meldung „Name hat Frankreich eingesetzt“. Fortschritt `eingesetzt / gesamt` gilt für die Lobby.
- **Gemeinsame Leben:** Jeder Fehlwurf kostet der ganzen Lobby ein Leben. Bei 0 endet die Runde für alle.
- **Start und Nachschub:** Jeder Online-Spieler bekommt `Startteile`. Nach je `Nachschub alle` Treffern der *ganzen Lobby* bekommt jeder Online-Spieler `Nachschub` neue Teile (reihum verteilt, solange der Vorrat reicht). Hat niemand mehr ein Teil, der Vorrat aber schon, wird sofort nachgelegt.
- **Später beitreten:** Wer in eine laufende Runde kommt, bekommt `Startteile` aus dem Vorrat und sieht alle bisher eingesetzten Teile.
- **Verlassen / Verbindung weg:** Wer die Lobby verlässt, gibt seine Teile sofort zurück in den Vorrat. Bei einem Verbindungsabbruch bleiben sie 60 s reserviert (Neu laden behält das Inventar), danach gehen sie ebenfalls zurück.
- **Items senden:** Links am Rand steht ein Feld je Online-Mitspieler (Name, Anzahl seiner Umrisse). Umriss aufnehmen, dann ein Feld anklicken → der Umriss fliegt hinüber und liegt danach im Inventar des Mitspielers, der eine Meldung bekommt. Keine Einschränkung (Anzahl, Abklingzeit); nur an verbundene Spieler. Ist „Items senden“ aus, verschwindet die Spalte und der Server lehnt Senden ab.
- **Rundenende:** Gewonnen (alles eingesetzt) oder verloren (keine Leben) – der Dialog erscheint bei allen. Nur der Host sieht „Neue Runde für alle“. Eine Rangliste gibt es noch nicht.
- Der Rundenzustand wird mit der Lobby gespeichert und übersteht einen Server-Neustart.

## Speicher

| `MONGODB_URI` | Items | Lobbys |
|---|---|---|
| gesetzt | MongoDB, Collection `items` (Zähler atomar per `$inc`) | MongoDB, Collection `lobbies` (ein Dokument je Lobby) |
| leer (Standard lokal) | `instance/items.json` | `instance/lobbies.json` |

- Datenbankname: aus der URI (`…/worldmapguessr?…`), sonst `MONGODB_DB`, sonst `worldmapguessr`.
- Beim Start prüft der Server die Verbindung (Timeout 5 s). Ist MongoDB nicht erreichbar, bricht der Start ab – im Container startet Docker ihn dank `restart: unless-stopped` neu.
- `GET /api/health` → `{"status": "ok", "storage": "mongodb"}` bzw. 503, wenn MongoDB weg ist (nutzt auch der Docker-Healthcheck).
- **Übernahme der alten Statistik:** Beim ersten Start mit *leerer* `items`-Collection übernimmt der Server `instance/items.json` (anderer Pfad: `WMG_ITEM_IMPORT`) mit UIDs und Zählern. Von Hand geht es auch: `python -m worldmapguessr.storage.migrate_items instance/items.json` (mit gesetztem `MONGODB_URI`, mehrfach ausführbar).
- Lobbys laufen in einem einzigen Server-Prozess (WebSockets und Online-Status liegen im Speicher). MongoDB sorgt dafür, dass sie einen Neustart überstehen – mehrere Prozesse/Container parallel sind dafür nicht ausgelegt.
- Lokal mit der Server-Datenbank testen: SSH-Tunnel `ssh -L 27017:127.0.0.1:27017 user@server` und in der PyCharm-Startkonfiguration `MONGODB_URI=mongodb://wmg:PASSWORT@localhost:27017/worldmapguessr?authSource=worldmapguessr` setzen (setzt voraus, dass der Mongo-Stack den Port an `127.0.0.1` bindet).

## Deployment auf dem Server

Push auf `master` → GitHub Action (`.github/workflows/deploy.yml`) → per SSH auf dem Server `git pull`,
`docker compose build`, `docker compose up -d`. Der Container läuft im Netzwerk `local-web`, erreichbar auf Port 5002.

**MongoDB einmalig anbinden:**
1. Auf dem Server `/root/WorldMapGuessr/.env` anlegen (Vorlage: `.env.example`):
   `MONGODB_URI=mongodb://wmg:PASSWORT@mongo:27017/worldmapguessr?authSource=worldmapguessr`
   – `mongo` ist der Containername der Datenbank im Netzwerk `local-web`, `wmg`/`PASSWORT` der App-Benutzer aus dem Mongo-Stack.
2. Pushen (oder auf dem Server `docker compose up -d --build`).
3. Beim ersten Start mit leerer `items`-Collection übernimmt der Server `instance/items.json` (liegt über das Volume `./instance` im Container) mit allen UIDs und Zählern. Die Datei bleibt als Sicherung liegen.
4. Prüfen: `http://SERVER:5002/api/health` → `{"status": "ok", "storage": "mongodb"}`. Steht dort `"json"`, fehlt die `.env` bzw. `MONGODB_URI`.

Hinweise:
- Gunicorn läuft mit genau einem Worker (siehe Dockerfile) – nötig, weil Lobbys und WebSockets im Speicher dieses Prozesses leben.
- Ist MongoDB beim Start nicht erreichbar, bricht der Start nach 5 s ab; `restart: unless-stopped` startet den Container neu, bis die Datenbank da ist.
- Hinter einem Reverse Proxy muss WebSocket-Support aktiv sein (`/ws/…`).

## Item-Statistik

Jedes Spielteil ist auf dem Server als Item mit fester UID registriert. Der Browser meldet Ereignisse
über die API, der Server zählt – in MongoDB oder im Fallback in `instance/items.json`.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/items?kind=continent` bzw. `?kind=country` | Items mit UID und Zählern |
| GET | `/api/items/<uid>` | ein Item |
| POST | `/api/items/<uid>/events` | Body `{"event": "spawned" \| "correct" \| "incorrect"}` |

Ereignisse: `spawned` = ins Inventar gelegt, `correct` / `incorrect` = Einsetzversuch.

**Statistik-Seite:** <http://127.0.0.1:5000/stats> (oder das Balken-Symbol oben rechts im Spiel). Tabelle aller Items,
sortierbar per Klick auf den Spaltenkopf (zweiter Klick kehrt die Richtung um), Filter Kontinente/Staaten, Suche nach
Name, Code oder UID, Trefferquote je Item. Darunter die Rohdaten als JSON (gefiltert und sortiert wie die Tabelle);
ein Klick auf eine UID kopiert sie.
Ist der Server nicht erreichbar, läuft das Spiel ohne Tracking weiter (Warnung in der Konsole).

## Struktur

```
run.py                        Startpunkt Entwicklungsserver
requirements.txt              Laufzeit-Abhängigkeiten (Flask, flask-sock, gunicorn, pymongo)
requirements-dev.txt          + pytest, mongomock
Dockerfile, docker-compose.yml  Container für den Server (Netzwerk local-web, Port 5002)
.env.example                  Vorlage für die .env auf dem Server (MONGODB_URI)
.github/workflows/deploy.yml  Deployment per SSH bei Push auf master
instance/items.json           Item-Statistik (wird beim Start angelegt, nicht versioniert)
worldmapguessr/
  __init__.py                 App-Factory create_app(), registriert Kontinente als Items
  routes.py                   Seiten-Routen (/ und /stats)
  api.py                      JSON-API /api/items
  lobbies/codes.py            Lobby-Codes, URL-Konverter
  lobbies/settings.py         Lobbyeinstellungen prüfen (Grenzen, Arten, Namen)
  lobbies/store.py            Lobbys im Speicher, Beitritt, Passwort, Host-Aktionen, Verfall
  lobbies/hub.py              Live-Verbindungen, Online-Status, Host-Wechsel, Broadcast (mit eigenem Inventar)
  lobbies/round.py            Mehrspieler-Runde: Vorrat, Inventare, gemeinsame Leben, Nachschub
  lobbies/catalog.py          Teile-Katalog aus world.topo.json
  lobbies/ws.py               WebSocket-Endpunkt
  lobbies/api.py              HTTP-API /api/lobbies
  item_store.py               Items als JSON-Datei (Fallback)
  storage/factory.py          Backend-Wahl: MongoDB oder JSON
  storage/mongo.py            Verbindung, Ping
  storage/mongo_items.py      Items in MongoDB, Übernahme aus items.json
  storage/migrate_items.py    Übernahme von Hand (Kommandozeile)
  lobbies/persistence.py      Lobbys schreiben: JSON-Datei oder MongoDB
  templates/index.html        Spielseite (Jinja-Template)
  templates/stats.html        Statistik-Seite
  static/css/tokens.css       Farb-Tokens hell/dunkel (von allen Seiten genutzt)
  static/css/style.css        Karte & HUD
  static/css/stats.css        Statistik-Seite
  static/css/game.css         Inventar, Leben, Dialog
  static/css/menu.css         Menü
  static/css/lobby.css        Lobby (HUD, Menü-Bereich, Beitritt)
  static/js/main.js           Einstiegspunkt (ES-Module)
  static/js/map/map.js        Daten laden, Projektion, Ansicht (Drehung, Zoom, vertikal verschieben)
  static/js/map/renderer.js   Canvas-Zeichnung (Kontinente, eingesetzte Teile, Kleinststaat-Ringe)
  static/js/map/geometry.js   Anker, Fläche, Zerlegung in Teile (Sichtbarkeit, Datumsgrenze)
  static/js/map/gestures.js   Ziehen, Mausrad, Pinch, Doppelklick
  static/js/map/lod.js        Detailstufe je nach Zoom (presimplify-Gewichte)
  static/js/map/controls.js   Buttons, Tastatur, Koordinatenanzeige
  static/js/api/items-api.js  Tracking-Client für /api/items, Laden der Statistik
  static/js/stats/stats.js    Statistik-Seite: laden, filtern, sortieren
  static/js/stats/sort.js     Sortierung, Trefferquote
  static/js/stats/render.js   Tabelle, Zusammenfassung, JSON-Ansicht
  static/js/game/game.js      Spielablauf nach Konfiguration (Wellen, Einsetzen, Leben, Tracking)
  static/js/game/remote.js    Lobby-Runde: Server-Zustand auf Karte, Inventar, Leben abbilden
  static/js/menu/menu.js      Menü vor der Runde (Einzelspiel und Lobby)
  static/js/lobby/client.js   WebSocket-Client mit automatischem Wiederverbinden
  static/js/lobby/lobby-menu.js  Lobby-Bereich im Menü (Link, Spieler, Einstellungen, Rechte)
  static/js/lobby/identity.js Spieler-ID/Token und Name im Browser
  static/js/lobby/join-dialog.js  Name/Passwort-Dialog, Hinweis „Lobby nicht verfügbar/beendet“
  static/js/lobby/players-rail.js  Mitspieler-Spalte links: Umrisse an Mitspieler senden
  static/js/lobby/confirm.js  Bestätigungsdialog (Verlassen, Beenden)
  static/js/menu/config.js    Standardwerte, Grenzen, Teile-Pool einer Konfiguration
  static/js/menu/stepper.js   Zahlen-Stepper
  static/js/menu/item-picker.js  Einzelauswahl der Teile
  static/js/map/icon.js       Umriss-Icons (Inventar, Menü)
  static/js/game/random.js    Zufallsauswahl
  static/js/game/held-piece.js  Teil in der Hand, Einrast-Toleranz, Animationen
  static/js/game/inventory.js   Inventar-Slots
  static/js/game/lives.js     Lebensanzeige
  static/js/game/toast.js     Kurzmeldungen
  static/data/world.topo.json 7 Kontinente + 45 Staaten in einer Topologie (generiert)
tests/                        pytest: Item-Store, API, Lobbys, Mehrspieler-Runde – jeweils mit JSON und MongoDB (mongomock)
build/                        Erzeugung der Kartendaten (siehe unten)
.run/                         PyCharm-Startkonfigurationen (Server, Tests)
```

## Starten

### PyCharm

1. Ordner als Projekt öffnen.
2. Interpreter anlegen: *Settings → Python Interpreter → Add → Virtualenv* (`.venv`).
3. `requirements.txt` installieren (PyCharm schlägt es automatisch vor).
4. Startkonfiguration **WorldMapGuessr** oben rechts auswählen → Run/Debug.
5. <http://127.0.0.1:5000> öffnen.

Tests: Startkonfiguration **Tests** (vorher `requirements-dev.txt` installieren).

### Konsole

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python run.py
```

Tests: `pip install -r requirements-dev.txt` und `python -m pytest`.

Umgebungsvariablen: `WMG_HOST` (Standard `127.0.0.1`), `WMG_PORT` (Standard `5000`), `FLASK_DEBUG` (`1`/`0`).

Debug: In der Browser-Konsole ist der Spielzustand unter `WMG.game` erreichbar.

## Kartendaten neu erzeugen

```
cd build
npm install
pip install -r requirements.txt
npm run build
```

## Datenentscheidungen

- Quelle: Natural Earth 1:10m (`world-atlas`, dort auf ~400 m quantisiert), Regionen und deutsche Namen aus `world-countries`.
- Detailgrad: in Europa (-32…62° O, 27…83° N) volle 1:10m-Auflösung, außerhalb auf etwa 1:50m vereinfacht; Kleinstinseln außerhalb Europas entfallen. Beim Zeichnen filtert eine Detailstufe je nach Zoom (bis 4000 %).
- Staaten nur mit ihren europäischen Landesteilen (ohne Französisch-Guayana, Réunion, Karibische Niederlande …); Russland ganz.
- Vatikan: in den Quelldaten zu einer Linie zusammengefallen, daher ein vereinfachter, von Hand nachgezogener Umriss.
- Projektion: Natural Earth 1.
- Europa/Asien: Ural-Kamm → Ural-Fluss → Kaspisches Meer → Kaukasus; Türkei, Georgien, Armenien, Aserbaidschan, Kasachstan = Asien.
- Afrika/Asien: Grenze Ägypten/Israel (Sinai zählt zu Afrika). Nord-/Südamerika: Grenze Panama/Kolumbien.
- Kontinente über ±180° (Asien, Nordamerika, Ozeanien) werden im Rahmen 0…360° vereinigt, damit an der Datumsgrenze keine Nahtlinien entstehen – wichtig für die drehbare Karte. Antarktika bleibt unverändert.
