// Mehrsprachigkeit (Deutsch, Englisch) im Browser. Die Seite bringt das Wörterbuch ihrer Sprache mit
// (window.WMG.i18n = {lang, dict}, vom Server aus worldmapguessr/i18n/*.json); die Sprache wählt der Server
// (Cookie wmg_lang, sonst Browsersprache). Ein Wechsel in den Einstellungen setzt das Cookie und lädt neu –
// das laufende Spiel liegt auf dem Server und geht weiter.
//
//   t("home.play")                        → Text
//   t("feed.placedBy", {name: "Anna"})    → Platzhalter {name}
//   t("unit.items", {n: 3})               → Mehrzahl: Eintrag {one, other}, gewählt nach n
//   parts("feed.placedBy", {name: …})     → Text mit Platzhaltern als Liste (für Meldungen mit Spielern/Items)

const I18N = window.WMG?.i18n ?? { lang: "de", dict: {} };
const COOKIE = "wmg_lang";

/** Aktive Sprache ("de" | "en") */
export const LANG = I18N.lang;
export const locale = LANG === "de" ? "de-DE" : "en-GB";
const dict = I18N.dict;

/** Zahl in der Schreibweise der Sprache */
export const fmt = (n, opts) => new Intl.NumberFormat(locale, opts).format(n);

function entry(key, vars) {
  let v = dict[key];
  if (v === undefined) {
    console.warn(`i18n: ${key} fehlt`);
    return key;
  }
  if (typeof v === "object") v = vars.n === 1 ? v.one : v.other;
  return v;
}

const show = (v) => (typeof v === "number" ? fmt(v) : v);

/** Text zu einem Schlüssel, Platzhalter {name} ersetzt */
export function t(key, vars = {}) {
  return entry(key, vars).replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : show(vars[k])));
}

/**
 * Wie t(), aber als Liste aus Textstücken und den Platzhalter-Werten selbst (z. B. {who}/{item}-Objekte für die
 * Nachrichtenleiste). parts("feed.placedBy", {player: {who: "Anna"}}) → [{who: "Anna"}, " hat ", …].
 * Ein Wert als Liste wird eingefügt (mehrere Stücke an einer Stelle).
 */
export function parts(key, vars = {}) {
  const out = [];
  let last = 0;
  const text = entry(key, vars);
  text.replace(/\{(\w+)\}/g, (m, k, i) => {
    if (i > last) out.push(text.slice(last, i));
    const v = vars[k];
    if (Array.isArray(v)) out.push(...v);
    else out.push(v === undefined ? m : show(v));
    last = i + m.length;
    return m;
  });
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Fehlermeldung des Servers ({code, message}) in der Sprache der Seite; unbekannte Codes: Text des Servers */
export function serverError(err) {
  const key = `err.${err?.code}`;
  return key in dict ? t(key, err.params ?? {}) : err?.message ?? String(err);
}

/** Eingestellte Sprache: "auto" (Browser) | "de" | "en" */
export function langSetting() {
  const m = document.cookie.match(/(?:^|;\s*)wmg_lang=(de|en)/);
  return m ? m[1] : "auto";
}

/** Sprache umstellen (Cookie) und neu laden */
export function setLang(value) {
  if (value === langSetting()) return;
  document.cookie = value === "auto"
    ? `${COOKIE}=; path=/; max-age=0; SameSite=Lax`
    : `${COOKIE}=${value}; path=/; max-age=31536000; SameSite=Lax`;
  location.reload();
}
