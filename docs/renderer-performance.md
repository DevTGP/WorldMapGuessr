# Renderer: Messungen und Optimierungsmöglichkeiten

## Stand: WebGL-Renderer (umgesetzt)

`static/js/map/gl-renderer.js` zeichnet die Karte mit WebGL 2, wenn der Browser es mit Hardware-Beschleunigung
anbietet (`failIfMajorPerformanceCaveat`); sonst zeichnet der Canvas-Renderer unten (`renderer.js`). Zum
Vergleichen: `?canvas` bzw. `?webgl` (WebGL auch ohne Beschleunigung).

- Kacheln liegen einmal als (λ, φ) im Grafikspeicher, Flächen fertig trianguliert (`build/5-binary.mjs`). Der
  Vertex-Shader projiziert (Natural Earth / Equal Earth sind geschlossene Formeln): Drehen, Zoomen, Verschieben
  ändern nur Uniforms – kein Neuaufbau von Pfaden.
- Kacheln an der Schnittlinie werden zweimal gezeichnet (um 2π versetzt); ein Stencil mit der Erdform schneidet ab.
- Landfarben je Zelle aus einer Textur (Aufhell-Animation = Textur-Update), Grenzklassen (Kontinent, Staat,
  Bundesland, Küste) entscheidet der Shader aus einer zweiten Textur mit dem Einsetz-Stand.
- Linien sind Kapseln je Strecke. Die Deckung kommt per MAX in eine Textur (eine Linienart je Farbkanal) und
  wird einmal überblendet – wie ein Canvas-Strich über den ganzen Pfad (sonst addieren sich bei kleinem Zoom
  die Kanten vieler kurzer Strecken).
- Relief: Das Bild bis zu den Landflächen wird in eine Textur übernommen; jede Rasterkachel liegt als Gitter auf
  der Erde und mischt ihren Grauwert mit den Formeln von „hard-light“/„soft-light“ (W3C Compositing).
- Namen und Ringe um Kleinststaaten: 2D-Fläche darüber (`.map-overlay`).
- Pixelvergleich mit dem Canvas-Renderer (5 Ansichten, mit/ohne eingesetzte Items, Kosmos, DPR 1/2): mittlere
  Abweichung ≈ 1/255; WebGL zeichnet Küsten etwas detailreicher (keine übersprungenen Punkte).
- Messung nur mit Software-GPU (SwiftShader) möglich: Dort ist WebGL ≈ 10× langsamer als Canvas – deshalb der
  Rückfall ohne Beschleunigung. Auf echter GPU ist der JS-Anteil je Bild < 1 ms; Werte auf Zielgeräten fehlen.

Canvas-Renderer: Die Relief-Zwischenfläche wird wiederverwendet, solange Ansicht und geladene Rasterkacheln gleich
sind (Aufhell-Animation, nachkommende Kacheln: ≈ −11 % je Bild bei DPR 2).

## Frühere Überlegungen (Canvas)

Stand vor dem WebGL-Renderer. Code: `static/js/map/renderer.js` (Flächen, Linien),
`relief.js` (Schummerung), `water.js`, `map.js` (Bildaufbau).

## Wie ein Bild entsteht

Jede Änderung der Ansicht (Drehen, Zoomen, Verschieben), jede geladene Kachel und jede Einblend-Animation nach dem
Einsetzen (500 ms) zeichnet die ganze Karte neu, höchstens einmal je Frame:

1. Meer und Gradnetz über d3 (wenige Punkte).
2. Für jede sichtbare Kachel: Punkte projizieren (x = tx + s·(λ + rot)·fx(φ), y = ty − s·Y(φ)) und in `Path2D` je Farbe schreiben; Linien je Art (Küste, Grenze, Naht).
3. Flächen füllen, Nähte, **Relief** (Rasterkacheln in 3-px-Streifen auf eine Zwischenfläche, dann überblenden), Seen/Flüsse, Grenzen, Küsten, Ringe um Kleinststaaten, Namen (`labels.js`).

Die Projektion ist pseudozylindrisch: Eine Drehung verschiebt jede Zeile um s·rot·fx(φ) – je Breite anders. Ein
einmal projizierter Pfad lässt sich deshalb weder bei Drehung noch bei Zoom per Canvas-Transformation
wiederverwenden, nur bei unveränderter Ansicht.

## Messung

Headless Chromium, Software-Rasterung (keine GPU), 1280 × 800, DPR 1, Qualität Mittel, Schema B, Relief Leicht,
Flüsse an. Mittel über 20 Bilder, Zeit im Hauptthread je Bild:

| Ansicht | gesamt | Relief | Pfade + Füllen | Wasser | `drawImage`-Aufrufe (Relief) |
|---|---|---|---|---|---|
| Welt, Stillstand | 13,6–15,1 ms | 7,7–8,6 ms | 5,3 ms | 0,6 ms | ≈ 1060 |
| Welt, Bewegung | 7,3 ms | 4,7 ms | 2,2 ms | 0,4 ms | |
| Europa ×4, Stillstand | 12,2 ms | 9,0 ms | 2,4–2,8 ms | 0,4 ms | ≈ 2120 |
| Alpen ×30, Stillstand | 5,3 ms | 4,4 ms | 0,7 ms | 0,2 ms | ≈ 800 |

- Ohne die Relief-Streifen (nur graue Fläche + Überblenden) kostet das Relief 0,5 ms. Die Kosten stecken also in den ≈ 800–2100 `drawImage`-Aufrufen je Bild (Streifen × sichtbare Rasterkacheln), nicht im Überblenden.
- Canvas-Befehle werden gesammelt und erst beim nächsten Überblenden bzw. am Frame-Ende ausgeführt – die Zuordnung der Zeit zu einzelnen Schritten ist daher nur näherungsweise.
- Mit GPU-Beschleunigung (normaler Browser) sind `drawImage` und Füllen meist günstiger; bei DPR 2 (Retina, viele Handys) sind viermal so viele Pixel zu füllen. Werte auf echten Geräten können deutlich abweichen und sollten vor einer Entscheidung gemessen werden (Performance-Tab, `WMG.map` in der Konsole).

## Möglichkeiten

| # | Maßnahme | Erwarteter Effekt | Aufwand | Nachteile / Risiken |
|---|---|---|---|---|
| 1 | **Relief-Zwischenfläche wiederverwenden**, solange Ansicht, Stufe und geladene Rasterkacheln gleich sind (nur neu überblenden) | Einblend-Animation, nachgeladene Vektor-Kacheln, Farbwechsel: Relief 5–9 → 0,5 ms | klein | hilft nicht beim Drehen/Zoomen |
| 2 | **Pfade wiederverwenden** bei unveränderter Ansicht (nur Farben neu zuordnen) | wie 1 für Pfade: 2–5 ms weniger bei Animationen | klein–mittel | Speicher für Pfade je Kachel; Farbe hängt an der Zelle, Pfade müssten je Zelle statt je Farbe gebündelt werden (mehr `fill`-Aufrufe) |
| 3 | **Relief vorab entzerren:** je Stufe und Maßstab ein Zwischenbild in Plattkarte (x = s·λ), gezeichnet wird dann je Streifen nur noch ein Ausschnitt statt je Rasterkachel | `drawImage`-Aufrufe ÷ Anzahl Kachelspalten (Welt ≈ ÷4, Europa ×4 ≈ ÷8); Drehen ohne Neuaufbau | mittel | Zwischenbild muss bei Zoom neu entstehen (beim Zoomen kein Gewinn); Speicher (z. B. 2560 × 1280 px ≈ 13 MB) |
| 4 | **Streifenhöhe je Breite anpassen:** Nahe dem Äquator ändert sich fx(φ) kaum, dort reichen hohe Streifen; nur zu den Polen hin dünne | weniger Streifen bei gleicher Genauigkeit (grob ÷2) | klein | Rechnung der zulässigen Höhe je Zeile; sichtbare Stufen, wenn zu grob |
| 5 | **Relief in halber Auflösung** zeichnen und beim Überblenden hochskalieren | Pixelarbeit ÷4 bei DPR 2; Aufrufe gleich | klein | weicheres Relief (bei Schummerung kaum sichtbar) |
| 6 | **Relief beim Bewegen weglassen** (oder letztes Bild behalten) | Bewegung: 4–5 ms weniger je Bild | klein | Relief „springt“ beim Loslassen ein |
| 7 | **Ebenen trennen:** statische Grundkarte, Relief, Linien als eigene Canvas-Ebenen übereinander (Überblenden per CSS `mix-blend-mode`) | Änderungen zeichnen nur ihre Ebene neu (z. B. Einblenden nur Flächen) | mittel | Reihenfolge Relief ↔ Wasser/Grenzen erzwingt mind. 3 Ebenen; mehr Speicher; CSS-Blending je Browser unterschiedlich schnell |
| 8 | **OffscreenCanvas im Worker** | Hauptthread frei (Eingaben, Animationen bleiben flüssig), Rechenzeit gleich | mittel–groß | Kacheln, Projektion und Zustand müssen in den Worker; Safari erst ab 16.4 |
| 9 | **WebGL:** Flächen einmal je Kachel triangulieren (z. B. earcut), Projektion im Vertex-Shader mit rot/s/tx/ty als Uniforms; Relief als Textur, Entzerrung und Überblenden im Fragment-Shader | Drehen/Zoomen ohne Neuaufbau der Geometrie, Relief praktisch kostenlos | groß | neuer Renderer (Linienbreiten, Kantenglättung, Nähte, Kleinststaat-Ringe neu lösen); Triangulierung beim Laden; Fallback für Geräte ohne WebGL |
| 10 | **DPR begrenzen** (heute ≤ 2) z. B. auf 1,5 beim Bewegen | Pixelarbeit ≈ ÷1,8 beim Bewegen | klein | beim Bewegen etwas unschärfer |

Einordnung ohne Wertung:
- 1, 4, 5, 6 und 10 sind lokale Änderungen in `relief.js`/`renderer.js` und lassen sich einzeln messen und zurücknehmen.
- 3 und 7 ändern den Aufbau des Zeichnens, bleiben aber im Canvas-2D-Modell.
- 8 und 9 sind Umbauten; 9 verschiebt fast alle Kosten auf die GPU, 8 nur in einen anderen Thread.
- Wie viel davon auf echten Geräten spürbar ist, hängt vor allem von der GPU-Beschleunigung des Canvas ab – ohne Messung auf Zielgeräten (Handy, Laptop mit DPR 2) ist die Reihenfolge der Wirkung unsicher.
