import { describe, expect, it, vi } from 'vitest';
import {
  handlePush, isDue, isPushEndpoint, localClock, runDailyPush, vapidAuthorization,
  type PushEnv, type PushRecord, type PushStore,
} from '../src/push';

function memoryStore(initial: Record<string, PushRecord> = {}): PushStore & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  return {
    data,
    async get(key) { return data.get(key) ?? null; },
    async put(key, value) { data.set(key, value); },
    async delete(key) { data.delete(key); },
    async list({ prefix }) {
      return {
        keys: [...data.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })),
        list_complete: true,
      };
    },
  };
}

function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function vapidKeys(): Promise<{ pair: CryptoKeyPair; publicKey: string; privateKey: string }> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
  ) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey) as ArrayBuffer);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey) as JsonWebKey;
  return { pair, publicKey: base64url(raw), privateKey: jwk.d ?? '' };
}

const record = (over: Partial<PushRecord> = {}): PushRecord => ({
  endpoint: 'https://web.push.apple.com/QGVyb',
  time: '20:00',
  timezone: 'Europe/Lisbon',
  closedOn: null,
  sentOn: null,
  ...over,
});

// Em setembro, Lisboa esta em UTC+1: 19:05Z sao 20:05 la.
const AS_20H05 = new Date('2026-09-10T19:05:00Z');

describe('relogio local', () => {
  it('le a hora no fuso de quem subscreveu', () => {
    expect(localClock(AS_20H05, 'Europe/Lisbon')).toEqual({ date: '2026-09-10', minutes: 20 * 60 + 5 });
  });

  it('muda de dia quando o fuso ja passou a meia-noite', () => {
    expect(localClock(AS_20H05, 'Asia/Tokyo')).toEqual({ date: '2026-09-11', minutes: 4 * 60 + 5 });
  });
});

describe('quando o aviso sai', () => {
  it('sai depois da hora escolhida', () => {
    expect(isDue(record(), AS_20H05)).toBe(true);
    expect(isDue(record(), new Date('2026-09-10T18:55:00Z'))).toBe(false);
  });

  it('nao sai tarde demais — um lembrete das oito nao chega a meia-noite', () => {
    expect(isDue(record(), new Date('2026-09-10T22:30:00Z'))).toBe(false);
  });

  it('sai uma vez por dia, e nunca se o dia ja fechou', () => {
    expect(isDue(record({ sentOn: '2026-09-10' }), AS_20H05)).toBe(false);
    expect(isDue(record({ closedOn: '2026-09-10' }), AS_20H05)).toBe(false);
    // Fechar ontem nao conta para hoje.
    expect(isDue(record({ closedOn: '2026-09-09', sentOn: '2026-09-09' }), AS_20H05)).toBe(true);
  });
});

describe('enderecos de push', () => {
  it('aceita os servicos conhecidos', () => {
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
  });

  it('recusa o resto — o Worker nao assina pedidos para onde lhe mandarem', () => {
    expect(isPushEndpoint('https://example.com/abc')).toBe(false);
    expect(isPushEndpoint('http://fcm.googleapis.com/abc')).toBe(false);
    expect(isPushEndpoint('https://fcm.googleapis.com.evil.example/abc')).toBe(false);
    expect(isPushEndpoint('nao e um url')).toBe(false);
  });
});

describe('VAPID', () => {
  it('assina um JWT que a chave publica confirma', async () => {
    const keys = await vapidKeys();
    const header = await vapidAuthorization('https://web.push.apple.com/abc', {
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
      VAPID_SUBJECT: 'https://example.com/',
    }, AS_20H05);

    const match = /^vapid t=([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [token = '', publicKey] = [match?.[1], match?.[2]];
    expect(publicKey).toBe(keys.publicKey);

    const [head = '', claims = '', signature = ''] = token.split('.');
    const payload = JSON.parse(new TextDecoder().decode(fromBase64url(claims))) as Record<string, unknown>;
    expect(payload.aud).toBe('https://web.push.apple.com');
    expect(payload.sub).toBe('https://example.com/');

    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      keys.pair.publicKey,
      fromBase64url(signature),
      new TextEncoder().encode(`${head}.${claims}`),
    );
    expect(valid).toBe(true);
  });
});

describe('a volta do cron', () => {
  it('envia a quem esta na hora, salta quem fechou o dia, e esquece quem foi embora', async () => {
    const keys = await vapidKeys();
    const store = memoryStore({
      'sub:em-hora': record({ endpoint: 'https://web.push.apple.com/em-hora' }),
      'sub:fechou': record({ endpoint: 'https://web.push.apple.com/fechou', closedOn: '2026-09-10' }),
      'sub:foi-embora': record({ endpoint: 'https://web.push.apple.com/foi-embora' }),
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => new Response(null, {
      status: String(input).endsWith('foi-embora') ? 410 : 201,
    }));
    const env: PushEnv = { PUSH: store, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey };

    const first = await runDailyPush(env, AS_20H05, fetcher as unknown as typeof fetch);
    expect(first).toEqual({ checked: 3, sent: 1, removed: 1 });
    expect(store.data.has('sub:foi-embora')).toBe(false);
    expect(JSON.parse(store.data.get('sub:em-hora') ?? '{}').sentOn).toBe('2026-09-10');

    // Quinze minutos depois: ja saiu hoje, nao sai outra vez.
    const second = await runDailyPush(env, new Date('2026-09-10T19:20:00Z'), fetcher as unknown as typeof fetch);
    expect(second.sent).toBe(0);
  });

  it('sem chaves nem KV nao faz nada', async () => {
    expect(await runDailyPush({}, AS_20H05)).toEqual({ checked: 0, sent: 0, removed: 0 });
  });
});

describe('pedidos da aplicacao', () => {
  const ID = 'aparelho-de-teste-123';

  async function call(env: PushEnv, path: string, body?: unknown): Promise<Response> {
    const request = new Request(`https://worker.example${path}`, body === undefined
      ? { method: 'GET' }
      : { method: 'POST', body: JSON.stringify(body) });
    return handlePush(request, new URL(request.url), env, {});
  }

  it('diz que nao esta configurado em vez de falhar as escondidas', async () => {
    expect((await call({}, '/api/push/key')).status).toBe(503);
  });

  it('subscreve, e o dia fecha e volta a abrir', async () => {
    const keys = await vapidKeys();
    const store = memoryStore();
    const env: PushEnv = { PUSH: store, VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey };

    const key = await call(env, '/api/push/key');
    expect(await key.json()).toEqual({ publicKey: keys.publicKey });

    const subscribed = await call(env, '/api/push/subscribe', {
      id: ID, endpoint: 'https://web.push.apple.com/x', time: '20:30', timezone: 'Europe/Lisbon',
    });
    expect(subscribed.status).toBe(200);

    await call(env, '/api/push/day', { id: ID, date: '2026-09-10', closed: true });
    expect(JSON.parse(store.data.get(`sub:${ID}`) ?? '{}').closedOn).toBe('2026-09-10');

    // Desmarcou-se um essencial: o dia volta a estar por fechar.
    await call(env, '/api/push/day', { id: ID, date: '2026-09-10', closed: false });
    expect(JSON.parse(store.data.get(`sub:${ID}`) ?? '{}').closedOn).toBeNull();

    await call(env, '/api/push/unsubscribe', { id: ID });
    expect(store.data.size).toBe(0);
  });

  it('recusa um endereco que nao e de um servico de push', async () => {
    const keys = await vapidKeys();
    const env: PushEnv = { PUSH: memoryStore(), VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey };
    const response = await call(env, '/api/push/subscribe', {
      id: ID, endpoint: 'https://example.com/roubo', time: '20:00', timezone: 'Europe/Lisbon',
    });
    expect(response.status).toBe(400);
  });
});
