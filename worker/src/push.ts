/**
 * PACE — o lembrete diário da sequência, com a aplicação fechada.
 *
 * Na web não há maneira de agendar uma notificação para as 20h e fechar a
 * aplicação: os temporizadores morrem com a página, e o service worker é morto
 * segundos depois de ficar parado. O que acorda uma aplicação fechada é um
 * push, e um push tem de vir de um servidor. É isto.
 *
 * O que o servidor sabe, e só isto: um endereço de push (opaco, dado pelo
 * browser), a hora escolhida, o fuso horário, e se o dia de hoje já fechou — um
 * sim ou não, por data. Não sabe quantos dias tem a sequência, que hábitos há,
 * nem nada do que está na aplicação.
 *
 * O push vai vazio de propósito. Um push com conteúdo tem de ser cifrado com as
 * chaves do browser (RFC 8291); um vazio só precisa de ser assinado (RFC 8292).
 * O texto da notificação escreve-o o service worker, no telemóvel, com o que
 * sabe lá — e assim nem o texto passa por aqui.
 */

import { z } from 'zod';
import { fail, json } from './http';
import type { KvStore } from './kv';

/** O armazenamento das subscricoes. A forma vive em `kv.ts`, com as licencas. */
export type PushStore = KvStore;

export interface PushEnv {
  PUSH?: PushStore;
  /** Pública: vai para o browser. Base64url do ponto P-256 não comprimido. */
  VAPID_PUBLIC_KEY?: string;
  /** Secret. Base64url do escalar privado P-256. Nunca sai daqui. */
  VAPID_PRIVATE_KEY?: string;
  /** Quem os serviços de push contactam se algo correr mal. https: ou mailto:. */
  VAPID_SUBJECT?: string;
  ALLOWED_ORIGINS?: string;
}

export interface PushRecord {
  endpoint: string;
  /** HH:MM, na hora local de quem subscreveu. */
  time: string;
  /** Fuso IANA — "Europe/Lisbon". É ele que diz quando são as 20h lá. */
  timezone: string;
  /** O último dia, na data local, em que a aplicação disse que o dia fechou. */
  closedOn: string | null;
  /** O último dia em que o aviso já saiu. Um por dia, nunca dois. */
  sentOn: string | null;
}

const PREFIX = 'sub:';
const MAX_BODY = 4096;

/**
 * Até quanto tempo depois da hora escolhida ainda vale a pena avisar.
 *
 * O cron corre de quinze em quinze minutos, mas o Cloudflare não promete a
 * hora exata. Uma janela de três horas apanha um atraso sem nunca avisar à
 * meia-noite por um lembrete das oito.
 */
const LATE_WINDOW_MIN = 180;

/**
 * Os serviços de push conhecidos.
 *
 * O endereço vem do browser, mas chega aqui por um pedido que qualquer pessoa
 * pode fazer. Sem esta lista, o Worker fazia pedidos assinados para onde lhe
 * mandassem.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
];

export function isPushEndpoint(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname));
}

function validTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

export const subscribeSchema = z.object({
  id: idSchema,
  endpoint: z.string().max(1000).refine(isPushEndpoint),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().max(64).refine(validTimeZone),
});

export const daySchema = z.object({
  id: idSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  closed: z.boolean(),
});

export const unsubscribeSchema = z.object({ id: idSchema });

/* --- Relógio ------------------------------------------------------------------- */

/** A data e os minutos do dia, no fuso de quem subscreveu. */
export function localClock(now: Date, timeZone: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/**
 * Se este aviso tem de sair agora.
 *
 * Três condições, e todas contam: já passou a hora (há pouco), ainda não saiu
 * hoje, e o dia não fechou. A última é a que o torna um lembrete e não um
 * incómodo — quem já fez o que tinha a fazer não recebe nada.
 */
export function isDue(record: PushRecord, now: Date): boolean {
  const local = localClock(now, record.timezone);
  const [hours = 0, minutes = 0] = record.time.split(':').map(Number);
  const target = hours * 60 + minutes;
  if (local.minutes < target || local.minutes > target + LATE_WINDOW_MIN) return false;
  return record.sentOn !== local.date && record.closedOn !== local.date;
}

/* --- VAPID (RFC 8292) ------------------------------------------------------------ */

function encode64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode64url(text: string): Uint8Array {
  const base64 = text.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function subjectOf(env: PushEnv): string {
  const configured = env.VAPID_SUBJECT?.trim();
  if (configured) return configured;
  // Sem assunto configurado, o endereço público da aplicação serve: é a quem
  // pertence o push, e é um https:, que é o que os serviços aceitam.
  const origin = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('https://'));
  return origin ?? 'mailto:pace@example.com';
}

/**
 * O cabeçalho `Authorization` de um push: um JWT ES256 com a chave privada.
 *
 * O WebCrypto devolve a assinatura ECDSA já no formato que o JWT quer — r e s
 * concatenados, 64 bytes — por isso não há conversão de DER a fazer.
 */
export async function vapidAuthorization(endpoint: string, env: PushEnv, now: Date): Promise<string> {
  const publicKey = decode64url(env.VAPID_PUBLIC_KEY ?? '');
  if (publicKey.length !== 65 || publicKey[0] !== 4) throw new Error('vapid_public_key');

  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: encode64url(publicKey.slice(1, 33)),
      y: encode64url(publicKey.slice(33, 65)),
      d: (env.VAPID_PRIVATE_KEY ?? '').trim(),
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const text = new TextEncoder();
  const header = encode64url(text.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = encode64url(text.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    // Doze horas: o máximo que os serviços aceitam é vinte e quatro.
    exp: Math.floor(now.getTime() / 1000) + 12 * 3600,
    sub: subjectOf(env),
  })));
  const signature = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    text.encode(`${header}.${claims}`),
  ));

  return `vapid t=${header}.${claims}.${encode64url(signature)}, k=${env.VAPID_PUBLIC_KEY?.trim()}`;
}

/** Envia um push vazio. Devolve o estado HTTP do serviço de push. */
export async function sendPush(
  endpoint: string,
  env: PushEnv,
  now: Date,
  fetcher: typeof fetch = fetch,
): Promise<number> {
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(endpoint, env, now),
      // Se o telemóvel estiver desligado, o aviso espera até doze horas. Mais
      // do que isso já não é o aviso de hoje.
      TTL: String(12 * 3600),
      Urgency: 'normal',
      'Content-Length': '0',
    },
  });
  return response.status;
}

export function pushConfigured(env: PushEnv): boolean {
  return Boolean(env.PUSH && env.VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim());
}

async function readRecord(store: PushStore, key: string): Promise<PushRecord | null> {
  const raw = await store.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PushRecord;
  } catch {
    return null;
  }
}

/* --- A volta do cron --------------------------------------------------------------- */

/**
 * Percorre as subscrições e envia os avisos que estão na hora.
 *
 * Um serviço de push que responde 404 ou 410 está a dizer que aquela
 * subscrição acabou — a aplicação foi apagada, ou as notificações desligadas
 * no sistema. Essa sai da lista, para não se insistir.
 */
export async function runDailyPush(
  env: PushEnv,
  now: Date = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<{ checked: number; sent: number; removed: number }> {
  const result = { checked: 0, sent: 0, removed: 0 };
  if (!pushConfigured(env)) return result;
  const store = env.PUSH as PushStore;

  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: PREFIX, cursor });
    for (const { name } of page.keys) {
      const record = await readRecord(store, name);
      if (!record) continue;
      result.checked += 1;
      if (!isDue(record, now)) continue;

      let status: number;
      try {
        status = await sendPush(record.endpoint, env, now, fetcher);
      } catch {
        // Rede ou chave mal configurada. Tenta-se na volta seguinte.
        continue;
      }

      if (status === 404 || status === 410) {
        await store.delete(name);
        result.removed += 1;
      } else if (status >= 200 && status < 300) {
        await store.put(name, JSON.stringify({
          ...record,
          sentOn: localClock(now, record.timezone).date,
        }));
        result.sent += 1;
      } else {
        // Só o código. O endereço identifica um telemóvel, e não vai para logs.
        console.warn('push', status);
      }
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  return result;
}

/* --- Os pedidos da aplicação ------------------------------------------------------- */

export async function handlePush(
  request: Request,
  url: URL,
  env: PushEnv,
  cors: Record<string, string>,
): Promise<Response> {
  if (!pushConfigured(env)) return fail('push_not_configured', 503, cors);

  if (url.pathname === '/api/push/key') {
    if (request.method !== 'GET') return fail('method_not_allowed', 405, cors);
    return json({ publicKey: env.VAPID_PUBLIC_KEY?.trim() }, 200, cors);
  }

  if (request.method !== 'POST') return fail('method_not_allowed', 405, cors);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail('payload_too_large', 413, cors);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail('invalid_json', 400, cors);
  }

  const store = env.PUSH as PushStore;

  if (url.pathname === '/api/push/subscribe') {
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) return fail('invalid_request', 400, cors);
    const key = PREFIX + parsed.data.id;
    const previous = await readRecord(store, key);
    const record: PushRecord = {
      endpoint: parsed.data.endpoint,
      time: parsed.data.time,
      timezone: parsed.data.timezone,
      closedOn: previous?.closedOn ?? null,
      // Mudar a hora não faz o aviso de hoje sair duas vezes.
      sentOn: previous?.endpoint === parsed.data.endpoint ? previous.sentOn : null,
    };
    await store.put(key, JSON.stringify(record));
    return json({ ok: true }, 200, cors);
  }

  if (url.pathname === '/api/push/day') {
    const parsed = daySchema.safeParse(body);
    if (!parsed.success) return fail('invalid_request', 400, cors);
    const key = PREFIX + parsed.data.id;
    const previous = await readRecord(store, key);
    if (!previous) return fail('not_subscribed', 404, cors);

    // Um dia que volta a abrir — desmarcou-se um essencial — deixa de estar
    // fechado. Os outros dias não mexem.
    const closedOn = parsed.data.closed
      ? parsed.data.date
      : previous.closedOn === parsed.data.date ? null : previous.closedOn;
    // Uma escrita no KV só quando muda alguma coisa: o plano gratuito conta-as.
    if (closedOn !== previous.closedOn) {
      await store.put(key, JSON.stringify({ ...previous, closedOn }));
    }
    return json({ ok: true }, 200, cors);
  }

  if (url.pathname === '/api/push/unsubscribe') {
    const parsed = unsubscribeSchema.safeParse(body);
    if (!parsed.success) return fail('invalid_request', 400, cors);
    await store.delete(PREFIX + parsed.data.id);
    return json({ ok: true }, 200, cors);
  }

  return fail('not_found', 404, cors);
}
