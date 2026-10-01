# Dateien und Ordner

```
run.py                        Startpunkt Entwicklungsserver
requirements.txt              Laufzeit-Abhängigkeiten (Flask, flask-sock, gunicorn, pymongo)
requirements-dev.txt          + pytest, mongomock
Dockerfile, docker-compose.yml  Container (Netzwerk local-web, Port 5002); der Build erzeugt die .gz-Dateien
.env.example                  Vorlage für die .env auf dem Server (MONGODB_URI) – die .env selbst nicht versionieren
.github/workflows/deploy.yml  Deployment per SSH bei Push auf master
.run/                         PyCharm-Startkonfigurationen (Server, Tests)
instance/                     Laufzeitdaten ohne MongoDB (items.json, lobbies.json; nicht versioniert)
docs/                         Dokumentation je Thema (Übersicht: README.md)
build/                        Erzeugung der Kartendaten (docs/kartendaten.md)
web/                          Bündel für JS/CSS (esbuild): build.mjs, d3.js (genutzte d3-Funktionen) – docs/server.md
tests/                        pytest – Item-Store, API, Lobbys, Runde, Punkte, Sprache, Komprimierung; JSON und MongoDB (mongomock)

worldmapguessr/
  __init__.py                 App-Factory create_app(): Speicher, Kartendaten, Lobbys, Routen, Sprache, Komprimierung
  routes.py                   Seiten (/ , /CODE, /stats) und Kartendaten /data/<version>/…
  api.py                      JSON-API /api/items (mit englischen Namen), /api/health
  compression.py              Brotli/gzip: vorkomprimierte statische Dateien, HTML/JSON-Antworten
  assets.py                   JS/CSS je Seite: Bündel (static/dist) oder Quelldateien
  pages.json                  Einstiegspunkte je Seite (JS, CSS, vorzuladende Schriften)
  precompress.py              Kommandozeile: alle .gz-Fassungen erzeugen (Docker-Build)
  i18n/__init__.py            Sprache wählen (Cookie, Browser), t() für Vorlagen, Wörterbuch für den Browser
  i18n/de.json, en.json       Texte je Sprache
  difficulty.py               Item-Schwierigkeit (0–10) und Reihenfolge nach dem Regler
  item_events.py              Item-Statistik aus Runden in den Item-Store schreiben
  item_store.py               Items als JSON-Datei (Fallback)
  map_data.py                 Kartendaten: index.json lesen, Startgröße, Item-Katalog je Gruppe
  storage/                    Backend-Wahl (factory), MongoDB (mongo, mongo_items), Übernahme (migrate_items)
  lobbies/codes.py            Lobby-Codes, URL-Konverter
  lobbies/settings.py         Lobbyeinstellungen prüfen (Grenzen, Arten, Namen)
  lobbies/store.py            Lobbys: aktiv im Speicher, inaktiv gespeichert; Beitritt, Host-Aktionen, Verfall
  lobbies/hub.py              Live-Verbindungen, Online-Status, Host-Wechsel, Entfernen, Pflege, Broadcast
  lobbies/round.py            Runde: Vorrat, Inventare, gemeinsame Leben, Nachschub, Timer, Senden
  lobbies/scoring.py          Punkte (Treffer, Tempo, Fehlwurf, Teambonus, Multiplikator)
  lobbies/persistence.py      Lobbys speichern: JSON-Datei oder MongoDB (Index, Laden)
  lobbies/ws.py               WebSocket-Endpunkt und Protokoll
  lobbies/api.py              HTTP-API /api/lobbies
  templates/index.html        Spielseite (Gerüst, bindet die Teile ein)
  templates/partials/         hud (Karte, Statusleiste, Inventar, Nachrichten, Steuerung), menu, home, dialogs, settings
  templates/stats.html        Statistik-Seite
  static/data/map/            Kartendaten mit Detailstufen (generiert)
  static/sw.js                Service Worker: Bündel und Kartendaten im Cache (nur mit Bündel)
  static/fonts/               Schriften (Cinzel, Instrument Sans, IBM Plex Mono; OFL)
  static/dist/                Bündel (generiert, nicht versioniert)
  static/css/                 fonts (Schriften), tokens (Farben hell/dunkel), style (Karte, HUD), game, menu, lobby, feed,
                              map-picker, home, settings, stats
  static/js/
    main.js                   Einstiegspunkt: Karte laden, Navigation (Hauptmenü, Spiel), Lobby verbinden
    i18n/index.js             t(), parts(), Zahlenformat, Server-Fehler übersetzen, Sprache wechseln
    ui/loading-screen.js      Ladebildschirm
    ui/feed.js                Nachrichtenleiste (Meldungen, Punkte, Chat)
    ui/cosmos.js              Kosmos-Hintergrund (Sterne, Nebel) hinter der Karte und der Statistik
    map/map.js                Startdaten laden, Ansicht (Drehung, Zoom, Verschieben), Projektionswechsel
    map/renderer.js           Canvas-Zeichnung aus Kacheln (Zellfarben, Küsten, Grenzen, Wasser, Kleinststaat-Ringe)
    map/labels.js             Namen eingesetzter Items (gebogen nach der Form, keine Überschneidungen)
    map/labels-core.js        Kandidaten je Item (Maske, Mittellinie, Größe) – ohne DOM, auch im Worker
    map/labels-worker.js      Worker für labels-core.js (OffscreenCanvas, eigene Schrift-Instanz)
    map/tiles.js              Kacheln: Detailstufe je Zoom, Laden, Ersatz aus gröberer Stufe, Speichergrenze
    map/tile-format.js        Binäre Kacheln lesen (Punkte, Dreiecke, Linien; build/5-binary.mjs)
    map/items.js              Item-Umrisse: Startstufe für alle, feinere Stufe je Item bei Bedarf
    map/project.js            Schnelle Projektion, Sichtbarkeitstest
    map/projections.js        Natural Earth / Equal Earth (Einstellung, Bezeichnungen)
    map/projection-defs.js    Formeln und d3-Fabriken der Projektionen (ohne Einstellungen, für Worker)
    map/relief.js             Geländeschummerung
    map/water.js              Flüsse und Seen
    map/schemes.js            Farbschemata A/B/C
    map/quality.js            Kartenqualität Niedrig/Mittel/Hoch
    map/geometry.js           Zerlegung eines Items in Teile (Mittelpunkt, Radius)
    map/icon.js               Umriss-Icons (Inventar, Menü)
    map/gestures.js, controls.js, keyboard.js   Ziehen/Mausrad/Pinch, Knöpfe und Tasten, Bewegen per Tastatur
    game/game.js              Spielablauf (Aufnehmen, Einsetzen, Senden, Rundenende)
    game/remote.js            Server-Runde auf Karte, Inventar, Leben, Meldungen abbilden
    game/score-view.js        Punkte im Rundenende-Dialog
    game/held-piece.js, inventory.js, lives.js, refill-meter.js, timer-meter.js, difficulty.js
    menu/menu.js              Spielmenü: Regeln links, Karte rechts
    menu/presets.js, config.js, mode-picker.js, map-picker.js, map-presets.js, item-picker.js,
    menu/stepper.js, toggle.js, ttl-field.js, difficulty-slider.js
    home/home.js, code-dialog.js   Hauptmenü, Lobby-Code eingeben
    settings/settings-dialog.js, prefs.js, quality-field.js   Einstellungen
    lobby/index.js            Lobby-Teile, die main.js erst bei Bedarf lädt
    lobby/client.js           WebSocket-Client mit Wiederverbinden
    lobby/lobby-menu.js       Lobby-Bereich im Menü (Link, Spieler, Entfernen, Einstellungen)
    lobby/identity.js, join-dialog.js, confirm.js, rules-text.js, players-rail.js
    stats/stats.js, sort.js, render.js   Statistik-Seite
    api/items-api.js          /api/items laden
```
