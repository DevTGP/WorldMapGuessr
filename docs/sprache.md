# Sprache (Deutsch / Englisch)

## Auswahl

- **Automatisch** (Standard): Der Server wählt nach der Browsersprache (`Accept-Language`): Deutsch → Deutsch, alles andere → Englisch.
- **Deutsch / English:** in den Einstellungen unter „Allgemein → Sprache“. Die Wahl liegt im Cookie `wmg_lang` (1 Jahr); ein Wechsel lädt die Seite neu – ein laufendes Spiel liegt auf dem Server und geht weiter.
- In einer Lobby kann jeder Spieler seine eigene Sprache haben; Meldungen erzeugt jeder Browser selbst.

## Umsetzung

- Texte: `worldmapguessr/i18n/de.json` und `en.json`, gleiche Schlüssel (Test: `tests/test_i18n.py`). Fehlt ein Schlüssel im Englischen, gilt der deutsche Text.
- Platzhalter `{name}`; Mehrzahl als Eintrag `{"one": …, "other": …}`, gewählt nach `n`.
- **Seiten (Jinja):** `{{ t('home.play') }}`; die Sprache und `t()` kommen aus `i18n.template_context` (Context-Processor). Einige Texte enthalten HTML (`<b>`, `<kbd>`) und werden mit `| safe` eingesetzt – nur eigene Texte aus den Wörterbüchern.
- **Browser:** Die Seite bringt das Wörterbuch ihrer Sprache mit (`window.WMG.i18n`, ≈ 30 kB, gzip ≈ 8 kB). `static/js/i18n/index.js`:
  - `t(key, vars)` – Text; `parts(key, vars)` – Text mit Platzhaltern als Liste (für Meldungen mit Spielern und Items)
  - `fmt(n)`, `locale` – Zahlen und Sortierung in der Schreibweise der Sprache
  - `serverError(err)` – Fehler des Servers nach Code übersetzt (`err.<code>`, Werte in `err.params`), sonst der Text des Servers
  - `langSetting()`, `setLang(value)` – Einstellung lesen/setzen
- **Item-Namen:** Die Kartendaten tragen je Item `name` (Deutsch) und `nameEn` (aus `world-countries`, Build-Schritt 2). Auf Englisch zeigen Inventar, Menü, Meldungen und Statistik `nameEn`. Statistik-API: `/api/items` liefert `nameEn` mit.
- Der Server schreibt Fehlermeldungen und Logs auf Deutsch; übersetzt wird im Browser über den Code.

## Begriffe

| Deutsch | Englisch | Bedeutung |
|---|---|---|
| Item | item | Kontinent, Staat (später Bundesland) zum Einsetzen |
| Inventar | inventory | eigene Items unten |
| Vorrat | pool | noch nicht ausgeteilte Items der Runde |
| Einsetzen, Treffer, Fehlwurf | place, hit, miss | |
| Zurücklegen / Kein Zurücklegen | put back / No take-backs | |
| Nachschub | refill | neue Items nach Treffern |
| Wegnahme, Schonfrist, Endspurt | taken, grace period, final stretch | Timer |
| Einzelspiel | solo game | Solo-Lobby |
| Lobby, Host, Spieler | lobby, host, player | |
| Punkte, Teambonus | points, team bonus | |

Anrede im Deutschen durchgängig „du“.
