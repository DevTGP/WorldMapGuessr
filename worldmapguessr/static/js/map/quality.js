// Kartenqualität (Einstellung je Gerät, im Browser gespeichert): wie viel Detail geladen und gezeichnet wird.
//
// Die Daten sind dieselben; höhere Qualität wählt bei gleichem Zoom eine feinere Detailstufe (detail ×
// Kartenskala, siehe tiles.levelFor), zeichnet dichter (step: Mindestabstand zweier Punkte in Pixeln), erlaubt
// Der maximale Zoom ist überall gleich (map.js MAX_ZOOM). Inventar-Icons sind davon unabhängig immer fein
// (game/game.js _refineIcons). Einstellbar im Einstellungs-Popup (settings/settings-dialog.js).
//   Niedrig: Stufe passend zur Skala (bisheriges Verhalten)
//   Mittel:  eine Stufe feiner (Faktor 2,5)
//   Hoch:    zwei Stufen feiner (Faktor 6) – braucht mehr Rechenleistung und Download

const KEY = "wmg.quality";

// detail/step gelten im Stillstand; während Ziehen/Zoomen (moveDetail/moveStep) wird gröber gezeichnet,
// damit die Bewegung flüssig bleibt – nach dem Loslassen kommt sofort die volle Qualität.
export const QUALITIES = {
  low: {
    label: "Niedrig", detail: 1, step: 0.75, moveDetail: 1, moveStep: 0.75, shelfStep: 2.5,
    pieceStep: 0.5, maxPoints: 2_500_000,
  },
  medium: {
    label: "Mittel", detail: 2.5, step: 0.6, moveDetail: 1, moveStep: 0.75, shelfStep: 2.5,
    pieceStep: 0.35, maxPoints: 4_000_000,
  },
  high: {
    label: "Hoch", detail: 6, step: 0.5, moveDetail: 2.5, moveStep: 0.7, shelfStep: 2,
    pieceStep: 0.25, maxPoints: 6_000_000,
  },
};
export const DEFAULT_QUALITY = "medium";

const listeners = new Set();
let current = read();

function read() {
  try {
    const v = localStorage.getItem(KEY);
    return v in QUALITIES ? v : DEFAULT_QUALITY;
  } catch {
    return DEFAULT_QUALITY;
  }
}

export const quality = {
  get id() { return current; },
  get value() { return QUALITIES[current]; },
  set(id) {
    if (!(id in QUALITIES) || id === current) return;
    current = id;
    try { localStorage.setItem(KEY, id); } catch { /* ohne Speicher: gilt bis zum Neuladen */ }
    for (const fn of listeners) fn(QUALITIES[id], id);
  },
  /** @param {(q: object, id: string) => void} fn */
  onChange(fn) { listeners.add(fn); },
};
