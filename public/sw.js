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

const CACHE_VERSION = 'v7';
const CACHE = `pace-${CACHE_VERSION}`;

/**
 * Uma cache a parte, que nao muda com a versao, para o pouco que o lembrete
 * da sequencia precisa de saber: quantos dias tem a sequencia. A aplicacao
 * escreve-o; o push le-o. Sem ele, o texto do aviso seria sempre o generico.
 */
const STATE_CACHE = 'pace-estado';
const STREAK_KEY = './_sequencia';

/**
 * A versao da arte dos icones. GERADO por tools/stamp-icons.cjs.
 *
 * Os nomes dos ficheiros sao fixos; o conteudo nao. Sem isto, um icone
 * corrigido ficava escondido atras da copia em cache — que foi exatamente o
 * que aconteceu, mais do que uma vez. Com o resumo dos bytes no URL, arte nova
 * e um URL novo, e um URL novo nunca esta em cache.
 */
const ICONS_VERSION = '7aec8f4d';

const ICON_NAMES = [
  'agenda',
  'alimentacao',
  'bicicleta',
  'cadeado',
  'caixote',
  'caminhada-rapida',
  'caminhada',
  'consistencia',
  'consistencia-escuro',
  'corrida',
  'dias-perfeitos',
  'dias-perfeitos-escuro',
  'estatisticas',
  'frequencia',
  'hidratacao',
  'hiking',
  'ia',
  'imc-alto',
  'imc-baixo',
  'imc-normal',
  'lembretes',
  'melhor-sequencia',
  'objetivos',
  'perfil',
  'planos',
  'progresso',
  'refeicoes',
  'relaxamento',
  'relogio',
  'saude',
  'sequencia',
  'sequencia-escuro',
  'som',
  'sono',
  'streak-1',
  'streak-100',
  'streak-14',
  'streak-3',
  'streak-30',
  'streak-365',
  'streak-60',
  'streak-7',
  'treinos',
  'vibracao',
];

/** Relative on purpose: the app is served from a repository subpath on Pages. */
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  // A barra de navegacao e os ecras sao feitos destes icones: sem eles,
  // offline, a aplicacao aparece vazia.
  ...ICON_NAMES.map((name) => `./icons/${name}.png?v=${ICONS_VERSION}`),
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
      .then((keys) => Promise.all(keys
        .filter((key) => key !== CACHE && key !== STATE_CACHE)
        .map((key) => caches.delete(key))))
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
 * O lembrete da sequencia.
 *
 * O push chega vazio — o servidor nao sabe nada da sequencia, de proposito — e
 * o texto escreve-se aqui, com o numero que a aplicacao deixou na cache. So
 * chega quando o dia ainda nao fechou: e o servidor que decide isso.
 *
 * `tag` fixa: se por algum motivo chegarem dois, o segundo substitui o
 * primeiro em vez de se empilhar.
 */
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let days = 0;
    try {
      const cache = await caches.open(STATE_CACHE);
      const hit = await cache.match(STREAK_KEY);
      if (hit) days = Number((await hit.json()).days) || 0;
    } catch {
      /* Sem o numero, fica o texto generico. */
    }

    const body = days > 0
      ? `Faltam os essenciais de hoje para manteres os teus ${days} ${days === 1 ? 'dia' : 'dias'}.`
      : 'Fecha os essenciais de hoje e começa uma sequência.';

    await self.registration.showNotification('Não percas a tua sequência 🔥', {
      body,
      tag: 'pace-sequencia',
      icon: './apple-touch-icon.png',
      badge: './apple-touch-icon.png',
      data: { route: '/hoje' },
    });
  })());
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
