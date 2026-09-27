# WorldMapGuessr

Geografie-Spiel: Kontinente und Länder (später Bundesländer und Regionen) auf einer Weltkarte an die richtige
Stelle setzen – allein oder mit anderen in einer Lobby. Oberfläche auf Deutsch und Englisch.

**Stand:** Punkte am Rundenende, Sprache Deutsch/Englisch, inaktive Lobbys, Spieler entfernen, komprimierte Auslieferung.

## Dokumentation

| Thema | Datei |
|---|---|
| Bedienung: Hauptmenü, Einstellungen, Steuerung, Einsetzen, Nachrichtenleiste | [docs/bedienung.md](docs/bedienung.md) |
| Spielmenü: Kartenauswahl, Modus, Erweiterte Einstellungen | [docs/spielmenue.md](docs/spielmenue.md) |
| Spielmodi, Regeln, Balancing, Voreinstellungen | [docs/spielmodi.md](docs/spielmodi.md) |
| Punkte | [docs/punkte.md](docs/punkte.md) |
| Einzelspiel, Lobbys, Mehrspieler-Runde, inaktive Lobbys, Protokoll | [docs/lobbys.md](docs/lobbys.md) |
| Sprache (Deutsch/Englisch), Begriffe | [docs/sprache.md](docs/sprache.md) |
| Item-Statistik und Statistik-Seite | [docs/statistik.md](docs/statistik.md) |
| Speicher, Komprimierung, Deployment | [docs/server.md](docs/server.md) |
| Kartendaten erzeugen, Detailstufen, Datenentscheidungen | [docs/kartendaten.md](docs/kartendaten.md) |
| Renderer: Messungen und Optimierungsmöglichkeiten | [docs/renderer-performance.md](docs/renderer-performance.md) |
| Dateien und Ordner | [docs/struktur.md](docs/struktur.md) |

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

Debug: In der Browser-Konsole sind Spiel, Karte und Menüs unter `WMG.game`, `WMG.map`, `WMG.menu` erreichbar.
