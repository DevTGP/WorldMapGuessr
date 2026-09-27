# Item-Statistik

Jedes Item ist auf dem Server mit fester UID registriert. Gezählt wird in MongoDB oder im Fallback in
`instance/items.json`.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/items?kind=continent` bzw. `?kind=country` | Items mit UID, Zählern, `difficulty` und `nameEn` |
| GET | `/api/items/<uid>` | ein Item |
| POST | `/api/items/<uid>/events` | Body `{"event": "spawned" \| "correct" \| "incorrect"}` (für Werkzeuge und Tests) |

Es zählt allein der Server – im Einzelspiel (Solo-Lobby) genauso wie in Lobbys (`lobbies/round.py` sammelt die
Ereignisse, `item_events.py` schreibt sie):

| Zähler | Wann |
|---|---|
| `spawned` (Spawns) | Server teilt ein Item aus dem Vorrat einem Spieler aus (Start, Nachschub, Nachlegen). **Nicht:** an Mitspieler gesendete Items, Neuladen/Wiederverbinden, zweiter Tab. Ein Item, das zurück in den Vorrat ging und neu ausgeteilt wird, zählt erneut. |
| `correct` (Eingesetzt) | vom Server angenommener richtiger Versuch |
| `incorrect` (Fehlplatziert) | vom Server angenommener falscher Versuch |

**Item-Schwierigkeit** 0 (leicht) … 10 (schwer) = 10 × (1 − (75 % Eingesetzt/Spawns + 25 % Trefferquote)), auf eine
Nachkommastelle. Ohne Daten gilt 5; fehlt eine der beiden Quoten, zählt die andere allein; Eingesetzt/Spawns wird
auf 100 % begrenzt. Sie ordnet die Items (Reihenfolge-Regler) und bestimmt die Punkte eines Treffers
([punkte.md](punkte.md)).

Hinweis: In frühen Versionen haben in Lobbys die Browser gezählt – ältere Zahlen können dort Spawns doppelt
enthalten (Neuladen, gesendete Items).

## Statistik-Seite

<http://127.0.0.1:5000/stats> (im Hauptmenü „Statistik“), in der Sprache der Seite (Namen auf Englisch aus `nameEn`).

- Tabelle aller Items, sortierbar per Klick auf den Spaltenkopf (zweiter Klick kehrt die Richtung um), Filter Kontinente/Staaten, Suche nach Name, Code oder UID.
- Oben Kacheln mit den Summen (Spawns, Eingesetzt, Fehlplatziert), den Quoten **Eingesetzt / Spawns** und **Trefferquote** sowie **Ø Schwierigkeit** – jeweils für den aktuellen Filter; dieselben Summen stehen als letzte Tabellenzeile.
- Darunter die Rohdaten als JSON (gefiltert und sortiert wie die Tabelle, unverändert wie von der API); ein Klick auf eine UID kopiert sie.
