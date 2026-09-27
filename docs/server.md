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

## Komprimierung

`worldmapguessr/compression.py`:

- **Statische Dateien und Kartendaten** (JSON, JS, CSS, HTML, SVG, TXT ab 512 Byte) werden als vorkomprimiertes gzip (Stufe 9) ausgeliefert, wenn der Browser gzip meldet (`Content-Encoding: gzip`, `Vary: Accept-Encoding`); sonst die Originaldatei. Bilder (JPEG) sind schon komprimiert.
  - Die `.gz`-Fassungen liegen neben den Dateien. Der Docker-Build erzeugt sie (`python -m worldmapguessr.precompress`); ohne Build erzeugt sie der Server beim Start im Hintergrund bzw. beim ersten Abruf und baut sie neu, wenn die Quelle neuer ist. Reste abgebrochener Läufe (`*.gz.<pid>.tmp`) räumt der nächste Lauf weg.
  - `.gz`-Dateien sind nicht versioniert (`.gitignore`) und kommen nicht ins Docker-Image aus dem Arbeitsordner (`.dockerignore`), sondern werden dort frisch erzeugt.
  - Einsparung: Startpaket der Karte 419 kB → 140 kB, Wasser-Kacheln ≈ 2,3×.
- **Seiten und API-Antworten** (HTML, JSON) komprimiert `gzip_response` nach jeder Anfrage (Stufe 6), ab 512 Byte.
- Tests: `tests/test_compression.py`, `tests/test_i18n.py`.

## Deployment auf dem Server

Push auf `master` → GitHub Action (`.github/workflows/deploy.yml`) → per SSH auf dem Server `git pull`,
`docker compose build`, `docker compose up -d`. Der Container läuft im Netzwerk `local-web`, erreichbar auf Port 5002.

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
