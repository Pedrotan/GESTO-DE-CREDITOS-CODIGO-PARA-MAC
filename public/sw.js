const CACHE_NAME = 'tango-creditos-pwa-v3';
const APP_SHELL = ['/', '/manifest.webmanifest', '/favicon.png', '/pwa-192.png', '/pwa-512.png', '/sql-wasm.wasm'];

// Guardar em cache nunca pode partir a página: uma resposta cortada a meio (rede lenta, download
// interrompido) fazia o Cache.put() rejeitar sem tratamento. Só se guardam respostas completas (200).
const storeInCache = (key, response) => {
  if (!response || response.status !== 200 || response.type !== 'basic') return;
  caches.open(CACHE_NAME)
    .then(cache => cache.put(key, response))
    .catch(() => { /* resposta incompleta: fica para o próximo pedido */ });
};

self.addEventListener('install', event => {
  // Cada ficheiro do esqueleto é opcional: um que falhe não impede a instalação.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.all(APP_SHELL.map(url => cache.add(url).catch(() => undefined)))));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  // Eventos em tempo real (SSE) nunca passam pela cache: uma resposta HTML guardada partia a ligação.
  if (url.pathname === '/events' || (request.headers.get('accept') || '').includes('text/event-stream')) return;
  // Pedidos parciais (Range) não podem ser guardados.
  if (request.headers.has('range')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          storeInCache('/', response.clone());
          return response;
        })
        .catch(() => caches.match('/').then(cached => cached || Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      storeInCache(request, response.clone());
      return response;
    }))
  );
});
