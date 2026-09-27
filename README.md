# WorldMapGuessr

Geografie-Spiel: Kontinente, Länder, Bundesländer und Regionen auf einer Weltkarte korrekt einsetzen.

**Stand:** Schritt 7: Daten in MongoDB (JSON-Dateien als Fallback).

## Spielablauf

- Die Karte lässt sich wie ein Globus um die Längsachse drehen: seitlich ziehen, `A`/`D` bzw. `←`/`→` halten oder die Pfeile oben, die in 45°-Schritten (π/4) auf 0°, 45°, 90° … weiterdrehen. Was in der Mitte liegt, ist am wenigsten verzerrt.
- **Tastatur** (gleichmäßig, solange gedrückt; `Shift` = 2,5× schneller; nicht in Dialogen, Eingabefeldern und im Hauptmenü): `W` `A` `S` `D` bzw. Pfeiltasten bewegen, `Q`/`E` zoomen heraus/hinein, `+`/`−` Zoomschritt, `0` ganze Welt, `G` Gradnetz, `F` Vollbild an/aus (auch Knopf rechts; `Esc` beendet es ebenfalls). Tasten nach physischer Position (auch auf AZERTY). Übersicht unter Einstellungen → Steuerung.
- Bei 100 % ist die Y-Achse fest (Ziehen dreht nur). Erst nach dem Hineinzoomen lässt sich die Karte auch senkrecht verschieben.
- **Hauptmenü** (Startseite `/`, im Spiel über „Menü“ oben rechts; die Karte dreht sich dahinter langsam): **Spielen** (Spielmenü, s. u.), **Lobby beitreten** (Code oder Einladungslink eingeben), **Statistik** (nur hier erreichbar), **Einstellungen** und **Laufende Spiele**:
  - Alle Spiele, die dieser Browser kennt – eigene Einzelspiele (beliebig viele) und beigetretene Lobbys –, zuletzt aktive zuerst. Je Spiel: Typ und Code, Modus und Stufe, Kartenauswahl, Runde mit Fortschritt und Leben, Spieler online, Host, Verfall.
  - **Fortsetzen/Öffnen** verbindet das Spiel (das gerade offene ohne Neuladen; ein anderes, nachdem auf der Seite schon eins lief, mit Neuladen). **Entfernen** (Mülleimer, mit Bestätigung): als Host wird die Lobby auf dem Server gelöscht und alle Verbundenen sehen „Lobby beendet“; sonst verlässt man die Lobby (Items zurück in den Vorrat). Ein Einzelspiel wird gelöscht. Verfallene Spiele verschwinden von selbst.
  - Im Hauptmenü pausiert der Timer eines offenen Einzelspiels.
- **Einstellungen** (Popup im Hauptmenü und im Spiel über ⚙, gilt sofort und nur auf diesem Gerät):
  - **Farbschema** (`map/schemes.js`): **A Nachtatlas** (dunkles Land, Fortschritt Olivgrau → Sand → Creme), **B Papierkarte** (Standard; helles Land, Fortschritt Salbei → Grün → Tannengrün), **C Kontinentfarben** (jeder Kontinent bekommt beim Einsetzen seinen Farbton, Staaten heller im selben Ton). Jede Einsetz-Stufe (nichts, Kontinent, Staat, später Bundesland) unterscheidet sich in der Helligkeit; das Item in der Hand und im Inventar hat eine Farbe, die in keiner Stufe vorkommt, mit Rand (A Orange, B Rot-Orange, C Gelb mit dunkler Kontur).
  - **Projektion** (`map/projections.js`): Natural Earth (Standard, Kompromiss) oder Flächentreu (Equal Earth: alle Flächen im echten Verhältnis, z. B. Afrika : Europa 3,07 statt 2,27). Beim Wechsel werden die geladenen Kacheln neu gerechnet (jeder Punkt behält seine Breite), Drehung und Zoom bleiben; Icons und gehaltenes Item folgen. Der Treffertest rechnet geografisch – in einer Lobby darf jeder seine eigene Projektion haben.
  - **Relief** Aus / Leicht (Standard) / Stark: Geländeschummerung auf dem Land (`map/relief.js`, Daten s. u.).
  - **Flüsse und Seen** an (Standard) / aus: große schon in der Weltansicht, kleinere beim Hineinzoomen (`map/water.js`).
  - Spielername (für neue Spiele; in einer laufenden Lobby wird man sofort umbenannt), **Kartenqualität** Niedrig / Mittel (Standard) / Hoch (wie fein Karte und gehaltenes Item gezeichnet werden, Details: „Detailstufen (LOD)“), Zoom-Empfindlichkeit (Mausrad, Pinch, Zoom-Knöpfe, +/−) und Bewegungsempfindlichkeit (Ziehen, ↑/↓) je 25–200 %, „Standard wiederherstellen“. Der größte Zoom ist bei jeder Qualität 16000 %.
- Beim Start zeigt ein Ladebildschirm den Fortschritt: Kartendaten herunterladen (in MB, der Server gibt die Größe des Startpakets mit), Umrisse vorbereiten, Items (Icons) vorbereiten, Karte zeichnen. Der Balken läuft nie rückwärts; ein Schimmer zeigt auch während längerer Rechenschritte, dass noch etwas passiert. Schlägt das Laden fehl, gibt es eine Meldung mit „Neu laden“.
- **Spielmenü** („Neues Spiel“ über „Spielen“; im Spiel über das Badge oben rechts – „Einzelspiel“ bzw. der Lobby-Code – und nach Rundenende über „Anpassen“/„Lobby“). Links die Regeln, rechts die Karte:
  - **Kartenauswahl** (rechts) als Presets mit Mini-Weltkarte: **Kontinente** (7), **Länder** (197; darunter die Kontinente als Chips – „Alle“ oder einzelne, mehrere möglich), **Alles** (Kontinente und Länder, 204) und **Bundesländer** (kommt noch). Der Schalter **Mit Kleinstaaten** gilt für Länder und Alles: aus = ohne die 25 Staaten unter 1.100 km² (Vatikanstadt, Monaco, Tuvalu, Nauru, San Marino, Malediven, Liechtenstein, Marshallinseln, St. Kitts und Nevis, Malta, Grenada, St. Vincent, Seychellen, Barbados, Andorra, Antigua und Barbuda, Palau, Singapur, Tonga, St. Lucia, Mikronesien, Bahrain, Dominica, Kiribati, São Tomé und Príncipe). **Einzelne Items anpassen** klappt die Einzelauswahl auf (Suche, „Alle“/„Keine“ je Gruppe); passt das Ergebnis zu keinem Preset, heißt es „Eigene Auswahl“. Gespeichert werden weiterhin Gruppen und ausgeschlossene Items (`config.kinds`, `config.excluded`), das Preset erkennt `menu/map-presets.js`.
  - **Item-Gruppen:** 7 Kontinente, 45 Staaten Europas (klassisches Europa inkl. Russland und Kosovo, ohne Türkei, Zypern und Kaukasus), 23 Staaten Nordamerikas (USA, Kanada, Mexiko, 7 Staaten Mittelamerikas, 13 Karibikstaaten; ohne abhängige Gebiete wie Grönland oder Puerto Rico), 12 Staaten Südamerikas (ohne Französisch-Guayana und Falklandinseln), 54 Staaten Afrikas (ohne Westsahara, Réunion, Mayotte, St. Helena), 49 Staaten Asiens (46 unabhängige Staaten inkl. Türkei, Kaukasus und Kasachstan, dazu Zypern, Taiwan und Palästina; Russland zählt als Ganzes zu Europa), 14 Staaten Ozeaniens (ohne abhängige Gebiete wie Neukaledonien, Französisch-Polynesien, Cookinseln, Niue, Guam).
  - **Einfache Ansicht:** Spielmodus (Casual, Vereinfachter Fokus, Fokus, Tempo, Hardcore), Schwierigkeit (Sehr einfach … Sehr schwer, darunter die Werte als Kurzzeile) Standard: Casual, Normal, Alles. Alle Modi, Regeln und Werte: [docs/spielmodi.md](docs/spielmodi.md).
  - **Erweiterte Einstellungen** (Knopf, der Browser merkt sich den Zustand): Reihenfolge-Regler, Leben, Start-Items, Nachschub, Timer/Schonfrist/Wegnahme (10-s-Schritte), „Kein Zurücklegen“, „Fehlwurf kostet das Item“, Kennzahlen (Mindesttempo, „leer nach“, Puffer), Aufbewahren und in der Lobby deren Einstellungen. Wer dort einen Regelwert ändert, hat „Eigene Einstellungen“.
  - **Reihenfolge:** Regler 0–100 % (unter „Erweitert“), bestimmt, ob leichte oder schwere Items zuerst kommen: Je Item Wert = (1 − z) · Item-Schwierigkeit/10 + z · Zufall mit Zufallsanteil z = min(Regler, 100 % − Regler). Bis 50 % kommt das Item mit dem kleinsten Wert zuerst (0 % = streng von leicht nach schwer), ab 51 % das mit dem größten (100 % = streng von schwer nach leicht). Die Reihenfolge berechnet der Server (`worldmapguessr/difficulty.py`).
  - **Timer (Tempo, Hardcore):** Fester Takt ab Rundenbeginn: Nach der Schonfrist gehen alle *Timer* Sekunden *Wegnahme* Items aus dem Inventar zurück in den Vorrat (an zufällige Stellen) – immer die ältesten, auch ein gerade gehaltenes. Über dem Inventar zählt eine Anzeige herunter (letzte 5 s rot, im Endspurt „Endspurt“). Der Timer steht, solange niemand verbunden ist; im Einzelspiel zusätzlich, solange Menü oder Rundendialog offen sind oder der Tab im Hintergrund liegt („pausiert“).
  - **Kein Zurücklegen (Fokus, Hardcore):** Slot, `Esc`, Rechtsklick und Wechsel zu einem anderen Item sind gesperrt – das Item muss eingesetzt (in der Lobby auch: gesendet) werden.
  - **Fehlwurf kostet das Item (Vereinfachter Fokus, Fokus, Hardcore):** Das Item verblasst und geht zurück in den Vorrat (außer im Endspurt).
  - Die Einstellungen gelten nur für die gestartete Runde und werden nicht gespeichert; solange die Seite offen ist, merkt sich das Menü die letzte Auswahl. „Nochmal“ im Rundenende-Dialog startet mit denselben Einstellungen neu gemischt.
  - Während einer laufenden Runde schließt `Esc` bzw. × das Menü wieder, ohne die Runde zu verlieren; ein Hinweis sagt, dass Änderungen erst ab der nächsten Runde gelten.
- Statusleiste oben rechts: Fortschrittsbalken mit „eingesetzt/gesamt“ und Leben als Herz mit „9/10“ (bei wenigen Leben rot).
- Begriff in der Oberfläche: durchgängig „Items“ (Kontinente, Staaten …).
- Staats- und Kontinentgrenzen sind auf der Karte unsichtbar, sichtbar sind nur Küsten. Eine Kontinentgrenze (Ural, Sinai, Panama …) erscheint, sobald einer der angrenzenden Kontinente eingesetzt ist. Ein richtig eingesetzter Staat erscheint aufgehellt mit seinem Umriss (Kleinststaaten zusätzlich mit einem Ring, solange sie zu klein zum Erkennen sind).
- Ein gehaltener Kleinststaat (Vatikan, Monaco, San Marino …) bekommt einen gestrichelten Ring, damit man ihn sieht.
- Klick auf ein Item im Inventar nimmt es auf; er folgt dem Mauszeiger in der aktuellen Ansicht (gleiche Drehung, gleicher Zoom).
- Klick auf die Karte setzt es ein. Richtig ist jeder Klick in die Fläche des Items (z. B. irgendwo in Südamerika) oder höchstens 6 Bildschirmpixel neben ihrem Rand (Touch: 12 px) – unabhängig vom Zoom immer gleich viele Pixel, hineingezoomt also geografisch genauer. Winzige Items (Vatikan, Monaco …) zählen zusätzlich, wenn der Klick nahe an ihrem Mittelpunkt liegt. Dann rastet das Item ein und die Fläche wird eine Stufe heller.
- Helligkeitsstufen: Das Land startet fast schwarz. Jedes eingesetzte Item hellt seine Fläche um eine Stufe auf (additiv, Reihenfolge egal). Sind alle Ebenen an einer Stelle eingesetzt – derzeit Kontinent und Staat –, ist sie fast weiß. Kommen später Ebenen hinzu (Bundesländer, Regionen), werden die Stufen automatisch feiner.
- Daneben: ein Leben weniger; das Item fliegt zurück ins Inventar (bzw. geht zurück in den Vorrat, wenn der Modus das vorsieht). Bei 0 Leben endet die Runde – ebenso, wenn das Inventar leer ist, solange der Vorrat noch Items hat.
- Nachschub: Nach der eingestellten Zahl richtiger Treffer kommen neue Items ins Inventar, bis der Vorrat leer ist (dann Endspurt).
- Zurücklegen ohne Strafe: Klick auf den Slot, `Esc` oder Rechtsklick (außer bei „Kein Zurücklegen“).
- Inventar: scrollt horizontal, wenn es voll wird (Mausrad, Wischen); an den Rändern zeigt eine Ausblendung, dass es weitergeht, die Beschriftung zeigt die Anzahl. Nachschub scrollt ans Ende, damit die neuen Items zu sehen sind.
- **Nachrichtenleiste** unten rechts: alle Meldungen gut lesbar an einem Ort – Einsetzen und Fehlwürfe (in der Lobby aller Spieler, mit Namen in Spielerfarbe), Nachschub (wer wie viele bekommt), Senden, Wegnahme durch den Timer, Hinweise und in der Lobby der Chat. Neue Meldungen erscheinen unten mit kurzem Aufleuchten; ältere werden nach 12 s blasser. Einklappbar (dann nur die neueste Meldung, Zähler für ungelesene); auf schmalen Bildschirmen standardmäßig eingeklappt über dem Inventar.

## Einzelspiel = Solo-Lobby

- Jede Runde läuft auf dem Server, auch das Einzelspiel: „Einzelspiel starten“ im Spielmenü legt eine Lobby nur für einen Spieler an (`solo`) und startet die Runde darin. Die Adresse wird zu `/CODE`; der Browser merkt sich ID und Token (localStorage `wmg.lobby.CODE`, wie bei jeder Lobby).
- **Fortsetzen:** über „Laufende Spiele“ im Hauptmenü – auch Stunden oder Tage später, solange es nicht verfallen ist (Inventar, Leben, eingesetzte Items, Timer bleiben erhalten). Mehrere Einzelspiele gleichzeitig sind möglich. „Runde neu starten“ im Spielmenü startet in derselben Solo-Lobby neu (mit Rückfrage, wenn eine Runde läuft).
- Niemand sonst kann beitreten (auch nicht mit dem Code). Die Oberfläche bleibt die des Einzelspiels: Badge „Einzelspiel“, kein Chat, keine Sende-Spalte.
- **Mitspieler einladen:** Knopf im Spielmenü → Name eingeben → aus dem Einzelspiel wird eine normale Lobby, die laufende Runde geht mit allen weiter, die über den Link beitreten.
- **Aufbewahren:** im Menü (Einzelspiel und Lobby, nur Host): 1 h, 3 h, 6 h, 12 h, 1 Tag (Standard), 2, 3 oder 7 Tage. So lange bleibt eine Lobby samt Runde ohne Aktivität erhalten, danach wird sie gelöscht. Jede Aktion (Einsetzen, Chat, Einstellungen …) setzt die Zeit neu.

## Lobbys

- **Erstellen:** im Menü „Lobby erstellen“ → Name eingeben → Weiterleitung auf den Lobby-Link. Die aktuellen Menü-Einstellungen werden übernommen, der Ersteller ist Host.
- **Link:** so kurz wie möglich, `http://127.0.0.1:5000/K7Q2M` – 5 Zeichen aus `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (ohne 0/O, 1/I/L), ≈ 28,6 Mio. Codes. Klein geschrieben wird weitergeleitet.
- **Beitreten:** Link öffnen → Name (und ggf. Passwort). Jederzeit möglich, auch während einer Runde: Wer später kommt, steigt direkt in die laufende Runde ein.
- **Wiedererkennung:** Spieler-ID und Token liegen im Browser (localStorage). Neu laden oder später zurückkommen führt ohne erneuten Beitritt in dieselbe Rolle – auch als Host.
- **Einstellungen (nur Host):** Spielkonfiguration wie im Einzelspiel, max. Spielerzahl (Standard 8), Passwort (setzen/entfernen), „Items senden“ (Standard an, wirkt sofort), Sendelimit (je Modus: Casual 3, Vereinfachter Fokus 4, Fokus 5, Tempo 5, Hardcore 10; 0 = ohne). Lobby-Einstellungen stehen unter „Erweitert“. Gäste sehen alles live, aber gesperrt.
- **Host-Wechsel:** Ist der Host länger als 10 s getrennt, übernimmt der am längsten anwesende Spieler.
- **Verlassen (alle):** „Lobby verlassen“ im Lobby-Bereich des Menüs → Bestätigung → zurück zum Hauptmenü (oder dort „Entfernen“). Der Spieler wird aus der Lobby entfernt, seine gespeicherte Identität gelöscht; über den Link kann er später als neuer Spieler wieder beitreten. Verlässt der Host, geht die Rolle sofort an den am längsten anwesenden Online-Spieler. Verlässt der letzte Spieler, wird die Lobby gelöscht.
- **Beenden (nur Host):** „Lobby beenden“ → Bestätigung → die Lobby wird für alle gelöscht. Auch über „Entfernen“ im Hauptmenü. Alle anderen sehen „Lobby beendet“ mit dem Weg zum Hauptmenü; der Link funktioniert danach nicht mehr.
- **Runde starten:** Der Host startet für alle („Neue Runde für alle“ im Menü oder im Rundenende-Dialog). Ablauf siehe *Mehrspieler-Runde*.
- **Speicherung:** MongoDB-Collection `lobbies` bzw. Fallback `instance/lobbies.json` (Passwörter nur als Hash, Spieler-Tokens als SHA-256). Lobbys verfallen nach ihrer eingestellten Zeit ohne Aktivität („Aufbewahren“, Standard 1 Tag); ein Aufräumlauf alle 10 Minuten löscht sie.
- **Chat:** Eingabefeld unten in der Nachrichtenleiste (Enter sendet, max. 200 Zeichen). Die letzten 50 Nachrichten werden mit der Lobby gespeichert; wer beitritt, sieht die letzten 10.
- **Technik:** WebSocket `/ws/lobby/<code>` über `flask-sock`. Protokoll (JSON): Client → `join`, `settings`, `start`, `place {key, correct}`, `give {key, to}`, `chat {text}`, `pause {paused}` (nur Einzelspiel), `rename`, `leave`, `close`, `ping`; Server → `welcome`, `state {lobby, hand, sends}`, `error`, `left`, `closed`, `pong`. Der Rundenzustand enthält ein Ereignisprotokoll (`log`, letzte 40 Ereignisse mit `seq`), aus dem jeder Browser die Meldungen genau einmal erzeugt. HTTP: `POST /api/lobbies` (`{name, config, solo, ttl, maxPlayers, password}`), `GET /api/lobbies/<code>`, `POST /api/lobbies/mine` (`{lobbies: [{code, id, token}]}` → Überblick je Lobby, nur mit gültigem Token; `gone`: die übrigen), `DELETE /api/lobbies/<code>` (`{id, token}`: Host beendet, sonst verlassen).

## Mehrspieler-Runde

Der Server führt die Runde (`lobbies/round.py`); der Browser prüft nur, ob ein Item passt, und meldet das Ergebnis.

- **Jedes Item nur einmal:** Ein gemeinsamer, gemischter Vorrat. Jedes Item liegt entweder im Vorrat, im Inventar genau eines Spielers oder ist eingesetzt. Fremde Inventare sieht niemand (nur deren Größe); Items anderer Spieler kann man nicht einsetzen.
- **Eingesetzte Items synchron:** Jedes richtig eingesetzte Item erscheint sofort bei allen auf der Karte (mit Helligkeitsstufe und Grenze), dazu eine Meldung „Name hat Frankreich eingesetzt“ in der Nachrichtenleiste. Fortschritt `eingesetzt / gesamt` gilt für die Lobby.
- **Gemeinsame Leben:** Jeder Fehlwurf kostet der ganzen Lobby ein Leben. Bei 0 endet die Runde für alle – ebenso, wenn alle Inventare leer sind, solange der Vorrat noch Items hat.
- **Spielerzahl:** Start-Items und Leben sind Werte für einen Spieler; die Runde startet mit S + 2·(n−1) Items und L + 2·(n−1) Leben (siehe [docs/spielmodi.md](docs/spielmodi.md)).
- **Start und Nachschub reihum:** Die (hochgerechneten) Start-Items und `Neue Items` werden als Gesamtzahl reihum verteilt. Der Server geht in fester Reihenfolge (wer am längsten in der Lobby ist, zuerst) durch die Spieler und merkt sich, wer als Nächstes dran ist – über alle Verteilungen der Runde hinweg. Beispiel mit 3 Spielern: 2 Start-Items → Spieler 1, Spieler 2; nach dem Nachschub 2 neue → Spieler 3, Spieler 1. So bekommt jeder am Ende gleich viele Items vom Server (höchstens eins Unterschied). Nachschub gibt es nach je `Nachschub alle` Treffern der *ganzen Lobby*; getrennte Spieler werden übersprungen. Verlässt ein Spieler die Lobby und sind danach alle Inventare leer, wird sofort nachgelegt. Über dem Inventar zeigt eine Leiste, wie viele Treffer (der Lobby) noch bis zum nächsten Nachschub fehlen – auch im Einzelspiel.
- **Später beitreten:** Wer in eine laufende Runde kommt, sieht alle bisher eingesetzten Items, bekommt sofort 2 Items, die Lobby 2 Leben mehr, und er reiht sich hinten ins Verteilen ein.
- **Verlassen / Verbindung weg:** Wer die Lobby verlässt, gibt seine Items sofort zurück in den Vorrat und verlässt die Reihenfolge. Bei einem Verbindungsabbruch (Tab zu, Neu laden) bleibt das Inventar reserviert, bis der Spieler zurückkommt oder die Lobby verfällt – auch wenn die anderen weiterspielen. Beim Verteilen und bei der Wegnahme durch den Timer wird er solange übersprungen. Hält ein getrennter Spieler die letzten Items, geht die Runde erst weiter, wenn er zurückkommt.
- **Items senden:** Links am Rand steht ein Feld je Online-Mitspieler (Name, Anzahl seiner Items). Item aufnehmen, dann ein Feld anklicken → das Item fliegt hinüber und liegt danach im Inventar des Mitspielers; alle sehen eine Meldung. Nur an verbundene Spieler. Ist „Items senden“ aus, verschwindet die Spalte und der Server lehnt Senden ab.
- **Sendelimit:** Je N vom Server erhaltene Items (Start, Nachschub) darf ein Spieler 1 Item senden (Lobbyeinstellung, vom Modus vorbelegt, 0 = ohne Limit). Geschenkte Items zählen nicht mit – so entsteht kein Hin-und-Her. Die Spalte zeigt „Du kannst 1 Item senden“ bzw. „Senden wieder nach 3 Items“; der Server prüft (`send_limit`).
- **Timer in der Lobby:** Der Server führt ihn (`round.tick`, Prüfung alle 0,5 s): gemeinsamer fester Takt ab Rundenbeginn, nach der Schonfrist je Takt *Wegnahme* Items insgesamt – wie beim Verteilen reihum in fester Reihenfolge (eigener Zeiger), bei jedem Spieler sein ältestes Item. Wer keins hat oder getrennt ist, wird übersprungen. Verpasste Takte (Server war aus, niemand verbunden) werden nicht nachgeholt.
- **Menü in der Lobby:** zwei Blöcke – *Lobby* („wirkt sofort“: Spielerzahl, Passwort, Items senden) und *Runde* (Regeln, Kartenauswahl; läuft eine Runde, gilt „ab der nächsten Runde“). Ein Hinweis zeigt, was gerade gilt und wer einstellt; „So läuft eine Lobby-Runde“ erklärt die Regeln aufklappbar. Die Regler zeigen, was sie in der Lobby bewirken (z. B. „für alle zusammen, reihum (jetzt 3 + 2)“), der Fuß fasst alles zusammen. Startet der Host neu, während eine Runde läuft, fragt ein Dialog nach („bricht die Runde für alle ab“).
- **Rundenende:** Gewonnen (alles eingesetzt) oder verloren (keine Leben) – der Dialog erscheint bei allen. Nur der Host sieht „Neue Runde für alle“. Eine Rangliste gibt es noch nicht.
- Der Rundenzustand wird mit der Lobby gespeichert und übersteht einen Server-Neustart.

## Speicher

| `MONGODB_URI` | Items | Lobbys |
|---|---|---|
| gesetzt | MongoDB, Collection `items` (Zähler atomar per `$inc`) | MongoDB, Collection `lobbies` (ein Dokument je Lobby) |
| leer (Standard lokal) | `instance/items.json` | `instance/lobbies.json` |

- Datenbankname: aus der URI (`…/worldmapguessr?…`), sonst `MONGODB_DB`, sonst `worldmapguessr`.
- Beim Start prüft der Server die Verbindung (Timeout 5 s). Ist MongoDB nicht erreichbar, bricht der Start ab – im Container startet Docker ihn dank `restart: unless-stopped` neu.
- `GET /api/health` → `{"status": "ok", "storage": "mongodb"}` bzw. 503, wenn MongoDB weg ist (nutzt auch der Docker-Healthcheck).
- **Übernahme der alten Statistik:** Beim ersten Start mit *leerer* `items`-Collection übernimmt der Server `instance/items.json` (anderer Pfad: `WMG_ITEM_IMPORT`) mit UIDs und Zählern. Von Hand geht es auch: `python -m worldmapguessr.storage.migrate_items instance/items.json` (mit gesetztem `MONGODB_URI`, mehrfach ausführbar).
- Lobbys laufen in einem einzigen Server-Prozess (WebSockets und Online-Status liegen im Speicher). MongoDB sorgt dafür, dass sie einen Neustart überstehen – mehrere Prozesse/Container parallel sind dafür nicht ausgelegt.
- Lokal mit der Server-Datenbank testen: SSH-Tunnel `ssh -L 27017:127.0.0.1:27017 user@server` und in der PyCharm-Startkonfiguration `MONGODB_URI=mongodb://wmg:PASSWORT@localhost:27017/worldmapguessr?authSource=worldmapguessr` setzen (setzt voraus, dass der Mongo-Stack den Port an `127.0.0.1` bindet).

## Deployment auf dem Server

Push auf `master` → GitHub Action (`.github/workflows/deploy.yml`) → per SSH auf dem Server `git pull`,
`docker compose build`, `docker compose up -d`. Der Container läuft im Netzwerk `local-web`, erreichbar auf Port 5002.

**MongoDB einmalig anbinden:**
1. Auf dem Server `/root/WorldMapGuessr/.env` anlegen (Vorlage: `.env.example`):
   `MONGODB_URI=mongodb://wmg:PASSWORT@mongo:27017/worldmapguessr?authSource=worldmapguessr`
   – `mongo` ist der Containername der Datenbank im Netzwerk `local-web`, `wmg`/`PASSWORT` der App-Benutzer aus dem Mongo-Stack.
2. Pushen (oder auf dem Server `docker compose up -d --build`).
3. Beim ersten Start mit leerer `items`-Collection übernimmt der Server `instance/items.json` (liegt über das Volume `./instance` im Container) mit allen UIDs und Zählern. Die Datei bleibt als Sicherung liegen.
4. Prüfen: `http://SERVER:5002/api/health` → `{"status": "ok", "storage": "mongodb"}`. Steht dort `"json"`, fehlt die `.env` bzw. `MONGODB_URI`.

Hinweise:
- Gunicorn läuft mit genau einem Worker (siehe Dockerfile) – nötig, weil Lobbys und WebSockets im Speicher dieses Prozesses leben.
- Ist MongoDB beim Start nicht erreichbar, bricht der Start nach 5 s ab; `restart: unless-stopped` startet den Container neu, bis die Datenbank da ist.
- Hinter einem Reverse Proxy muss WebSocket-Support aktiv sein (`/ws/…`).

## Item-Statistik

Jedes Item ist auf dem Server mit fester UID registriert. Gezählt wird in MongoDB oder im Fallback in
`instance/items.json`.

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/items?kind=continent` bzw. `?kind=country` | Items mit UID und Zählern |
| GET | `/api/items/<uid>` | ein Item |
| POST | `/api/items/<uid>/events` | Body `{"event": "spawned" \| "correct" \| "incorrect"}` |

Was wann zählt:

Es zählt allein der Server – im Einzelspiel (Solo-Lobby) genauso wie in Lobbys:

| Zähler | Wann |
|---|---|
| `spawned` (Spawns) | Server teilt ein Item aus dem Vorrat einem Spieler aus (Start, Nachschub, Nachlegen). **Nicht:** an Mitspieler gesendete Items, Neuladen/Wiederverbinden, zweiter Tab. Ein Item, das zurück in den Vorrat ging (Verlassen, Timer) und neu ausgeteilt wird, zählt erneut. |
| `correct` (Eingesetzt) | vom Server angenommener richtiger Versuch |
| `incorrect` (Fehlplatziert) | vom Server angenommener falscher Versuch (kostet ein Leben; nicht nach Rundenende oder mit fremden Items) |

**Item-Schwierigkeit** 0 (leicht) … 10 (schwer) = 10 × (1 − (75 % Eingesetzt/Spawns + 25 % Trefferquote)), auf eine Nachkommastelle. Ohne Daten gilt 5; fehlt eine der beiden Quoten (z. B. nie versucht), zählt die andere allein; Eingesetzt/Spawns wird auf 100 % begrenzt. Die API liefert sie bei jedem Item als `difficulty` mit.

Der Browser meldet nichts (`lobbies/round.py` sammelt die Ereignisse, `item_events.py` schreibt sie); `POST /api/items/<uid>/events` bleibt für Werkzeuge und Tests.
Hinweis: Bis zu dieser Version haben in Lobbys die Browser gezählt – ältere Zahlen können dort Spawns doppelt enthalten
(Neuladen, gesendete Items).

**Statistik-Seite:** <http://127.0.0.1:5000/stats> (im Hauptmenü „Statistik“). Tabelle aller Items,
sortierbar per Klick auf den Spaltenkopf (zweiter Klick kehrt die Richtung um), Filter Kontinente/Staaten, Suche nach
Name, Code oder UID. Oben Kacheln mit den Summen (Spawns, Eingesetzt, Fehlplatziert), den Quoten
**Eingesetzt / Spawns** und **Trefferquote** (eingesetzt / Versuche) sowie **Ø Schwierigkeit** – jeweils für den aktuellen Filter; dieselben
Summen stehen als letzte Tabellenzeile. Je Item gibt es beide Quoten und die Schwierigkeit (0–10, mit Balken) als Spalte. Darunter die Rohdaten als JSON
(gefiltert und sortiert wie die Tabelle); ein Klick auf eine UID kopiert sie.
Ist der Server nicht erreichbar, läuft das Spiel ohne Tracking weiter (Warnung in der Konsole).

## Struktur

```
run.py                        Startpunkt Entwicklungsserver
requirements.txt              Laufzeit-Abhängigkeiten (Flask, flask-sock, gunicorn, pymongo)
requirements-dev.txt          + pytest, mongomock
Dockerfile, docker-compose.yml  Container für den Server (Netzwerk local-web, Port 5002)
.env.example                  Vorlage für die .env auf dem Server (MONGODB_URI)
.github/workflows/deploy.yml  Deployment per SSH bei Push auf master
instance/items.json           Item-Statistik (wird beim Start angelegt, nicht versioniert)
worldmapguessr/
  __init__.py                 App-Factory create_app(), registriert Kontinente als Items
  routes.py                   Seiten-Routen (/ und /stats)
  api.py                      JSON-API /api/items
  lobbies/codes.py            Lobby-Codes, URL-Konverter
  lobbies/settings.py         Lobbyeinstellungen prüfen (Grenzen, Arten, Namen)
  lobbies/store.py            Lobbys im Speicher, Beitritt, Passwort, Host-Aktionen, Verfall
  lobbies/hub.py              Live-Verbindungen, Online-Status, Host-Wechsel, Broadcast (mit eigenem Inventar)
  lobbies/round.py            Mehrspieler-Runde: Vorrat, Inventare, gemeinsame Leben, Nachschub
  difficulty.py               Item-Schwierigkeit (0–10) und Reihenfolge nach dem Schwierigkeitsregler
  item_events.py              Item-Statistik aus Lobby-Runden in den Item-Store schreiben
  lobbies/ws.py               WebSocket-Endpunkt
  lobbies/api.py              HTTP-API /api/lobbies
  item_store.py               Items als JSON-Datei (Fallback)
  map_data.py                 Kartendaten: index.json lesen, Startgröße, Item-Katalog je Gruppe
  storage/factory.py          Backend-Wahl: MongoDB oder JSON
  storage/mongo.py            Verbindung, Ping
  storage/mongo_items.py      Items in MongoDB, Übernahme aus items.json
  storage/migrate_items.py    Übernahme von Hand (Kommandozeile)
  lobbies/persistence.py      Lobbys schreiben: JSON-Datei oder MongoDB
  templates/index.html        Spielseite (Jinja-Template)
  templates/stats.html        Statistik-Seite
  static/css/tokens.css       Farb-Tokens hell/dunkel (von allen Seiten genutzt)
  static/css/style.css        Karte & HUD
  static/css/stats.css        Statistik-Seite
  static/css/home.css         Hauptmenü
  static/css/map-picker.css   Kartenauswahl im Spielmenü
  static/css/settings.css     Einstellungs-Popup
  static/css/game.css         Inventar, Leben, Dialog
  static/css/menu.css         Menü
  static/css/lobby.css        Lobby (HUD, Menü-Bereich, Beitritt)
  static/js/main.js           Einstiegspunkt (ES-Module)
  static/js/ui/loading-screen.js  Ladebildschirm: Phasen mit Gewicht, Fortschritt, Fehlerzustand
  static/js/map/map.js        Startdaten laden, Projektion, Ansicht (Drehung, Zoom, vertikal verschieben)
  static/js/map/tiles.js      Kacheln: Detailstufe je Zoom, sichtbare laden, Ersatz aus gröberer Stufe, Speichergrenze
  static/js/map/items.js      Item-Umrisse: Startstufe für alle, feinere Stufe je Item bei Bedarf
  static/js/map/project.js    Schnelle Natural-Earth-Projektion, Sichtbarkeitstest für Längen/Breiten-Boxen
  static/js/map/renderer.js   Canvas-Zeichnung aus Kacheln (Zellfarben, Küsten, Grenzen, Kleinststaat-Ringe)
  static/js/map/quality.js    Kartenqualität Niedrig/Mittel/Hoch (Detailfaktor, Schrittweiten, Speichergrenze)
  static/js/map/geometry.js   Anker, Fläche, Zerlegung in Teile (Sichtbarkeit, Datumsgrenze)
  static/js/map/gestures.js   Ziehen, Mausrad, Pinch, Doppelklick
  static/js/map/controls.js   Buttons, Tasten +/−/0/G/F, Vollbild, Koordinatenanzeige
  static/js/map/keyboard.js   Bewegen (WASD/Pfeile) und Zoomen (Q/E) solange gedrückt, Shift schneller
  static/js/map/schemes.js    Farbschemata A/B/C (Karte, Einsetz-Stufen, Item-Farben)
  static/js/map/projections.js  Natural Earth / Equal Earth (Formeln für den Renderer, d3-Fabrik)
  static/js/map/relief.js     Geländeschummerung: Rasterkacheln in Streifen verzerrt, Überblendung
  static/js/map/water.js      Flüsse und Seen: Kachel-Speicher, Strichbreiten
  static/js/api/items-api.js  Laden der Statistik (/api/items)
  static/js/stats/stats.js    Statistik-Seite: laden, filtern, sortieren
  static/js/stats/sort.js     Sortierung, Trefferquote
  static/js/stats/render.js   Tabelle, Zusammenfassung, JSON-Ansicht
  static/js/game/game.js      Spielablauf im Browser (Inventar, Aufnehmen, Einsetzen, Senden, Rundenende)
  static/js/game/difficulty.js    Stufen-Texte des Schwierigkeitsreglers
  static/js/menu/difficulty-slider.js  Schwierigkeitsregler im Menü
  static/js/game/refill-meter.js  Anzeige „Noch n Treffer bis +k neue“ am Inventar
  static/js/game/timer-meter.js   Countdown bis zur nächsten Wegnahme (bzw. Schonfrist) am Inventar
  static/js/ui/feed.js        Nachrichtenleiste unten rechts (Meldungen, Chat, einklappbar)
  static/css/feed.css         Nachrichtenleiste
  static/js/game/remote.js    Server-Runde (Einzelspiel/Lobby): Zustand auf Karte, Inventar, Leben, Meldungen abbilden
  static/js/menu/menu.js      Spielmenü (Neues Spiel, Einzelspiel, Lobby): Regeln links, Karte rechts
  static/js/menu/map-picker.js   Kartenauswahl: Preset-Kacheln mit Mini-Weltkarte, Kontinent-Chips, Kleinstaaten, Einzelauswahl
  static/js/menu/map-presets.js  Karten-Presets anwenden/erkennen, Kleinstaaten (< 1.100 km²)
  static/js/home/home.js      Hauptmenü: Aktionen, laufende Spiele (Fortsetzen, Entfernen)
  static/js/home/code-dialog.js  „Lobby beitreten“ per Code oder Link
  static/js/settings/settings-dialog.js  Einstellungs-Popup (Name, Qualität, Empfindlichkeit)
  static/js/settings/prefs.js     Zoom- und Bewegungsempfindlichkeit (localStorage)
  static/js/settings/quality-field.js  Auswahl „Kartenqualität“
  static/js/lobby/client.js   WebSocket-Client mit automatischem Wiederverbinden
  static/js/lobby/lobby-menu.js  Lobby-Bereich im Menü (Link, Spieler, Einstellungen, Rechte)
  static/js/lobby/identity.js Spieler-ID/Token und Name im Browser
  static/js/lobby/join-dialog.js  Name/Passwort-Dialog, Hinweis „Lobby nicht verfügbar/beendet“
  static/js/lobby/rules-text.js   Lobby-Erklärtexte (Aufteilung reihum, Hinweise, Zusammenfassung)
  static/js/lobby/players-rail.js  Mitspieler-Spalte links: Umrisse an Mitspieler senden
  static/js/lobby/confirm.js  Bestätigungsdialog (Verlassen, Beenden)
  static/js/menu/config.js    Standardwerte, Grenzen, Teile-Pool einer Konfiguration
  static/js/menu/stepper.js   Zahlen-Stepper (Schrittweite, Einheit)
  static/js/menu/toggle.js    Schalter-Feld (Kein Zurücklegen, Fehlwurf kostet das Item)
  static/js/menu/presets.js   Spielmodi und Schwierigkeitsstufen (Voreinstellungen, Kennzahlen)
  static/js/menu/mode-picker.js  Einfache Ansicht: Modus, Stufe
  static/js/menu/ttl-field.js Auswahl „Aufbewahren“ (Verfall nach Untätigkeit)
  static/js/menu/item-picker.js  Einzelauswahl der Teile
  static/js/map/icon.js       Umriss-Icons (Inventar, Menü)
  static/js/game/held-piece.js  Teil in der Hand, Einrast-Toleranz, Animationen
  static/js/game/inventory.js   Inventar-Slots
  static/js/game/lives.js     Lebensanzeige
  static/data/map/            Kartendaten mit Detailstufen (generiert, siehe „Kartendaten neu erzeugen“)
docs/spielmodi.md             Spielmodi, Regeln, Balancing, Voreinstellungen
tests/                        pytest: Item-Store, API, Lobbys, Mehrspieler-Runde – jeweils mit JSON und MongoDB (mongomock)
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

`npm run build` führt vier Schritte aus (Dauer: unter einer Minute plus einmalig die Downloads, ~55 MB):

1. `python 1-cells.py` – lädt Natural Earth 1:10m Admin-0 (nach `build/tmp/src`), ordnet jedes Landstück einem Kontinent und höchstens einem Staat-Item zu („Zelle“, z. B. Europa × Russland) und wendet die Sonderfälle unten an. Ausgabe in `build/tmp/`.
2. `node 2-tiles.mjs` – baut daraus `worldmapguessr/static/data/map/`:
   - `tiles/z0…z4/{x}_{y}.json` – Karte in 5 Detailstufen, je Stufe ein Längen-/Breitengrad-Raster (90°, 45°, 22,5°, 11,25°, 5,625°). Inhalt je Kachel: Landflächen je Zelle und Linien (Küsten, Kontinent- und Staatsgrenzen), ganzzahlig und als Differenzen kodiert.
   - `items/i0.json` – alle Items in der Startstufe; `items/i1…i4/{kind}-{id}.json` – feinere Umrisse je Item.
   - `index.json` – Stufen, Zellen, Items (Name, Gruppe, Anker, Fläche), Kachelliste, Version (Hash über die Daten).

3. `python 3-water.py` – Flüsse und Seen (Natural Earth 1:10m `rivers_lake_centerlines`, `lakes`, von GitHub) als Kacheln `water/z0…z4/{x}_{y}.json` im selben Raster: je Objekt die Kartenskala `sMin = 256 · 2^min_zoom / 2π` (aus Natural Earths `min_zoom`), ab der der Browser es zeichnet; je Stufe nur Objekte bis zu ihrem `sMax`, vereinfacht auf 0,6 px. ~5 MB, nur bei Bedarf geladen.
4. `python 4-relief.py` – Geländeschummerung als Graustufen-JPEGs `relief/r0…r3/{x}_{y}.jpg` (512 px; Welt 1024 … 8192 px breit, reine Meereskacheln fehlen; ~3 MB). Quelle: Natural Earth „Shaded Relief“ (gemeinfrei) aus dem PyPI-Paket `basemap-data` (`shadedrelief.jpg`, 10800 × 5400 – naturalearthdata.com ist aus der Build-Umgebung nicht erreichbar). Daraus wird nur die Schummerung gewonnen: Helligkeit ÷ weichgezeichnetes Mittel über Land (σ = 6 px), 128 = neutral; Meer und ein 2-px-Küstensaum sind neutral (Landmaske aus Schritt 1). Braucht `numpy`, `scipy`, `pillow`.

Schritte 3 und 4 ergänzen `index.json` (`water`, `relief`) und setzen die Version neu (`versions`: Hash je Teil). Nach Schritt 2 müssen sie erneut laufen.

**Relief zeichnen:** Die Karte ist pseudozylindrisch (x = λ · fx(φ)), auf jeder Breite ist x also linear in der Länge. Jede Rasterkachel wird in waagerechten Streifen (3 px, beim Bewegen 8 px) auf eine graue Zwischenfläche gezeichnet, die dann einmal über die Landfarben geblendet wird – „hard-light“ auf hellem Land (B), „soft-light“ auf dunklem (A, C; ruhiger, kein Grieseln). Reihenfolge: Landflächen → Relief → Seen und Flüsse → Grenzen → Küsten.

Der Server liefert die Dateien unter `/data/<version>/…` mit einem Jahr Cache aus; nach einem neuen Build ändert sich die Version und der Browser lädt neu.

### Detailstufen (LOD)

- Vereinfachung nach Visvalingam mit sphärischer Dreiecksfläche auf einer gemeinsamen Topologie: Grenzen zweier Zellen werden überall gleich vereinfacht, es entstehen keine Lücken – das gilt auch für spätere Bundesländer/Regionen, deren Außengrenzen genau auf den Staatsgrenzen liegen.
- Stufe z wird bis zur Kartenskala `sMax` benutzt (Pixel je Bogenmaß: 450, 1100, 2800, 7000, ∞; bei 1280 px Breite ≈ Zoom 200 %, 500 %, 1250 %, 3100 %). Ein Punkt bleibt, wenn sein Dreieck bei `sMax` mindestens `PX2` = 4 px² groß wäre; Inseln unter 1 px fallen weg. Die feinste Stufe enthält jeden Punkt der Quelle.
- Beim Zeichnen: nur Kacheln im Ausschnitt; fehlt eine, wird die nächstgröbere geladene gezeichnet, bis sie da ist. Punkte näher als *Schritt* px am vorigen werden übersprungen, Ringe unter 0,5 px ganz. Flächen werden je Kachel und Farbe zu einem Pfad gebündelt (ein `fill` statt eines je Zelle). Höchstens *Speicher* Punkte bleiben im Speicher (älteste Kacheln fallen raus).
- Kartenqualität: Der Detailfaktor multipliziert die Kartenskala bei der Wahl der Stufe – bei „Hoch“ wird Stufe z also schon bei einem Sechstel ihres `sMax` durch die feinere ersetzt. Während Ziehen/Zoomen wird mit dem Bewegungsfaktor gezeichnet und nach dem Loslassen fein nachgezeichnet.

  | | Niedrig | Mittel | Hoch |
  |---|---|---|---|
  | Detailfaktor (Ruhe / Bewegung) | 1 / 1 | 2,5 / 1 | 6 / 2,5 |
  | Schritt (Ruhe / Bewegung, px) | 0,75 / 0,75 | 0,6 / 0,75 | 0,5 / 0,7 |
  | Gehaltenes Item, Schritt (px) | 0,5 | 0,35 | 0,25 |
  | Max-Zoom | 4000 % | 8000 % | 16000 % |
  | Speicher (Punkte) | 2,5 Mio. | 4 Mio. | 6 Mio. |

  „Niedrig“ entspricht dem früheren Verhalten. Die Daten sind für alle Stufen dieselben; höhere Qualität lädt nur früher die feineren Kacheln und Item-Umrisse nach.
- Kacheln überlappen um 1/512 ihrer Seite, und Kanten entlang eines Meridians (Kachelrand, ±180°) sind fein unterteilt – so bleiben keine Haarlinien an Kachelrändern. Unsichtbare Grenzen zwischen gleichfarbigen Zellen werden in der Flächenfarbe nachgezogen.
- Items: Die Startstufe ist je Item so fein, wie sein Inventar-Icon oder die Weltansicht es braucht. Ein aufgenommenes Item lädt die zum Zoom passende Stufe nach (Kontinente höchstens Stufe 3); gezeichnet wird nur der Teil, der beim Verschieben sichtbar werden kann.
- Inventar-Icons (unabhängig von der Kartenqualität): Jedes Icon lädt die Stufe nach, die das Icon bei 4 × Größe × Pixeldichte braucht, und wird neu gezeichnet (Icon-Cache je Stufe). Eingepasst wird immer auf die Startstufe – feinere Stufen bringen winzige, weit entfernte Inseln mit (Clipperton, Kokosinsel, Prinz-Edward-Inseln …), die das Hauptland sonst schrumpfen ließen; was außerhalb liegt, wird abgeschnitten. Umgekehrt lassen feinere Stufen Inseln unter 1 px ihrer Skala weg (Atolle von Kiribati, Malediven …); solche Inseln der Startstufe werden im Icon ergänzt.
- Umlaufsinn: Nach dem Runden auf ganze Zahlen kann ein winziger Ring seine Richtung umkehren; d3 liest ihn dann als „alles außer dieser Fläche“ (z. B. füllte Kiribatis Icon die ganze Box). Der Build dreht Polygone mit sphärischer Fläche > 2π nach dem Runden wieder um.
- Startpaket: `index.json` + `i0.json` + Stufe 0 ≈ 0,4 MB; alles Weitere nach Bedarf.

## Datenentscheidungen

- Quelle: Natural Earth 1:10m Admin-0 in voller Genauigkeit (GeoJSON aus dem Natural-Earth-Repository, nicht quantisiert), Regionen und deutsche Namen aus `world-countries`. Weltweit gleicher Detailgrad, alle Inseln; die Detailstufen sorgen dafür, dass beim Herauszoomen nur so viel gezeichnet wird, wie sichtbar ist. Volle Genauigkeit ist auch die Grundlage für Bundesländer/Regionen (Natural Earth Admin-1), deren Grenzen exakt auf die Staatsgrenzen passen müssen.
- Europäische Staaten nur mit ihren europäischen Landesteilen; Russland ganz. Überseegebiete (Französisch-Guayana, Guadeloupe, Martinique, Réunion, Karibische Niederlande …) gehören zum Kontinent, auf dem sie liegen – nicht mehr zu Europa.
- Staaten Nord- und Südamerikas mit allen Landesteilen: USA inkl. Alaska, Aleuten (über die Datumsgrenze ohne Naht) und Hawaii; Ecuador inkl. Galápagos, Chile inkl. Osterinsel.
- Afrika: Somaliland (in den Quelldaten eigene Fläche, international nicht anerkannt) gehört zum Item Somalia. Marokko ist in den Quelldaten samt dem von ihm kontrollierten Teil der Westsahara eingezeichnet; als Item gilt es wie bei den Vereinten Nationen ohne Westsahara (Grenze 27°40′ N, `CUT_TO` in `build/1-cells.py`) – die Westsahara ist nur Kontinentfläche. Namen: Eswatini (statt Swasiland), Demokratische Republik Kongo / Republik Kongo, Elfenbeinküste.
- Asien: Zypern gehört (samt Nordzypern, UN-Pufferzone und den britischen Basen Akrotiri/Dhekelia) als ein Item zu den Staaten Asiens und auch zur Kontinentfläche Asien. Taiwan und Palästina (Westjordanland + Gaza) sind eigene Items, obwohl sie nicht als unabhängig geführt werden (wie Kosovo). Hongkong und Macao zählen zu China, Baikonur zu Kasachstan; der Siachen-Gletscher ist nur Kontinentfläche. - Inselstaaten aus weit verstreuten Atollen (Tuvalu, Kiribati, Marshallinseln …): Im Inventar und Menü zeigen ihre Icons zu kleine Inseln als Punkte, damit sie sichtbar bleiben.
- Item-Gruppen: Staaten tragen in `index.json` `region` (`EU`/`NA`/`SA`/`AF`/`AS`/`OC`); daraus entstehen die Gruppen `continent`, `country-eu`, `country-na`, `country-sa`, `country-af`, `country-as`, `country-oc` (Menü-Karten, `config.kinds`). Item-Keys bleiben `country:USA` usw., die Statistik ist davon unberührt. Ältere Lobbys mit `kinds: ["country"]` werden beim Laden zu `country-eu`.
- Projektion: Natural Earth 1.
- Europa/Asien: Ural-Kamm → Ural-Fluss → Kaspisches Meer → Kaukasus; Türkei, Georgien, Armenien, Aserbaidschan, Kasachstan = Asien.
- Afrika/Asien: Grenze Ägypten/Israel (Sinai zählt zu Afrika). Nord-/Südamerika: Grenze Panama/Kolumbien.
- Datumsgrenze: Die Quelle ist bei ±180° geteilt. Diese Schnittkanten gelten nicht als Küste (keine Linie), und die Flächen daran ragen wie an Kachelrändern minimal über die Kante – beim Drehen bleibt an der Datumsgrenze keine Naht.
