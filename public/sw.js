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
 *   - ficheiros com impressao digital no nome (o que o Vite gera em /assets/)
 *     sao cache-first: aquele URL nunca muda de conteudo, e uma copia em cache
 *     nunca fica velha;
 *   - os restantes — os icones, o manifesto — sao servidos da cache e
 *     atualizados em segundo plano. O nome deles nao muda quando a arte muda, e
 *     sem isto um icone corrigido so chegava ao telemovel quando alguem se
 *     lembrasse de subir a versao da cache. Foi assim que icones ja corrigidos
 *     continuaram semanas por corrigir no telemovel.
 *
 * Bump CACHE_VERSION when the precached list below changes.
 */

const CACHE_VERSION = 'v6';
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
  './icons/hiking.png',
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

  // O Vite poe tudo o que tem impressao digital no nome em /assets/. Fora dai,
  // o nome nao muda quando o conteudo muda — e por isso e que estes precisam de
  // ser revalidados. Uma regra por pasta le-se; uma regra por forma do nome
  // apanhava "melhor-sequencia.png" como se fosse um hash.
  const fingerprinted = url.pathname.includes('/assets/');

  event.respondWith(
    caches.match(request).then((hit) => {
      const fresh = fetch(request).then((response) => {
        // Respostas opacas ou com erro nao valem a pena guardar.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });

      if (!hit) return fresh;
      if (fingerprinted) return hit;

      // Serve o que esta em cache e vai buscar o novo para a proxima vez: rapido
      // agora, atualizado a seguir. Se nao houver rede, o `catch` deixa a copia
      // em cache continuar a ser a resposta.
      void fresh.catch(() => undefined);
      return hit;
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
