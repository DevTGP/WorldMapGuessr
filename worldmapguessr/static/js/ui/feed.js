// Nachrichtenleiste unten rechts: alle Meldungen des Spiels (Einsetzen und Fehlwürfe aller Spieler,
// Ausgabe, Senden, Wegnahme durch den Timer, Hinweise) und – in einer Lobby – der Chat.
// Neue Meldungen stehen unten; ältere werden blasser, bleiben aber lesbar (Verlauf scrollbar).
// Eingeklappt zeigt die Leiste nur die neueste Meldung.

const MAX_ENTRIES = 80;
const FADE_AFTER_MS = 12000;
const COLLAPSED_KEY = "wmg.feed.collapsed";

/** Feste Farbe je Spieler (Name in Meldungen und Chat) */
export function playerHue(id) {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
}

export class Feed {
  /**
   * @param {HTMLElement} root  #feed
   * @param {{onChat?: (text: string) => void}} [opts]
   */
  constructor(root, { onChat } = {}) {
    this.root = root;
    this.list = root.querySelector(".feed-list");
    this.form = root.querySelector(".feed-chat");
    this.input = this.form.querySelector("input");
    this.toggleBtn = root.querySelector(".feed-toggle");
    this.onChat = onChat;
    this.unread = 0;

    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text || !this.onChat) return;
      this.onChat(text);
      this.input.value = "";
    });
    // Tasten im Chat nicht an die Karte (Zoom, Drehen) oder das Spiel (Esc) weitergeben
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.input.blur();
    });
    this.toggleBtn.addEventListener("click", () => this.setCollapsed(!this.collapsed));
    let collapsed = matchMedia("(max-width: 640px)").matches;
    try { collapsed = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? String(collapsed)); } catch { /* ohne Speicher */ }
    this.setCollapsed(collapsed, false);
    this._fader = setInterval(() => this._fade(), 2000);
  }

  /** Chat-Eingabe zeigen (Lobby) */
  enableChat(onChat) {
    this.onChat = onChat;
    this.form.hidden = false;
    this.root.classList.add("with-chat");
  }

  setCollapsed(collapsed, remember = true) {
    this.collapsed = collapsed;
    this.root.classList.toggle("collapsed", collapsed);
    this.toggleBtn.setAttribute("aria-expanded", String(!collapsed));
    this.toggleBtn.title = collapsed ? "Meldungen aufklappen" : "Meldungen einklappen";
    if (!collapsed) { this.unread = 0; this._badge(); this._scroll(); }
    if (remember) try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed)); } catch { /* egal */ }
  }

  /**
   * Meldung anhängen.
   * @param {{kind?: string, parts: (string|{who: string, id?: string}|{item: string}|{b: string})[]}|string} msg
   *   kind: good | bad | info | take | gift | refill | chat | hint · parts: Text, Spieler, Item, fett
   */
  push(msg, kind = "info") {
    if (typeof msg === "string") msg = { parts: [msg], kind };
    const li = document.createElement("li");
    li.className = `msg ${msg.kind ?? kind}`;
    li.dataset.t = String(performance.now());
    const icon = document.createElement("i");
    icon.className = "msg-icon";
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = "msg-text";
    for (const p of msg.parts) text.append(part(p));
    li.append(icon, text);
    this.list.append(li);
    while (this.list.children.length > MAX_ENTRIES) this.list.firstElementChild.remove();
    if (this.collapsed && msg.kind !== "hint") { this.unread++; this._badge(); }
    this._scroll();
    return li;
  }

  /** Chat-Nachricht eines Spielers */
  chat({ id, name, text, mine }) {
    const li = this.push({ kind: "chat", parts: [{ who: mine ? "Du" : name, id }, ": ", text] });
    if (mine) li.classList.add("mine");
  }

  /** Alles leeren (neue Runde im Einzelspiel) */
  clear() { this.list.replaceChildren(); }

  _scroll() {
    // nur mitscrollen, wenn man nicht gerade weiter oben im Verlauf liest
    const l = this.list;
    if (l.scrollHeight - l.scrollTop - l.clientHeight < 80 || this.collapsed) l.scrollTop = l.scrollHeight;
  }

  _fade() {
    const now = performance.now();
    for (const li of this.list.children) {
      if (!li.classList.contains("old") && now - Number(li.dataset.t) > FADE_AFTER_MS) li.classList.add("old");
    }
  }

  _badge() {
    this.toggleBtn.dataset.unread = this.unread > 0 && this.collapsed ? String(Math.min(this.unread, 99)) : "";
  }
}

function part(p) {
  if (typeof p === "string") return document.createTextNode(p);
  if ("who" in p) {
    const b = document.createElement("b");
    b.className = "who";
    b.textContent = p.who;
    if (p.id) b.style.setProperty("--hue", playerHue(p.id));
    return b;
  }
  if ("item" in p) {
    const b = document.createElement("b");
    b.className = "item";
    b.textContent = p.item;
    return b;
  }
  const b = document.createElement("b");
  b.textContent = p.b;
  return b;
}
