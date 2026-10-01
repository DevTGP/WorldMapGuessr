// Service Worker: Kartendaten (/data/<version>/…) und gebündelte Dateien (/static/dist/…) ändern sich nie –
// die Version bzw. der Hash steckt im Pfad. Er hält sie in einem Cache und liefert sie von dort, ohne das Netz
// zu fragen: Ein zweiter Besuch startet ohne Download, einmal geladene Kacheln sind sofort da (auch offline).
// Alles andere (Seite, API, WebSocket) geht unverändert ans Netz.
//
// Registriert von main.js als /sw.js?b=<Build>&m=<Kartenversion> (nur mit Bündel, siehe assets.py). Ändert
// sich eins davon, ist es ein neuer Service Worker; beim Aktivieren löscht er die Caches der alten Stände.

const params = new URL(self.location.href).searchParams;
const ASSETS = `wmg-assets-${params.get("b") ?? ""}`;
const DATA = `wmg-data-${params.get("m") ?? ""}`;
const ROOT = new URL("./", self.location.href).pathname; // "/" bzw. Präfix, unter dem die App läuft
const ASSET_PREFIX = `${ROOT}static/dist/`;
const DATA_PREFIX = `${ROOT}data/${params.get("m") ?? ""}/`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith("wmg-") && name !== ASSETS && name !== DATA) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const cache = url.pathname.startsWith(ASSET_PREFIX) ? ASSETS : url.pathname.startsWith(DATA_PREFIX) ? DATA : null;
  if (cache) event.respondWith(cacheFirst(cache, req));
});

async function cacheFirst(name, req) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.status === 200) cache.put(req, res.clone()).catch(() => {}); // Speicher voll: ohne Cache weiter
  return res;
}
