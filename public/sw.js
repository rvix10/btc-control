/* Service worker: permite abrir la app sin conexión.
   Estrategia: stale-while-revalidate para lo propio, red directa para la API de precios. */
const CACHE = "control-btc-v2";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  // CoinGecko y cualquier otro origen: siempre a la red, nunca cacheado
  if (new URL(req.url).origin !== location.origin) return;

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cacheada = await cache.match(req);
    const desdeRed = fetch(req)
      .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
      .catch(() => null);

    if (cacheada) return cacheada;           // responde ya, revalida en segundo plano
    const res = await desdeRed;
    if (res) return res;
    if (req.mode === "navigate") {           // sin red y sin caché: intenta el index
      const idx = await cache.match("./") || await cache.match("./index.html");
      if (idx) return idx;
    }
    return new Response("Sin conexión", { status: 503, headers: { "content-type": "text/plain" } });
  })());
});
