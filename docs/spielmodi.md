# Spielmodi und Schwierigkeit

Im Menü wählt man einen **Modus** und eine **Schwierigkeit** (Sehr einfach … Sehr schwer). Das setzt alle
Regelwerte; unter „Erweiterte Einstellungen“ lassen sie sich einzeln ändern – dann gilt „Eigene
Einstellungen“, ein Klick auf Modus oder Stufe setzt wieder die Voreinstellung. Quelle der Werte:
`worldmapguessr/static/js/menu/presets.js`.

## Modi

| Option | Casual | Vereinf. Fokus | Fokus | Tempo | Hardcore |
|---|---|---|---|---|---|
| Timer (Wegnahme) | – | – | – | ✓ | ✓ |
| Zurücklegen | ✓ | ✓ | – | ✓ | – |
| Fehlwurf gibt das Item ab (zurück in den Vorrat) | – | ✓ | ✓ | – | ✓ |
| Fehlwurf kostet 1 Leben | ✓ | ✓ | ✓ | ✓ | ✓ |
| Inventar kann leer werden | nie | nie | nie | unter Mindesttempo | unter Mindesttempo |

## Regeln

- **Verloren:** 0 Leben – oder alle Inventare der Lobby sind leer, solange der Vorrat noch Items hat (geprüft nach dem Nachschub).
- **Gewonnen:** alle Items eingesetzt.
- **Endspurt:** Ist der Vorrat zum ersten Mal leer, nimmt der Timer nichts mehr weg und ein Fehlwurf behält das Item – bis Rundenende. Das Inventar wird am Schluss also nur durch Treffer leer.
- **Balancing** (S Start-Items, C neue Items, E Treffer bis Nachschub, X Wegnahme, T Timer, G Schonfrist, L Leben):
  - Nachschub positiv: C > E. Start mindestens bis zum ersten Nachschub: S ≥ E. Beides erzwingt das Menü (und der Server).
  - Puffer: S ≥ E + X (mit Timer) + (L − 1) (wenn ein Fehlwurf das Item kostet). Ohne Timer kann das Inventar dann nie leer werden – mehr als L − 1 Fehlwürfe gibt es nicht.
  - Mindesttempo = 60 · X / (T · (C/E − 1)) Treffer pro Minute (ganze Lobby), damit der Timer das Inventar nicht leert.
  - Leer ohne Treffer nach G + T · ⌈S/X⌉.
  - „Erweitert“ zeigt Mindesttempo und „leer nach“ an und warnt bei zu kleinem Puffer oder mehr als 6 Treffern pro Minute.

## Mehrspieler

Die Werte gelten für einen Spieler. Bei n Spielern (beim Rundenstart) startet die Runde mit **S + 2·(n−1)**
Items (reihum verteilt) und **L + 2·(n−1)** gemeinsamen Leben (höchstens 99). Nachschub und Wegnahme bleiben
(die Lobby verliert X Items je Takt, reihum). Wer später dazukommt, bekommt sofort 2 Items und die Lobby
2 Leben mehr. S und L wachsen gleich schnell, der Puffer bleibt also erfüllt. Mit Timer sinkt das nötige Tempo
pro Spieler mit n (die Lobby trifft gemeinsam).

## Voreinstellungen

### Casual

Ohne Zeitdruck. Zurücklegen erlaubt, Fehlwürfe behalten das Item. Sendelimit: 1 je 3 erhaltene Items.

| | Sehr einfach | Einfach | Normal | Schwer | Sehr schwer |
|---|---|---|---|---|---|
| Leben | 20 | 12 | 8 | 6 | 4 |
| Start-Items | 8 | 7 | 6 | 5 | 5 |
| Nachschub | +3 je 2 | +3 je 2 | +4 je 3 | +5 je 4 | +6 je 5 |
| Reihenfolge | 0 % | 20 % | 50 % | 65 % | 80 % |

### Vereinfachter Fokus

Ein Fehlwurf kostet das Item. Zurücklegen erlaubt, mehr Leben. Sendelimit: 1 je 4 erhaltene Items.

| | Sehr einfach | Einfach | Normal | Schwer | Sehr schwer |
|---|---|---|---|---|---|
| Leben | 12 | 9 | 7 | 6 | 5 |
| Start-Items | 13 | 10 | 8 | 8 | 8 |
| Nachschub | +4 je 2 | +4 je 2 | +3 je 2 | +4 je 3 | +5 je 4 |
| Reihenfolge | 10 % | 30 % | 50 % | 70 % | 90 % |

### Fokus

Kein Zurücklegen, ein Fehlwurf kostet das Item. Sendelimit: 1 je 5 erhaltene Items.

| | Sehr einfach | Einfach | Normal | Schwer | Sehr schwer |
|---|---|---|---|---|---|
| Leben | 8 | 6 | 5 | 4 | 3 |
| Start-Items | 9 | 8 | 6 | 6 | 6 |
| Nachschub | +4 je 2 | +5 je 3 | +3 je 2 | +4 je 3 | +5 je 4 |
| Reihenfolge | 20 % | 40 % | 60 % | 80 % | 100 % |

### Tempo

Ein Timer nimmt Items weg. Zurücklegen erlaubt. Sendelimit: 1 je 5 erhaltene Items.

| | Sehr einfach | Einfach | Normal | Schwer | Sehr schwer |
|---|---|---|---|---|---|
| Leben | 15 | 10 | 7 | 5 | 4 |
| Start-Items | 8 | 7 | 6 | 6 | 6 |
| Nachschub | +3 je 2 | +3 je 2 | +3 je 2 | +5 je 3 | +5 je 3 |
| Schonfrist | 120 s | 90 s | 60 s | 60 s | 50 s |
| Timer | 60 s | 40 s | 30 s | 20 s | 30 s |
| Wegnahme | 1 | 1 | 1 | 1 | 2 |
| Mindesttempo | 2/min | 3/min | 4/min | 4,5/min | 6/min |
| Leer ohne Treffer nach | 10:00 | 6:10 | 4:00 | 3:00 | 2:20 |
| Reihenfolge | 0 % | 20 % | 50 % | 65 % | 80 % |

### Hardcore

Timer, kein Zurücklegen, ein Fehlwurf kostet das Item. Sendelimit: 1 je 10 erhaltene Items.

| | Sehr einfach | Einfach | Normal | Schwer | Sehr schwer |
|---|---|---|---|---|---|
| Leben | 6 | 4 | 3 | 2 | 1 |
| Start-Items | 8 | 7 | 6 | 6 | 6 |
| Nachschub | +3 je 2 | +3 je 2 | +3 je 2 | +5 je 3 | +5 je 3 |
| Schonfrist | 120 s | 90 s | 60 s | 60 s | 50 s |
| Timer | 60 s | 40 s | 30 s | 20 s | 30 s |
| Wegnahme | 1 | 1 | 1 | 1 | 2 |
| Mindesttempo | 2/min | 3/min | 4/min | 4,5/min | 6/min |
| Leer ohne Treffer nach | 10:00 | 6:10 | 4:00 | 3:00 | 2:20 |
| Reihenfolge | 20 % | 40 % | 60 % | 80 % | 100 % |
