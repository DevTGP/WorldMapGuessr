# Punkte

Der Server rechnet die Punkte (`worldmapguessr/lobbies/scoring.py`) – im Einzelspiel (Solo-Lobby) genauso wie
in Lobbys. Jeder Spieler sammelt eigene Punkte; der Bonus am Rundenende gehört dem Team.

## Werte

| Ereignis | Punkte |
|---|---|
| Treffer | 100 + Item-Schwierigkeit × 20 (Schwierigkeit 0 … 10, aus der [Statistik](statistik.md)) + Tempo-Bonus bis 50 |
| Fehlwurf | −30 |
| Rundenende, nur bei Sieg | +50 je übrigem Leben, +200 Siegbonus (Team) |

- **Tempo-Bonus:** Zeit seit der letzten eigenen Aktion (Einsetzversuch), dem Beitritt, dem Rundenstart, dem Wiederverbinden bzw. dem Ende einer Pause – bis 5 s volle 50 Punkte, danach linear weniger, ab 45 s keiner. Im Einzelspiel zählt eine Pause (Menü, Dialog, Hauptmenü, Tab im Hintergrund) nicht mit – auch ohne Timer.
- **Schwierigkeit:** wird zu Rundenbeginn für alle Items der Runde festgehalten, damit sich der Wert eines Items während der Runde nicht ändert.
- **Multiplikator** (×1 … ×2) auf alle Werte, aus Modus und Stufe:

  | Modus | Faktor | | Stufe | Faktor |
  |---|---|---|---|---|
  | Casual | 1 | | Sehr einfach | 1 |
  | Vereinfachter Fokus | 1,1 | | Einfach | 1,1 |
  | Fokus | 1,25 | | Normal | 1,2 |
  | Tempo | 1,25 | | Schwer | 1,3 |
  | Hardcore | 1,5 | | Sehr schwer | 1,4 |

  Modus × Stufe, höchstens 2. Eigene Einstellungen: 1 + 0,2 (Timer) + 0,1 (Kein Zurücklegen) + 0,1 (Fehlwurf kostet das Item) + 0,2 (Items gedreht).
- Beispiel: Hardcore, Normal (×1,8), Item-Schwierigkeit 6, nach 3 s eingesetzt → (100 + 120 + 50) × 1,8 = 486.

## Anzeige

- **Nachrichtenleiste:** jede Meldung zu Treffer und Fehlwurf zeigt die Punkte des Spielers („+234 P.“ / „−30 P.“).
- **Rundenende-Dialog:** Einzelspiel mit Aufschlüsselung (Treffer inkl. Tempo, Fehlwürfe, übrige Leben, Siegbonus, Summe, Multiplikator); Lobby mit Rangliste (Platz, Name, Treffer ✓ / Fehlwürfe ✗, Punkte; eigene Zeile hervorgehoben), Teambonus und Teamsumme. Code: `static/js/game/score-view.js`.
- **Hauptmenü:** je Spiel die Punkte der Runde (Lobby: Team und eigene).

## Daten

Die Runde (`round`) enthält `scores` (je Spieler `{points, hits, misses}`), `pace` (Start der Tempo-Uhr je Spieler),
`diff` (Schwierigkeit je Item) und am Ende `bonus` (`{lives, win, total}`). Für alle sichtbar kommt
`score = {players, bonus, total, mult}` mit dem Rundenzustand; `placed`/`miss`-Ereignisse tragen `points`.
