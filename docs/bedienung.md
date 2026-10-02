# Bedienung

## Hauptmenü

Startseite `/`, im Spiel über „Menü“ oben rechts; die Karte dreht sich dahinter langsam.

- **Spielen** (Spielmenü, siehe [spielmenue.md](spielmenue.md)), **Lobby beitreten** (Code oder Einladungslink eingeben), **Statistik** (nur hier erreichbar), **Einstellungen**.
- **Laufende Spiele:** alle Spiele, die dieser Browser kennt – eigene Einzelspiele (beliebig viele) und beigetretene Lobbys –, zuletzt aktive zuerst. Je Spiel: Typ und Code, Modus und Stufe, Kartenauswahl, Runde mit Fortschritt, Leben und Punkten (Lobby: Team und eigene), Spieler online, Host, Verfall. Lobbys, die auf dem Server ruhen, tragen „inaktiv“ (siehe [lobbys.md](lobbys.md#inaktive-lobbys)).
- **Fortsetzen/Öffnen** verbindet das Spiel (das gerade offene ohne Neuladen; ein anderes, nachdem auf der Seite schon eins lief, mit Neuladen).
- **Entfernen** (Mülleimer, mit Bestätigung): als Host wird die Lobby auf dem Server gelöscht und alle Verbundenen sehen „Lobby beendet“; sonst verlässt man die Lobby (Items zurück in den Vorrat). Ein Einzelspiel wird gelöscht. Verfallene Spiele verschwinden von selbst.
- Im Hauptmenü pausiert ein offenes Einzelspiel (Timer und Tempo-Wertung).

## Einstellungen

Popup im Hauptmenü und im Spiel über ⚙; gilt sofort und nur auf diesem Gerät.

| Bereich | Einstellung | Werte |
|---|---|---|
| Darstellung | Farbschema (`map/schemes.js`) | **A Nachtatlas** (Standard; dunkles Land, Fortschritt Olivgrau → Sand → Creme), **B Papierkarte** (Salbei → Grün → Tannengrün), **C Kontinentfarben** (jeder Kontinent bekommt beim Einsetzen seinen Farbton) |
| | Kartenqualität | Niedrig / Mittel (Standard) / Hoch – siehe [kartendaten.md](kartendaten.md#detailstufen-lod) |
| | Projektion (`map/projections.js`) | Natural Earth (Standard) oder Flächentreu (Equal Earth: Afrika : Europa 3,07 statt 2,27) |
| | Relief | Aus / Leicht (Standard) / Stark (`map/relief.js`) |
| | Namen | an (Standard) / aus: Namen eingesetzter Gebiete auf der Karte (`map/labels.js`) |
| | Flüsse und Seen | an (Standard) / aus (`map/water.js`) |
| | Kosmos | an (Standard): Sterne (ein Teil funkelt leicht) und Nebel außerhalb der Erde, auch hinter Haupt- und Spielmenü und auf der Statistikseite, dazu ein schwacher Schein um die Erde (`ui/cosmos.js`); aus: einfarbiger Hintergrund wie bisher. Pausiert im verborgenen Tab, steht bei „weniger Bewegung“ still |
| Steuerung | Zoom- und Bewegungsempfindlichkeit | je 25–200 % |
| | Tastenbelegung | aufklappbare Übersicht |
| Allgemein | Spielername | für neue Spiele; in einer laufenden Lobby wird man sofort umbenannt |
| | Sprache | Automatisch (Browsersprache) / Deutsch / English – siehe [sprache.md](sprache.md) |

- Gebiete, in die in der laufenden Runde kein Item kommt (außerhalb der Kartenauswahl), sind fein schraffiert (45°, Farbe `map.hatch` des Schemas; `setPool` in `map/renderer.js`, WebGL im Flächen-Shader). Gilt bis zur nächsten Runde.
- Jede Einsetz-Stufe (nichts, Kontinent, Staat, Bundesland) unterscheidet sich in der Helligkeit; das Item in der Hand und im Inventar hat eine Farbe, die in keiner Stufe vorkommt, mit Rand.
- Projektionswechsel: Die geladenen Kacheln werden neu gerechnet (jeder Punkt behält seine Breite), Drehung und Zoom bleiben; Icons und gehaltenes Item folgen. Der Treffertest rechnet geografisch – in einer Lobby darf jeder seine eigene Projektion haben.
- „Standard wiederherstellen“ setzt Darstellung und Steuerung zurück (nicht Name und Sprache). Der größte Zoom ist bei jeder Qualität 16000 %.

## Steuerung

- Die Karte lässt sich wie ein Globus um die Längsachse drehen: seitlich ziehen, `A`/`D` bzw. `←`/`→` halten oder die Pfeile oben (45°-Schritte). Was in der Mitte liegt, ist am wenigsten verzerrt.
- **Tastatur** (gleichmäßig, solange gedrückt; `Shift` = 2,5× schneller; nicht in Dialogen, Eingabefeldern und im Hauptmenü): `W` `A` `S` `D` bzw. Pfeiltasten bewegen, `R`/`T` zoomen heraus/hinein, `+`/`−` Zoomschritt, `0` ganze Welt, `G` Gradnetz, `F` Vollbild (auch `Esc` beendet es). Tasten nach physischer Position (auch auf AZERTY).
- Bei 100 % ist die Y-Achse fest (Ziehen dreht nur); erst nach dem Hineinzoomen lässt sich die Karte senkrecht verschieben.

## Ladebildschirm

Phasen: Kartendaten herunterladen (in MB, der Server gibt die Größe des Startpakets mit), Umrisse vorbereiten, Items (Icons) vorbereiten, Karte zeichnen. Der Balken läuft nie rückwärts; ein Schimmer zeigt auch während längerer Rechenschritte, dass noch etwas passiert. Schlägt das Laden fehl, gibt es eine Meldung mit „Neu laden“.

## Einsetzen

- Klick auf ein Item im Inventar nimmt es auf; es folgt dem Mauszeiger in der aktuellen Ansicht (gleiche Drehung, gleicher Zoom).
- Klick auf die Karte setzt es ein. Richtig ist jeder Klick in die Fläche des Items oder höchstens 6 Bildschirmpixel neben ihrem Rand (Touch: 12 px). Winzige Items zählen zusätzlich, wenn der Klick nahe an ihrem Mittelpunkt liegt (mindestens 6 px). Kleinststaaten unter 20 km × 20 km (Vatikanstadt, Monaco, San Marino, Liechtenstein, Inselstaaten …) zählen im Umkreis von 10 km um ihren Mittelpunkt – ein fester Radius auf der Erde, der beim Hineinzoomen mitwächst (die Vatikanstadt ist in Natural Earth nur ~100 m groß und selbst bei größtem Zoom unter 1 px). Gehalten bekommen winzige Items einen gestrichelten Ring in der Größe dieses Trefferbereichs.
- Richtig: Das Item rastet ein, die Fläche wird eine Stufe heller, es gibt Punkte (siehe [punkte.md](punkte.md)).
- Daneben: ein Leben weniger; das Item fliegt zurück ins Inventar (bzw. geht zurück in den Vorrat, wenn der Modus das vorsieht).
- Zurücklegen ohne Strafe: Klick auf den Slot, `Esc` oder Rechtsklick (außer bei „Kein Zurücklegen“).
- **Items gedreht** (Regel, siehe [spielmodi.md](spielmodi.md)): Items liegen in 30°-Schritten gedreht im Inventar (nie 0°; fest je Runde, Spieler und Item). Das gehaltene Item dreht man mit `Q` (gegen den Uhrzeigersinn) / `E` (im Uhrzeigersinn) oder `Shift` + Mausrad um je 30°; zurückgelegt bleibt die neue Lage. Die Drehung ist nur eine Erschwernis: Eingesetzt wird unabhängig von ihr, beim Einrasten dreht sich das Item in die richtige Lage.
- Helligkeitsstufen: Das Land startet dunkel bzw. neutral. Jedes eingesetzte Item hellt seine Fläche um eine Stufe auf (additiv). Staats- und Kontinentgrenzen sind unsichtbar, sichtbar sind nur Küsten; eine Kontinentgrenze (Ural, Sinai, Panama …) erscheint, sobald einer der angrenzenden Kontinente eingesetzt ist.
- Inventar: Passen die Items nicht mehr in eine Zeile, kommt eine zweite dazu (spaltenweise gefüllt); darüber hinaus scrollt es horizontal (auch mit dem Mausrad). Neue Items kommen hinten dazu, die Scrollposition bleibt stehen. Die Beschriftung zeigt die Anzahl. Über dem Inventar: Nachschub-Anzeige („Noch n Treffer bis +k Items“) und – mit Timer – der Countdown.

## Statusleiste und Nachrichtenleiste

- Oben rechts: Badge (Einzelspiel bzw. Lobby-Code und Spielerzahl → Spielmenü), Fortschritt „eingesetzt/gesamt“, Leben (Herz mit „9/10“, bei wenigen rot), Einstellungen, Menü.
- **Nachrichtenleiste** unten rechts: Einsetzen und Fehlwürfe (in der Lobby aller Spieler, mit Namen in Spielerfarbe und Punkten), Nachschub, Senden, Wegnahme durch den Timer, Hinweise und in der Lobby der Chat. Ältere Meldungen werden nach 12 s blasser. Einklappbar (dann nur die neueste Meldung, Zähler für ungelesene); auf schmalen Bildschirmen standardmäßig eingeklappt.
- **Rundenende-Dialog:** Ergebnis, Punkte (Einzelspiel: Aufschlüsselung; Lobby: Rangliste und Teamsumme), „Hauptmenü“ (beendet das Spiel: Host bzw. Einzelspiel beendet die Lobby, Gäste verlassen sie), „Anpassen“ bzw. „Lobby“ (Lobbyübersicht mit Spielern und den Einstellungen der Runde), „Nochmal“ bzw. „Neue Runde für alle“ (nur Host).
