# Einzelspiel, Lobbys, Mehrspieler-Runde

Code: `worldmapguessr/lobbies/` (Server), `static/js/lobby/` und `static/js/game/remote.js` (Browser).

## Einzelspiel = Solo-Lobby

- Jede Runde läuft auf dem Server, auch das Einzelspiel: „Einzelspiel starten“ im Spielmenü legt eine Lobby nur für einen Spieler an (`solo`) und startet die Runde darin. Die Adresse wird zu `/CODE`; der Browser merkt sich ID und Token (localStorage `wmg.lobby.CODE`, wie bei jeder Lobby).
- **Fortsetzen:** über „Laufende Spiele“ im Hauptmenü – auch Stunden oder Tage später, solange es nicht verfallen ist (Inventar, Leben, eingesetzte Items, Timer und Punkte bleiben erhalten). Mehrere Einzelspiele gleichzeitig sind möglich. „Runde neu starten“ startet in derselben Solo-Lobby neu (mit Rückfrage, wenn eine Runde läuft).
- Niemand sonst kann beitreten (auch nicht mit dem Code). Die Oberfläche bleibt die des Einzelspiels: Badge „Einzelspiel“, kein Chat, keine Sende-Spalte.
- **Mitspieler einladen:** Knopf im Spielmenü → Name eingeben → aus dem Einzelspiel wird eine normale Lobby, die laufende Runde geht mit allen weiter, die über den Link beitreten.
- **Aufbewahren** (Einzelspiel und Lobby, nur Host): 1 h, 3 h, 6 h, 12 h, 1 Tag (Standard), 2, 3 oder 7 Tage. So lange bleibt eine Lobby samt Runde ohne Aktivität erhalten, danach wird sie gelöscht. Jede Aktion (Einsetzen, Chat, Einstellungen …) setzt die Zeit neu.

## Lobbys

- **Erstellen:** im Spielmenü „Lobby erstellen“ → Name eingeben → Weiterleitung auf den Lobby-Link. Die aktuellen Menü-Einstellungen werden übernommen, der Ersteller ist Host.
- **Link:** `http://127.0.0.1:5000/K7Q2M` – 5 Zeichen aus `23456789ABCDEFGHJKMNPQRSTUVWXYZ` (ohne 0/O, 1/I/L), ≈ 28,6 Mio. Codes. Klein geschrieben wird weitergeleitet.
- **Beitreten:** Link öffnen oder Code im Hauptmenü eingeben → Name (und ggf. Passwort). Jederzeit möglich, auch während einer Runde.
- **Wiedererkennung:** Spieler-ID und Token liegen im Browser (localStorage). Neu laden oder später zurückkommen führt ohne erneuten Beitritt in dieselbe Rolle – auch als Host.
- **Einstellungen (nur Host):** Spielkonfiguration wie im Einzelspiel, max. Spielerzahl (Standard 8), Passwort (setzen/entfernen), „Items senden“ (Standard an), Sendelimit (je Modus: Casual 3, Vereinfachter Fokus 4, Fokus 5, Tempo 5, Hardcore 10; 0 = ohne), Inventar-Grenze (Standard 20 Items je Spieler, 0–60, 0 = ohne). Lobby-Einstellungen stehen unter „Erweitert“. Gäste sehen alles live, aber gesperrt.
- **Host-Wechsel:** Ist der Host länger als 10 s getrennt, übernimmt der am längsten anwesende Spieler.
- **Spielerliste:** alle Spieler der Lobby, getrennte ausgegraut, der Host mit Krone.
- **Spieler entfernen (nur Host):** × neben dem Namen → Bestätigung. Die Items des Spielers gehen zurück in den Vorrat, seine Identität wird ungültig; er sieht „Aus der Lobby entfernt“ und kann über den Link als neuer Spieler wieder beitreten. Alle sehen eine Meldung.
- **Verlassen (alle):** „Lobby verlassen“ im Menü oder „Entfernen“ im Hauptmenü → Bestätigung. Die Items gehen zurück in den Vorrat, die Identität wird gelöscht; über den Link kann man als neuer Spieler wieder beitreten. Verlässt der Host, geht die Rolle sofort an den am längsten anwesenden Online-Spieler. Verlässt der letzte Spieler, wird die Lobby gelöscht.
- **Beenden (nur Host):** „Lobby beenden“ bzw. „Entfernen“ im Hauptmenü → die Lobby wird für alle gelöscht; alle anderen sehen „Lobby beendet“.
- **Chat:** Eingabefeld unten in der Nachrichtenleiste (Enter sendet, max. 200 Zeichen). Die letzten 50 Nachrichten werden mit der Lobby gespeichert; wer beitritt, sieht die letzten 10.

## Inaktive Lobbys

- Ist eine Lobby **10 Minuten** ohne Aktivität und niemand verbunden, wird sie **inaktiv**: Sie verlässt den Speicher des Servers, bleibt aber vollständig gespeichert (MongoDB bzw. `instance/lobbies.json`) – Spieler, Runde, Inventare, Punkte, Chat. Ein laufender Timer wird dabei angehalten.
- **Wiederherstellen:** jederzeit und ohne Zutun – beim nächsten Zugriff (Link öffnen, Beitreten, „Fortsetzen“ im Hauptmenü, WebSocket-Verbindung) lädt der Server sie wieder in den Speicher. Das Hauptmenü und der Beitrittsdialog lesen nur (ohne Wiederherstellen) und zeigen „inaktiv“.
- **Löschen:** erst nach dem eingestellten Zeitraum („Aufbewahren“, gerechnet ab der letzten Aktivität) – für aktive und inaktive Lobbys gleich.
- Pflege: Ein Hintergrund-Thread prüft jede Minute (inaktiv setzen) und alle 10 Minuten auch den Verfall (`LobbyHub.maintain`, `LobbyStore.hibernate`/`expire`). Beim Serverstart sind alle gespeicherten Lobbys inaktiv und werden erst bei Bedarf geladen.

## Mehrspieler-Runde

Der Server führt die Runde (`lobbies/round.py`); der Browser prüft nur, ob ein Item passt, und meldet das Ergebnis.

- **Jedes Item nur einmal:** ein gemeinsamer, gemischter Vorrat. Jedes Item liegt entweder im Vorrat, im Inventar genau eines Spielers oder ist eingesetzt. Fremde Inventare sieht niemand (nur deren Größe).
- **Eingesetzte Items synchron:** Jedes richtig eingesetzte Item erscheint sofort bei allen auf der Karte, dazu eine Meldung mit Punkten. Der Fortschritt gilt für die Lobby.
- **Gemeinsame Leben:** Jeder Fehlwurf kostet der ganzen Lobby ein Leben. Bei 0 endet die Runde für alle – ebenso, wenn alle Inventare leer sind, solange der Vorrat noch Items hat.
- **Spielerzahl:** Start-Items und Leben sind Werte für einen Spieler; die Runde startet mit S + 2·(n−1) Items und L + 2·(n−1) Leben (siehe [spielmodi.md](spielmodi.md)).
- **Start und Nachschub reihum:** Die Start-Items und `Neue Items` werden als Gesamtzahl reihum verteilt, in fester Reihenfolge (wer am längsten in der Lobby ist, zuerst) und über alle Verteilungen der Runde hinweg – jeder bekommt am Ende gleich viele Items vom Server (höchstens eins Unterschied). Nachschub gibt es nach je `Nachschub alle` Treffern der *ganzen Lobby*; getrennte Spieler werden übersprungen.
- **Später beitreten:** Wer in eine laufende Runde kommt, sieht alle eingesetzten Items, bekommt sofort 2 Items, die Lobby 2 Leben mehr, und er reiht sich hinten ins Verteilen ein.
- **Verbindung weg:** Das Inventar bleibt reserviert, bis der Spieler zurückkommt oder die Lobby verfällt. Beim Verteilen und bei der Wegnahme durch den Timer wird er übersprungen.
- **Items senden:** Links steht ein Feld je Online-Mitspieler (Name, Anzahl seiner Items). Item aufnehmen, dann ein Feld anklicken → das Item liegt danach im Inventar des Mitspielers.
- **Inventar-Grenze:** Ein Spieler hält höchstens so viele Items (Standard 20). Wer voll ist, wird beim Austeilen (Start, Nachschub, Beitritt) übersprungen – was niemand mehr aufnehmen kann, bleibt im Vorrat. Senden an einen vollen Mitspieler lehnt der Server ab (`hand_full`). Eine niedrigere Grenze während der Runde nimmt niemandem Items weg.
- **Sendelimit:** Je N vom Server erhaltene Items darf ein Spieler 1 Item senden (0 = ohne Limit). Geschenkte Items zählen nicht mit. Der Server prüft (`send_limit`).
- **Timer in der Lobby:** gemeinsamer fester Takt ab Rundenbeginn (Prüfung alle 0,5 s), nach der Schonfrist je Takt *Wegnahme* Items insgesamt – reihum, bei jedem Spieler sein ältestes Item.
- **Rundenende:** Gewonnen (alles eingesetzt) oder verloren – der Dialog erscheint bei allen, mit Rangliste und Teamsumme ([punkte.md](punkte.md)). Nur der Host sieht „Neue Runde für alle“. „Hauptmenü“ beendet das Spiel: Der Host beendet die Lobby für alle (im Einzelspiel ebenso), Gäste verlassen sie – ohne Rückfrage. „Lobby“ öffnet die Lobbyübersicht mit den Einstellungen der Runde.
- Der Rundenzustand wird mit der Lobby gespeichert und übersteht einen Server-Neustart.

## Technik

- WebSocket `/ws/lobby/<code>` über `flask-sock`. Protokoll (JSON):
  - Client → Server: `join`, `settings`, `start`, `place {key, correct}`, `give {key, to}`, `chat {text}`, `pause {paused}` (nur Einzelspiel), `rename`, `leave`, `close`, `kick {player}` (nur Host), `ping`.
  - Server → Client: `welcome`, `state {lobby, hand, sends}`, `error {code, message, params?, fatal?}`, `left`, `closed`, `kicked`, `pong`.
  - Der Rundenzustand enthält ein Ereignisprotokoll (`log`, letzte 40 Ereignisse mit `seq`), aus dem jeder Browser die Meldungen genau einmal erzeugt.
  - Fehler tragen einen Code; der Browser zeigt den Text in seiner Sprache (`err.<code>`, siehe [sprache.md](sprache.md)).
- HTTP:
  - `POST /api/lobbies` (`{name, config, solo, ttl, maxPlayers, password}`)
  - `GET /api/lobbies/<code>` (öffentliche Infos, stellt nicht wieder her)
  - `POST /api/lobbies/mine` (`{lobbies: [{code, id, token}]}` → Überblick je Lobby mit `active`, Punkten; `gone`: die übrigen)
  - `DELETE /api/lobbies/<code>` (`{id, token}`: Host beendet, sonst verlassen)
- Speicherung: MongoDB-Collection `lobbies` bzw. `instance/lobbies.json`; Passwörter nur als Hash, Spieler-Tokens als SHA-256.
