/**
 * PACE — Service worker.
 *
 * Exists for one reason: without it, an app added to the iPhone home screen is
 * a bookmark. It opens, finds no server, and shows nothing. With it, the shell
 * is cached and the app opens offline like a real app.
 *
 * Strategy, deliberately small:
 *   - navigations go to the network first and fall back to the cached shell, so
 *     a new deploy is picked up the moment the phone is online;
 *   - everything else is cache-first, because Vite fingerprints its filenames —
 *     a given URL's contents can never change, so a cached copy is never stale.
 *
 * Bump CACHE_VERSION when the precached list below changes.
 */

const CACHE_VERSION = 'v4';
const CACHE = `pace-${CACHE_VERSION}`;

/** Relative on purpose: the app is served from a repository subpath on Pages. */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  // A barra de navegacao e os ecras sao feitos destes icones: sem eles,
  // offline, a aplicacao aparece vazia.
  './icons/agenda.png',
  './icons/alimentacao.png',
  './icons/bicicleta.png',
  './icons/cadeado.png',
  './icons/caixote.png',
  './icons/caminhada-rapida.png',
  './icons/caminhada.png',
  './icons/consistencia.png',
  './icons/corrida.png',
  './icons/dias-perfeitos.png',
  './icons/estatisticas.png',
  './icons/frequencia.png',
  './icons/hidratacao.png',
  './icons/ia.png',
  './icons/imc-alto.png',
  './icons/imc-baixo.png',
  './icons/imc-normal.png',
  './icons/lembretes.png',
  './icons/melhor-sequencia.png',
  './icons/objetivos.png',
  './icons/perfil.png',
  './icons/planos.png',
  './icons/progresso.png',
  './icons/refeicoes.png',
  './icons/relaxamento.png',
  './icons/relogio.png',
  './icons/saude.png',
  './icons/sequencia.png',
  './icons/som.png',
  './icons/sono.png',
  './icons/streak-1.png',
  './icons/streak-100.png',
  './icons/streak-14.png',
  './icons/streak-3.png',
  './icons/streak-30.png',
  './icons/streak-365.png',
  './icons/streak-60.png',
  './icons/streak-7.png',
  './icons/treinos.png',
  './icons/vibracao.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // One missing file must not fail the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit ?? Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        // Opaque and error responses are not worth keeping.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});

/**
 * Notification taps.
 *
 * Focus an open window if there is one, otherwise open the app, and tell it
 * which route the notification pointed at.
 */
self.addEventListener('notificationclick', (event) => {
  const route = event.notification?.data?.route ?? null;
  event.notification.close();

  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    for (const client of clients) {
      client.postMessage({ type: 'notification-tap', route });
      if ('focus' in client) return client.focus();
    }

    if (self.clients.openWindow) {
      return self.clients.openWindow(route ? `./#${route}` : './');
    }
    return undefined;
  })());
});
