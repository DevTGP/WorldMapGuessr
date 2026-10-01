# Server: Speicher, Komprimierung, Deployment

## Speicher

| `MONGODB_URI` | Items | Lobbys |
|---|---|---|
| gesetzt | MongoDB, Collection `items` (Zähler atomar per `$inc`) | MongoDB, Collection `lobbies` (ein Dokument je Lobby) |
| leer (Standard lokal) | `instance/items.json` | `instance/lobbies.json` |

- Datenbankname: aus der URI (`…/worldmapguessr?…`), sonst `MONGODB_DB`, sonst `worldmapguessr`.
- Beim Start prüft der Server die Verbindung (Timeout 5 s). Ist MongoDB nicht erreichbar, bricht der Start ab – im Container startet Docker ihn dank `restart: unless-stopped` neu.
- `GET /api/health` → `{"status": "ok", "storage": "mongodb"}` bzw. 503, wenn MongoDB weg ist (nutzt auch der Docker-Healthcheck).
- **Übernahme der alten Statistik:** Beim ersten Start mit *leerer* `items`-Collection übernimmt der Server `instance/items.json` (anderer Pfad: `WMG_ITEM_IMPORT`). Von Hand: `python -m worldmapguessr.storage.migrate_items instance/items.json` (mit gesetztem `MONGODB_URI`, mehrfach ausführbar).
- Aktive Lobbys, WebSockets und Online-Status liegen im Speicher eines einzigen Server-Prozesses; inaktive Lobbys nur in der Datenbank (siehe [lobbys.md](lobbys.md#inaktive-lobbys)). Mehrere Prozesse/Container parallel sind dafür nicht ausgelegt.
- Lokal mit der Server-Datenbank testen: SSH-Tunnel `ssh -L 27017:127.0.0.1:27017 user@server` und in der PyCharm-Startkonfiguration `MONGODB_URI=mongodb://wmg:PASSWORT@localhost:27017/worldmapguessr?authSource=worldmapguessr` setzen (setzt voraus, dass der Mongo-Stack den Port an `127.0.0.1` bindet).

## JS und CSS: Bündel

`web/build.mjs` (esbuild) bündelt je Seite (`worldmapguessr/pages.json`: Spiel, Statistik) JS und CSS nach
`worldmapguessr/static/dist/`:

- eine JS-Datei je Seite (ES-Modul, minifiziert) plus geteilte Teile; die Lobby-Teile (`static/js/lobby/index.js`) lädt `main.js` per `import()` erst bei Bedarf bzw. im Leerlauf nach dem Start,
- eine CSS-Datei je Seite, Schriften mitkopiert,
- d3 nur mit den genutzten Funktionen (`web/d3.js`; neue d3-Funktionen dort ergänzen),
- Worker (`pages.json` → `workers`, z. B. `map/labels-worker.js`) als eigene Einstiege; die Seite bekommt ihre URLs in `WMG.workers`. Ohne Bündel lädt der Worker dasselbe d3-Skript wie die Seite.
- Dateinamen mit Inhalts-Hash, dazu `manifest.json` (Quelle → Datei, Teile zum Vorladen, Build-Kennung).

`worldmapguessr/assets.py` wählt je Seite: **Bündel**, wenn `dist/manifest.json` existiert und nicht älter ist als die Quellen in `static/js|css|fonts`; sonst die **Quelldateien einzeln** und d3 vom CDN (wie ohne Build). `WMG_BUNDLE=1` erzwingt das Bündel (Docker), `WMG_BUNDLE=0` die Quelldateien.

| | Vorher | Bündel |
|---|---|---|
| Requests beim Start (lokal, kalt) | 106 | 48 |
| JS übertragen | 189 kB gzip (d3 92 + 63 Dateien) | 61 kB Brotli |
| Zweiter Aufruf | 63 Rückfragen (304) | keine (immutable bzw. Service Worker) |

Lokal: Ohne Build läuft alles wie bisher. Bündel testen: `cd web && npm ci && npm run build`, danach `python run.py` (eine Änderung an JS/CSS schaltet bis zum nächsten Build automatisch auf die Quelldateien zurück). Im Docker-Build baut eine Node-Stufe das Bündel.

## Zwischenspeichern

| Pfad | Cache-Control | Grund |
|---|---|---|
| `/static/dist/…` | `max-age=31536000, immutable` | Hash im Namen |
| `/data/<version>/…` | `max-age=31536000, immutable` | Version im Pfad |
| `/static/…` (sonst) | `no-cache` + ETag | Quelldateien ohne Hash |
| `/sw.js` | `no-cache` | Service Worker muss Updates sofort sehen |

**Service Worker** (`static/sw.js`, nur mit Bündel registriert als `/sw.js?b=<Build>&m=<Kartenversion>`): hält `/static/dist/…` und `/data/<version>/…` im Cache Storage und liefert sie ohne Netz (cache first). Ein neuer Build bzw. neue Kartendaten ergeben einen neuen Service Worker; der löscht beim Aktivieren die alten Caches. Seite, API und WebSocket gehen unverändert ans Netz. Einmal angesehene Kacheln bleiben bis zur nächsten Kartenversion gespeichert.

**Vorladen:** Die Spielseite lädt Schriften (`preload`), die geteilten JS-Teile (`modulepreload`) und die Startdaten der Karte (`preload as=fetch`: Index, grobe Items, Kacheln Stufe 0; `map_data.start_files`) gleich mit dem HTML, statt sie erst nach dem JavaScript anzufordern.

## Komprimierung

`worldmapguessr/compression.py`:

- **Statische Dateien und Kartendaten** (JSON, JS, CSS, HTML, SVG, TXT ab 512 Byte) werden vorkomprimiert ausliefert: Brotli (Stufe 11), wenn der Browser `br` meldet, sonst gzip (Stufe 9), sonst die Originaldatei (`Content-Encoding`, `Vary: Accept-Encoding`). Bilder (JPEG) und Schriften (WOFF2) sind schon komprimiert.
  - Die `.br`- und `.gz`-Fassungen liegen neben den Dateien. Der Docker-Build erzeugt sie (`python -m worldmapguessr.precompress`); ohne Build erzeugt sie der Server beim Start im Hintergrund bzw. beim ersten Abruf und baut sie neu, wenn die Quelle neuer ist. Reste abgebrochener Läufe (`*.gz|br.<pid>.tmp`) räumt der nächste Lauf weg.
  - Sie sind nicht versioniert (`.gitignore`) und kommen nicht ins Docker-Image aus dem Arbeitsordner (`.dockerignore`), sondern werden dort frisch erzeugt.
  - Ohne das Python-Paket `brotli` bleibt es bei gzip.
  - Einsparung gegenüber gzip: Items `i0.json` 93 → 74 kB, Index 18 → 13 kB, JS 10–15 %, CSS 11 %.
- **Seiten und API-Antworten** (HTML, JSON) komprimiert `gzip_response` nach jeder Anfrage (Brotli Stufe 5 bzw. gzip Stufe 6), ab 512 Byte.
- Tests: `tests/test_compression.py`, `tests/test_assets.py`, `tests/test_i18n.py`.

## Deployment auf dem Server

Push auf `master` → GitHub Action (`.github/workflows/deploy.yml`) → per SSH auf dem Server `git pull`,
`docker compose build`, `docker compose up -d`. Das Dockerfile hat zwei Stufen: `node:22-slim` bündelt JS/CSS (`web/`),
`python:3.14-slim` übernimmt `static/dist` und erzeugt die komprimierten Fassungen. Der Container läuft im Netzwerk `local-web`, erreichbar auf Port 5002.

**MongoDB einmalig anbinden:**
1. Auf dem Server `/root/WorldMapGuessr/.env` anlegen (Vorlage: `.env.example`, die `.env` selbst gehört nicht ins Repository):
   `MONGODB_URI=mongodb://wmg:PASSWORT@mongo:27017/worldmapguessr?authSource=worldmapguessr`
   – `mongo` ist der Containername der Datenbank im Netzwerk `local-web`, `wmg`/`PASSWORT` der App-Benutzer aus dem Mongo-Stack.
2. Pushen (oder auf dem Server `docker compose up -d --build`).
3. Beim ersten Start mit leerer `items`-Collection übernimmt der Server `instance/items.json` (Volume `./instance`). Die Datei bleibt als Sicherung liegen.
4. Prüfen: `http://SERVER:5002/api/health` → `{"status": "ok", "storage": "mongodb"}`. Steht dort `"json"`, fehlt die `.env` bzw. `MONGODB_URI`.

Hinweise:
- Gunicorn läuft mit genau einem Worker (siehe Dockerfile) – nötig, weil Lobbys und WebSockets im Speicher dieses Prozesses leben.
- Hinter einem Reverse Proxy muss WebSocket-Support aktiv sein (`/ws/…`). Komprimiert der Proxy selbst, ist das unschädlich: Bereits komprimierte Antworten tragen `Content-Encoding` und werden nicht doppelt komprimiert.
