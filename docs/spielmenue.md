# Spielmenü

„Neues Spiel“ über „Spielen“ im Hauptmenü; im Spiel über das Badge oben rechts und nach Rundenende über
„Anpassen“/„Lobby“. Links die Regeln, rechts die Karte. Code: `static/js/menu/`.

## Kartenauswahl (rechts)

- Presets mit Mini-Weltkarte: **Kontinente** (7), **Länder** (197; darunter die Kontinente als Chips – „Alle“ oder einzelne, mehrere möglich), **Alles** (Kontinente, Länder und Bundesländer, 220) und **Bundesländer** (die 16 Länder Deutschlands; Gruppe `state-de`). Ein neues Spiel und eine Lobby ohne Angabe spielen Kontinente und Länder – Bundesländer nur, wenn sie gewählt sind („Bundesländer“ oder „Alles“).
- **Mit Kleinstaaten** gilt für Länder und Alles: aus = ohne die 25 Staaten unter 1.100 km² (Vatikanstadt, Monaco, Tuvalu, Nauru, San Marino, Malediven, Liechtenstein, Marshallinseln, St. Kitts und Nevis, Malta, Grenada, St. Vincent, Seychellen, Barbados, Andorra, Antigua und Barbuda, Palau, Singapur, Tonga, St. Lucia, Mikronesien, Bahrain, Dominica, Kiribati, São Tomé und Príncipe).
- **Einzelne Items anpassen** klappt die Einzelauswahl auf (Suche, „Alle“/„Keine“ je Gruppe); passt das Ergebnis zu keinem Preset, heißt es „Eigene Auswahl“.
- Gespeichert werden Gruppen und ausgeschlossene Items (`config.kinds`, `config.excluded`); das Preset erkennt `menu/map-presets.js`.

**Item-Gruppen:** 7 Kontinente, 45 Staaten Europas (klassisches Europa inkl. Russland und Kosovo, ohne Türkei, Zypern und Kaukasus), 23 Staaten Nordamerikas (USA, Kanada, Mexiko, 7 Staaten Mittelamerikas, 13 Karibikstaaten; ohne abhängige Gebiete), 12 Staaten Südamerikas (ohne Französisch-Guayana und Falklandinseln), 54 Staaten Afrikas (ohne Westsahara, Réunion, Mayotte, St. Helena), 49 Staaten Asiens (46 unabhängige Staaten inkl. Türkei, Kaukasus und Kasachstan, dazu Zypern, Taiwan und Palästina; Russland zählt als Ganzes zu Europa), 14 Staaten Ozeaniens (ohne abhängige Gebiete).

## Regeln (links)

- **Einfache Ansicht:** Modus (Casual, Vereinfachter Fokus, Fokus, Tempo, Hardcore) und Schwierigkeit (Sehr einfach … Sehr schwer), darunter die Werte als Kurzzeile. Standard: Casual, Normal, Alles. Alle Modi, Regeln und Werte: [spielmodi.md](spielmodi.md).
- **Erweiterte Einstellungen** (der Browser merkt sich, ob aufgeklappt): Reihenfolge-Regler, Leben, Start-Items, Nachschub, Timer/Schonfrist/Wegnahme (10-s-Schritte), „Kein Zurücklegen“, „Fehlwurf kostet das Item“, Kennzahlen (Mindesttempo, „leer nach“, Puffer), Aufbewahren und in der Lobby deren Einstellungen. Wer dort einen Regelwert ändert, hat „Eigene Einstellungen“.
- **Reihenfolge:** Regler 0–100 %, bestimmt, ob leichte oder schwere Items zuerst kommen: Je Item Wert = (1 − z) · Item-Schwierigkeit/10 + z · Zufall mit Zufallsanteil z = min(Regler, 100 % − Regler). Bis 50 % kommt das Item mit dem kleinsten Wert zuerst (0 % = streng von leicht nach schwer), ab 51 % das mit dem größten. Die Reihenfolge berechnet der Server (`worldmapguessr/difficulty.py`).
- **Timer (Tempo, Hardcore):** fester Takt ab Rundenbeginn. Nach der Schonfrist gehen alle *Timer* Sekunden *Wegnahme* Items aus dem Inventar zurück in den Vorrat – immer die ältesten, auch ein gerade gehaltenes. Die Anzeige über dem Inventar zählt herunter (letzte 5 s rot, im Endspurt „Endspurt“). Der Timer steht, solange niemand verbunden ist; im Einzelspiel zusätzlich, solange Menü oder Rundendialog offen sind oder der Tab im Hintergrund liegt („pausiert“).
- **Kein Zurücklegen (Fokus, Hardcore):** Slot, `Esc`, Rechtsklick und Wechsel zu einem anderen Item sind gesperrt – das Item muss eingesetzt (in der Lobby auch: gesendet) werden.
- **Fehlwurf kostet das Item (Vereinfachter Fokus, Fokus, Hardcore):** Das Item verblasst und geht zurück in den Vorrat (außer im Endspurt).
- Die Einstellungen gelten für die gestartete Runde; solange die Seite offen ist, merkt sich das Menü die letzte Auswahl. „Nochmal“ im Rundenende-Dialog startet mit denselben Einstellungen neu gemischt.
- Während einer laufenden Runde schließt `Esc` bzw. × das Menü wieder, ohne die Runde zu verlieren; ein Hinweis sagt, dass Änderungen erst ab der nächsten Runde gelten.
