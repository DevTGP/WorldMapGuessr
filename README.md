# WorldMapGuessr

Geografie-Spiel: Kontinente, Länder, Bundesländer und Regionen auf einer Weltkarte korrekt einsetzen.

**Stand:** Schritt 6: Lobbys (kurze Links, Einstellungen, Host, jederzeit beitreten). Das gemeinsame Spielen selbst folgt.

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
- **Einstellungen (nur Host):** Spielkonfiguration wie im Einzelspiel, max. Spielerzahl (Standard 8), Passwort (setzen/entfernen). Gäste sehen alles live, aber gesperrt.
- **Host-Wechsel:** Ist der Host länger als 10 s getrennt, übernimmt der am längsten anwesende Spieler.
- **Verlassen (alle):** „Lobby verlassen“ im Lobby-Bereich des Menüs → Bestätigung → zurück zum Einzelspiel. Der Spieler wird aus der Lobby entfernt, seine gespeicherte Identität gelöscht; über den Link kann er später als neuer Spieler wieder beitreten. Verlässt der Host, geht die Rolle sofort an den am längsten anwesenden Online-Spieler. Verlässt der letzte Spieler, wird die Lobby gelöscht.
- **Beenden (nur Host):** „Lobby beenden“ → Bestätigung → die Lobby wird für alle gelöscht. Alle anderen sehen „Lobby beendet“ mit dem Weg zum Einzelspiel; der Link funktioniert danach nicht mehr.
- **Runde starten:** Der Host startet für alle. Alle bekommen dieselbe Konfiguration und denselben Zufalls-Seed, also dieselbe Reihenfolge der Teile. Wie die Spieler sich gegenseitig beeinflussen, ist noch nicht umgesetzt – jeder spielt vorerst für sich.
- **Speicherung:** `instance/lobbies.json` (Passwörter nur als Hash, Spieler-Tokens als SHA-256). Lobbys ohne Aktivität verfallen nach 24 Stunden.
- **Technik:** WebSocket `/ws/lobby/<code>` über `flask-sock`. Protokoll (JSON): Client → `join`, `settings`, `start`, `rename`, `leave`, `close`, `ping`; Server → `welcome`, `state`, `error`, `left`, `closed`, `pong`. HTTP: `POST /api/lobbies`, `GET /api/lobbies/<code>`.

## Item-Statistik

Jedes Spielteil ist auf dem Server als Item mit fester UID registriert. Der Browser meldet Ereignisse
über die API, der Server zählt und schreibt `instance/items.json` (atomar, thread-sicher).

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
requirements.txt              Laufzeit-Abhängigkeiten (Flask)
requirements-dev.txt          + pytest
instance/items.json           Item-Statistik (wird beim Start angelegt, nicht versioniert)
worldmapguessr/
  __init__.py                 App-Factory create_app(), registriert Kontinente als Items
  routes.py                   Seiten-Routen (/ und /stats)
  api.py                      JSON-API /api/items
  lobbies/codes.py            Lobby-Codes, URL-Konverter
  lobbies/settings.py         Lobbyeinstellungen prüfen (Grenzen, Arten, Namen)
  lobbies/store.py            Lobbys als JSON, Beitritt, Passwort, Host-Aktionen, Verfall
  lobbies/hub.py              Live-Verbindungen, Online-Status, Host-Wechsel, Broadcast
  lobbies/ws.py               WebSocket-Endpunkt
  lobbies/api.py              HTTP-API /api/lobbies
  item_store.py               JSON-Datei mit UIDs und Zählern
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
  static/js/menu/menu.js      Menü vor der Runde (Einzelspiel und Lobby)
  static/js/lobby/client.js   WebSocket-Client mit automatischem Wiederverbinden
  static/js/lobby/lobby-menu.js  Lobby-Bereich im Menü (Link, Spieler, Einstellungen, Rechte)
  static/js/lobby/identity.js Spieler-ID/Token und Name im Browser
  static/js/lobby/join-dialog.js  Name/Passwort-Dialog, Hinweis „Lobby nicht verfügbar/beendet“
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
tests/                        pytest: Item-Store, API, Lobbys
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
