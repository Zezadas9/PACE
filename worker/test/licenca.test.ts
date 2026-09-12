import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleCheckout, handleLicenca, handleWebhook, licenceOf, paymentsConfigured,
  requireLicence, validSignature, TRIAL_DAYS,
} from '../src/licenca';
import type { KvStore } from '../src/kv';
import { readLicence } from '../src/token';

function memoryStore(): KvStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
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

const DEVICE = 'aparelho-de-teste-1234';
const SECRET = 'segredo-de-assinatura-de-teste';
const DIA_1 = new Date('2026-09-12T10:00:00Z');
const DIA_9 = new Date('2026-09-20T10:00:00Z');

let store: ReturnType<typeof memoryStore>;
let env: Parameters<typeof handleLicenca>[2];

beforeEach(() => {
  store = memoryStore();
  env = {
    LICENCAS: store,
    LICENCE_SECRET: SECRET,
    ACCESS_CODE: 'CR7desconto100',
    LS_API_KEY: 'chave-de-api',
    LS_STORE_ID: '42',
    LS_VARIANT_ID: '77',
    LS_WEBHOOK_SECRET: 'segredo-do-webhook',
    APP_URL: 'https://exemplo.github.io/PACE',
  };
});

async function call(
  path: string,
  body: unknown,
  now = DIA_1,
  fetcher?: typeof fetch,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const request = new Request(`https://worker.example${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  const response = await handleLicenca(
    request, new URL(request.url), env, {}, now, fetcher ?? (async () => new Response('{}')),
  );
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe('sem pagamentos configurados', () => {
  it('nao cobra nada a ninguem', async () => {
    env = {};
    expect(paymentsConfigured(env)).toBe(false);
    const { body } = await call('/api/licenca', { device: DEVICE });
    expect(body.state).toBe('unmanaged');
  });

  it('e as portas do que custa dinheiro ficam abertas', async () => {
    const request = new Request('https://worker.example/api/coach', { method: 'POST' });
    expect(await requireLicence(request, {}, {})).toBeNull();
  });
});

describe('a semana de experiencia', () => {
  it('comeca no primeiro pedido e da um cartao', async () => {
    const { body } = await call('/api/licenca', { device: DEVICE });
    expect(body.state).toBe('trial');
    expect(body.endsAt).toBe('2026-09-19T00:00:00.000Z');

    const licence = await readLicence(String(body.card), SECRET, DIA_1);
    expect(licence).toMatchObject({ device: DEVICE, kind: 'trial' });
  });

  it('conta no servidor, e nao volta atras quando se pergunta outra vez', async () => {
    await call('/api/licenca', { device: DEVICE });
    const { body } = await call('/api/licenca', { device: DEVICE }, new Date('2026-09-15T10:00:00Z'));
    expect(body.endsAt).toBe('2026-09-19T00:00:00.000Z');
    expect(TRIAL_DAYS).toBe(7);
  });

  it('acabada a semana, fica bloqueado e sem cartao', async () => {
    await call('/api/licenca', { device: DEVICE });
    const { body } = await call('/api/licenca', { device: DEVICE }, DIA_9);
    expect(body.state).toBe('blocked');
    expect(body.card).toBeUndefined();
  });

  it('recusa um aparelho com forma estranha', async () => {
    const { status } = await call('/api/licenca', { device: 'curto' });
    expect(status).toBe(400);
  });
});

describe('codigo de acesso', () => {
  it('da acesso permanente, e nao passa pelo Lemon Squeezy', async () => {
    const fetcher = vi.fn(async () => new Response('{}'));
    const { body } = await call(
      '/api/licenca/codigo', { device: DEVICE, code: 'CR7desconto100' }, DIA_9, fetcher as unknown as typeof fetch,
    );
    expect(body.state).toBe('lifetime');
    expect(fetcher).not.toHaveBeenCalled();

    // E continua a valer depois de a experiencia ter acabado.
    const depois = await call('/api/licenca', { device: DEVICE }, DIA_9);
    expect(depois.body.state).toBe('lifetime');
  });

  it('um codigo errado nao passa', async () => {
    const { status } = await call('/api/licenca/codigo', { device: DEVICE, code: 'CR7desconto101' });
    expect(status).toBe(400);
  });
});

describe('chave de licenca', () => {
  const resposta = (over: Record<string, unknown> = {}) => async () => new Response(JSON.stringify({
    activated: true,
    error: null,
    license_key: { status: 'active' },
    instance: { id: 'instancia-1' },
    meta: { store_id: 42, variant_id: 77, customer_email: 'Jose@Exemplo.pt' },
    ...over,
  }));

  it('devolve o acesso noutro telemovel', async () => {
    const { body } = await call(
      '/api/licenca/codigo',
      { device: DEVICE, code: 'chave-1234', email: 'jose@exemplo.pt' },
      DIA_9,
      resposta() as unknown as typeof fetch,
    );
    expect(body.state).toBe('paid');
    expect(JSON.parse(store.data.get(`dispositivo:${DEVICE}`) ?? '{}')).toMatchObject({
      key: 'chave-1234', instance: 'instancia-1', status: 'active',
    });
  });

  it('recusa uma chave de outra loja ou de outro produto', async () => {
    const outraLoja = await call(
      '/api/licenca/codigo',
      { device: DEVICE, code: 'chave-1234', email: 'jose@exemplo.pt' },
      DIA_9,
      resposta({ meta: { store_id: 99, variant_id: 77, customer_email: 'jose@exemplo.pt' } }) as unknown as typeof fetch,
    );
    expect(outraLoja.status).toBe(400);
  });

  it('recusa quando o email nao e o de quem comprou', async () => {
    const { status, body } = await call(
      '/api/licenca/codigo',
      { device: DEVICE, code: 'chave-1234', email: 'outra@pessoa.pt' },
      DIA_9,
      resposta() as unknown as typeof fetch,
    );
    expect(status).toBe(400);
    expect(body.error).toBe('email_mismatch');
  });
});

describe('checkout', () => {
  it('leva o aparelho e o codigo de desconto, e devolve o endereco', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      void init;
      return new Response(JSON.stringify({
        data: { attributes: { url: 'https://loja.lemonsqueezy.com/checkout/abc' } },
      }));
    });
    const request = new Request('https://worker.example/api/pagamento/checkout', {
      method: 'POST',
      body: JSON.stringify({ device: DEVICE, code: 'ZEZADAS9' }),
    });
    const response = await handleCheckout(request, env, {}, fetcher as unknown as typeof fetch);
    expect(await response.json()).toEqual({ url: 'https://loja.lemonsqueezy.com/checkout/abc' });

    const enviado = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(enviado.data.attributes.checkout_data).toEqual({
      custom: { device: DEVICE },
      discount_code: 'ZEZADAS9',
    });
    expect(enviado.data.relationships.variant.data.id).toBe('77');
  });
});

describe('webhook', () => {
  async function assinar(raw: string): Promise<string> {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode('segredo-do-webhook'),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
    return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  const evento = (status: string, over: Record<string, unknown> = {}) => JSON.stringify({
    meta: { event_name: 'subscription_created', custom_data: { device: DEVICE } },
    data: { id: '9', attributes: { status, renews_at: '2026-10-12T10:00:00Z', ends_at: null, ...over } },
  });

  it('desbloqueia o telemovel que pagou, sem ninguem escrever nada', async () => {
    const raw = evento('active');
    const request = new Request('https://worker.example/api/pagamento/webhook', {
      method: 'POST', body: raw, headers: { 'x-signature': await assinar(raw) },
    });
    expect((await handleWebhook(request, env, {})).status).toBe(200);

    const { body } = await call('/api/licenca', { device: DEVICE }, DIA_9);
    expect(body.state).toBe('paid');
    expect(body.renewsAt).toBe('2026-10-12T10:00:00Z');
  });

  it('recusa uma assinatura que nao bate certo', async () => {
    const raw = evento('active');
    const request = new Request('https://worker.example/api/pagamento/webhook', {
      method: 'POST', body: raw, headers: { 'x-signature': 'a'.repeat(64) },
    });
    expect((await handleWebhook(request, env, {})).status).toBe(401);
    expect(await validSignature(raw, 'nao-e-hexadecimal', 'segredo-do-webhook')).toBe(false);
  });

  it('uma subscricao que acabou volta a bloquear', async () => {
    const raw = evento('expired');
    const request = new Request('https://worker.example/api/pagamento/webhook', {
      method: 'POST', body: raw, headers: { 'x-signature': await assinar(raw) },
    });
    await handleWebhook(request, env, {});
    const { body } = await call('/api/licenca', { device: DEVICE }, DIA_9);
    expect(body.state).toBe('blocked');
  });

  it('cancelada, vale ate ao fim do que ja foi pago', async () => {
    const raw = evento('cancelled', { ends_at: '2026-09-25T10:00:00Z' });
    const request = new Request('https://worker.example/api/pagamento/webhook', {
      method: 'POST', body: raw, headers: { 'x-signature': await assinar(raw) },
    });
    await handleWebhook(request, env, {});
    expect((await call('/api/licenca', { device: DEVICE }, DIA_9)).body.state).toBe('paid');
    expect((await call('/api/licenca', { device: DEVICE }, new Date('2026-09-26T10:00:00Z'))).body.state)
      .toBe('blocked');
  });
});

describe('a porta dos endpoints pagos', () => {
  it('sem cartao, 402', async () => {
    const request = new Request('https://worker.example/api/coach', { method: 'POST' });
    const response = await requireLicence(request, env, {});
    expect(response?.status).toBe(402);
  });

  it('com cartao, passa', async () => {
    const { body } = await call('/api/licenca', { device: DEVICE });
    const request = new Request('https://worker.example/api/coach', {
      method: 'POST', headers: { authorization: `Bearer ${body.card}` },
    });
    expect(await requireLicence(request, env, {})).toBeNull();
    expect(await licenceOf(request, env)).toMatchObject({ device: DEVICE, kind: 'trial' });
  });
});
