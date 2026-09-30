# Item-Statistik

Jedes Item ist auf dem Server mit fester UID registriert. Gezählt wird in MongoDB oder im Fallback in
`instance/items.json`.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/items?kind=continent` bzw. `?kind=country` | Items mit UID, Zählern, `duration`, `difficulty`, `nameEn` und `region` (Kontinent-Code) |
| GET | `/api/items/<uid>` | ein Item |
| POST | `/api/items/<uid>/events` | Body `{"event": "spawned" \| "correct" \| "incorrect"}` oder `{"event": "waited", "value": n}` (für Werkzeuge und Tests) |

Es zählt allein der Server – im Einzelspiel (Solo-Lobby) genauso wie in Lobbys (`lobbies/round.py` sammelt die
Ereignisse, `item_events.py` schreibt sie):

| Zähler | Wann |
|---|---|
| `spawned` (Spawns) | Server teilt ein Item aus dem Vorrat einem Spieler aus (Start, Nachschub, Nachlegen). **Nicht:** an Mitspieler gesendete Items, Neuladen/Wiederverbinden, zweiter Tab. Ein Item, das zurück in den Vorrat ging und neu ausgeteilt wird, zählt erneut. |
| `correct` (Eingesetzt) | vom Server angenommener richtiger Versuch |
| `incorrect` (Fehlplatziert) | vom Server angenommener falscher Versuch |
| `waited`, `waitedCount` | Sobald ein ausgeteiltes Item sitzt oder verloren geht: `waited` += Zahl der Items, die die **ganze Lobby** seit seinem Austeilen richtig eingesetzt hat (ohne das Item selbst), `waitedCount` += 1. „Verloren“: zurück in den Vorrat (Timer, Fehlwurf mit „Fehlwurf kostet das Item“, Verlassen, Entfernen), Rundenende, Neustart oder Löschen der Lobby. Senden an Mitspieler ändert nichts – die Zählung läuft ab dem Austeilen weiter. |

Beispiel: Du bekommst Frankreich, als die Lobby 12 Items eingesetzt hat. Bis du es richtig einsetzt, setzen alle
zusammen 7 weitere ein → `waited` +7. **Ø bis platziert** = `waited` / `waitedCount` (`duration` in der API).
Items, die vor dieser Version ausgeteilt wurden, haben dafür noch keine Daten.

**Item-Schwierigkeit** 0 (leicht) … 10 (schwer), auf eine Nachkommastelle (`worldmapguessr/difficulty.py`):

| Anteil | Gewicht | Wert (0 leicht … 1 schwer) |
|---|---|---|
| Platzierungsrate | 20 % | 1 − Eingesetzt / Spawns (auf 0 … 1 begrenzt) |
| Trefferquote | 30 % | 1 − Eingesetzt / (Eingesetzt + Fehlplatziert) |
| Dauer | 50 % | d / (d + 5), d = Ø bis platziert (d = 5 → 0,5; d = 15 → 0,75; d = 0 → 0) |

Schwierigkeit = 10 × gewichtete Summe. Fehlen Daten für einen Anteil (nie gespawnt, nie versucht, noch keine
Dauer), wird er weggelassen und die übrigen Gewichte werden hochgerechnet; ganz ohne Daten gilt 5. Die
Schwierigkeit ordnet die Items (Reihenfolge-Regler) und bestimmt die Punkte eines Treffers ([punkte.md](punkte.md)).

Hinweis: In frühen Versionen haben in Lobbys die Browser gezählt – ältere Zahlen können dort Spawns doppelt
enthalten (Neuladen, gesendete Items).

## Statistik-Seite

<http://127.0.0.1:5000/stats> (im Hauptmenü „Statistik“), in der Sprache der Seite (Namen auf Englisch aus `nameEn`).

- Tabelle aller Items, sortierbar per Klick auf den Spaltenkopf (zweiter Klick kehrt die Richtung um), Filter Art (Kontinente/Staaten) und Kontinent (kombinierbar), Suche nach Name oder Code. Schmale Spalten ohne „Zuletzt“ und UID (beides steht in den Rohdaten).
- Oben Kacheln mit den Summen (Spawns, Eingesetzt, Fehlplatziert), den Quoten **Eingesetzt / Spawns** und **Trefferquote**, **Ø bis platziert** (über alle gemessenen Spawns) sowie **Ø Schwierigkeit** – jeweils für den aktuellen Filter; dieselben Summen stehen als letzte Tabellenzeile.
- Darunter die Rohdaten als JSON (gefiltert und sortiert wie die Tabelle, unverändert wie von der API).
