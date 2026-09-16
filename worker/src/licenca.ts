/**
 * PACE — quem pode usar a aplicação, e até quando.
 *
 * Uma semana de experiência, depois 5 € por mês. O dinheiro passa pelo Lemon
 * Squeezy, que vende em nome da loja e trata do IVA europeu e das facturas —
 * nada de números de cartão passa por aqui, nem pela aplicação.
 *
 * O que este ficheiro faz:
 *
 * 1. **Começa a experiência.** Na primeira vez que um aparelho aparece, fica
 *    registada a data. Sete dias, contados aqui e não no telemóvel, porque uma
 *    data guardada no telemóvel muda-se num instante.
 * 2. **Emite o cartão de licença.** Um texto curto e assinado (ver `token.ts`)
 *    que a aplicação guarda e mostra de cada vez que fala com o servidor.
 * 3. **Abre o checkout** no Lemon Squeezy, com o aparelho colado ao pagamento.
 * 4. **Ouve o Lemon Squeezy.** Os webhooks dizem quando uma subscrição começa,
 *    renova, falha ou acaba.
 * 5. **Aceita códigos.** Uma chave de licença — a que o Lemon Squeezy envia por
 *    email no recibo — para recuperar o acesso noutro telemóvel; ou um código
 *    de acesso, que vive nos secrets do Worker e dá acesso permanente.
 *
 * Nenhum código de desconto esta escrito nesta aplicacao. Os de desconto vivem
 * no painel do Lemon Squeezy e sao enviados tal e qual para la; o de acesso
 * vive num secret do Worker. Quem abrir o JavaScript da aplicacao nao encontra
 * nenhum deles.
 */

import { fail, json } from './http';
import { readJson, writeJson, type KvStore } from './kv';
import { expiryFor, readLicence, sameSecret, signLicence, type Licence } from './token';

export interface LicencaEnv {
  LICENCAS?: KvStore;
  /** Assina os cartões de licença. Um secret; sem ele não há pagamentos. */
  LICENCE_SECRET?: string;
  /** Dá acesso permanente a quem o souber. Um secret, nunca no bundle. */
  ACCESS_CODE?: string;
  LS_API_KEY?: string;
  LS_STORE_ID?: string;
  LS_VARIANT_ID?: string;
  LS_WEBHOOK_SECRET?: string;
  /** Para onde o checkout volta depois de pagar. */
  APP_URL?: string;
}

/** A semana de experiência, contada no servidor. */
export const TRIAL_DAYS = 7;

/** De quanto em quanto tempo se volta a perguntar ao Lemon Squeezy por uma chave. */
const RECHECK_HOURS = 12;

const MAX_BODY = 8192;
const API = 'https://api.lemonsqueezy.com/v1';

const deviceShape = /^[A-Za-z0-9_-]{16,64}$/;

interface DeviceRecord {
  /** Data (UTC) em que a experiência começou neste aparelho. */
  trialStart: string;
  /** Acesso permanente, dado por um código de acesso. */
  lifetime?: boolean;
  /** O que o Lemon Squeezy disse da subscrição, pelos webhooks. */
  status?: string;
  renewsAt?: string | null;
  endsAt?: string | null;
  subscription?: string;
  /** Onde o Lemon Squeezy deixa gerir esta subscrição. */
  portal?: string | null;
  /** A chave de licença usada para recuperar o acesso, e a instância dela. */
  key?: string;
  instance?: string;
  checkedAt?: string;
}

/** O estado que a aplicação recebe, e que decide o que ela mostra. */
export type LicenceState = 'trial' | 'paid' | 'lifetime' | 'blocked' | 'unmanaged';

const day = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * Estados do Lemon Squeezy que dão acesso.
 *
 * `cancelled` também dá: quem cancela fica com o que pagou até ao fim do
 * período, e é o `endsAt` que fecha a porta. `past_due` também, porque um
 * pagamento que falhou pode ser um cartão que expirou — tirar o acesso no
 * mesmo dia seria castigar um esquecimento.
 */
const OPEN_STATUS = ['on_trial', 'active', 'past_due', 'cancelled'];

/**
 * So se cobra quando ha mesmo onde pagar.
 *
 * Isto exige a loja inteira, e nao so a maquinaria das licencas. Sem esta
 * exigencia, ter a chave de assinatura e o armazenamento bastava para a
 * contagem comecar — e, sete dias depois, a aplicacao fechava-se a pessoas que
 * nao tinham como pagar, porque a loja ainda nao existia. Enquanto faltar uma
 * destas cinco coisas, a aplicacao e de graca para toda a gente.
 */
export function paymentsConfigured(env: LicencaEnv): boolean {
  return Boolean(
    env.LICENCAS
    && env.LICENCE_SECRET?.trim()
    && env.LS_API_KEY?.trim()
    && env.LS_STORE_ID?.trim()
    && env.LS_VARIANT_ID?.trim(),
  );
}

/* --- O cartão -------------------------------------------------------------------- */

interface Card {
  state: LicenceState;
  card?: string;
  /** Quando acaba a experiência, para o ecrã poder contar os dias. */
  endsAt?: string;
  renewsAt?: string | null;
  portalUrl?: string | null;
}

function subscriptionOpen(record: DeviceRecord, now: Date): boolean {
  if (!record.status || !OPEN_STATUS.includes(record.status)) return false;
  if (record.status !== 'cancelled') return true;
  // Cancelada: vale até ao fim do período já pago.
  return Boolean(record.endsAt && new Date(record.endsAt).getTime() > now.getTime());
}

async function issue(
  device: string,
  kind: Licence['kind'],
  env: LicencaEnv,
  now: Date,
  renews?: string | null,
  expires?: number,
): Promise<string> {
  return signLicence(
    { device, kind, exp: expires ?? expiryFor(kind, now), renews: renews ?? null },
    env.LICENCE_SECRET as string,
  );
}

/**
 * O cartão que este aparelho merece agora.
 *
 * Por ordem: acesso permanente, subscrição a pagar, chave de licença, e por
 * fim a experiência. O primeiro que der acesso ganha.
 */
async function cardFor(
  device: string,
  record: DeviceRecord,
  env: LicencaEnv,
  now: Date,
  fetcher: typeof fetch,
): Promise<{ card: Card; record: DeviceRecord }> {
  if (record.lifetime) {
    return { card: { state: 'lifetime', card: await issue(device, 'lifetime', env, now) }, record };
  }

  if (subscriptionOpen(record, now)) {
    return {
      card: {
        state: 'paid',
        card: await issue(device, 'paid', env, now, record.renewsAt ?? null),
        renewsAt: record.renewsAt ?? null,
        portalUrl: record.portal ?? null,
      },
      record,
    };
  }

  let updated = record;
  if (record.key) {
    updated = await refreshKey(record, now, fetcher);
    if (updated.status && ['active', 'inactive'].includes(updated.status)) {
      return {
        card: { state: 'paid', card: await issue(device, 'paid', env, now), renewsAt: null },
        record: updated,
      };
    }
  }

  const trialEnd = new Date(`${updated.trialStart}T00:00:00.000Z`);
  trialEnd.setUTCDate(trialEnd.getUTCDate() + TRIAL_DAYS);
  if (trialEnd.getTime() > now.getTime()) {
    return {
      card: {
        state: 'trial',
        card: await issue(device, 'trial', env, now, null, Math.floor(trialEnd.getTime() / 1000)),
        endsAt: trialEnd.toISOString(),
      },
      record: updated,
    };
  }

  return { card: { state: 'blocked', endsAt: trialEnd.toISOString() }, record: updated };
}

/** Volta a perguntar ao Lemon Squeezy pelo estado de uma chave, sem exagerar. */
async function refreshKey(
  record: DeviceRecord,
  now: Date,
  fetcher: typeof fetch,
): Promise<DeviceRecord> {
  const checked = record.checkedAt ? new Date(record.checkedAt).getTime() : 0;
  if (now.getTime() - checked < RECHECK_HOURS * 3600 * 1000) return record;

  const result = await licenseCall('validate', { license_key: record.key ?? '' }, fetcher);
  if (!result) return record;

  return {
    ...record,
    status: typeof result.license_key?.status === 'string' ? result.license_key.status : record.status,
    checkedAt: now.toISOString(),
  };
}

/* --- Lemon Squeezy --------------------------------------------------------------- */

interface LicenseResult {
  activated?: boolean;
  valid?: boolean;
  error?: string | null;
  license_key?: { status?: string; activation_limit?: number; activation_usage?: number };
  instance?: { id?: string } | null;
  meta?: { store_id?: number; variant_id?: number; customer_email?: string };
}

/**
 * A API das licenças não leva chave de API: a própria chave de licença é a
 * credencial. E é `x-www-form-urlencoded`, não JSON — é a única parte da API
 * do Lemon Squeezy que é assim.
 */
async function licenseCall(
  path: 'activate' | 'validate' | 'deactivate',
  fields: Record<string, string>,
  fetcher: typeof fetch,
): Promise<LicenseResult | null> {
  try {
    const response = await fetcher(`${API}/licenses/${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(fields).toString(),
    });
    if (!response.ok && response.status >= 500) return null;
    return await response.json() as LicenseResult;
  } catch {
    return null;
  }
}

/* --- Os pedidos ------------------------------------------------------------------ */

export async function handleLicenca(
  request: Request,
  url: URL,
  env: LicencaEnv,
  cors: Record<string, string>,
  now: Date = new Date(),
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  // Sem pagamentos configurados a aplicação não é cobrada a ninguém. É o que
  // mantém a aplicação a funcionar enquanto a loja não existir.
  if (!paymentsConfigured(env)) return json({ state: 'unmanaged' satisfies LicenceState }, 200, cors);
  if (request.method !== 'POST') return fail('method_not_allowed', 405, cors);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail('payload_too_large', 413, cors);
  let body: { device?: unknown; code?: unknown; email?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail('invalid_json', 400, cors);
  }

  const device = typeof body.device === 'string' ? body.device : '';
  if (!deviceShape.test(device)) return fail('invalid_request', 400, cors);

  const store = env.LICENCAS as KvStore;
  const key = `dispositivo:${device}`;
  let record = await readJson<DeviceRecord>(store, key);
  if (!record) {
    record = { trialStart: day(now) };
    await writeJson(store, key, record);
  }

  if (url.pathname === '/api/licenca/codigo') {
    const code = typeof body.code === 'string' ? body.code.trim() : '';
    if (!code) return fail('invalid_request', 400, cors);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    // O código de acesso primeiro: é o único que não passa pelo Lemon Squeezy.
    if (env.ACCESS_CODE?.trim() && sameSecret(code, env.ACCESS_CODE.trim())) {
      record = { ...record, lifetime: true };
      await writeJson(store, key, record);
      return json({ state: 'lifetime', card: await issue(device, 'lifetime', env, now) }, 200, cors);
    }

    const result = await licenseCall('activate', {
      license_key: code,
      instance_name: `PACE ${device.slice(0, 8)}`,
    }, fetcher);

    if (!result || result.activated !== true) return fail('invalid_code', 400, cors);

    /*
     * A chave tem de ser desta loja e deste produto.
     *
     * Sem esta verificacao, uma chave comprada noutra loja do Lemon Squeezy
     * — qualquer uma — abria a PACE. E a propria documentacao deles que avisa.
     */
    const sameStore = String(result.meta?.store_id ?? '') === String(env.LS_STORE_ID ?? '');
    const sameVariant = String(result.meta?.variant_id ?? '') === String(env.LS_VARIANT_ID ?? '');
    if (!sameStore || !sameVariant) return fail('invalid_code', 400, cors);

    // E o email tem de ser o de quem comprou: a chave sozinha podia andar a
    // passar de mao em mao.
    const buyer = (result.meta?.customer_email ?? '').toLowerCase();
    if (!email || email !== buyer) return fail('email_mismatch', 400, cors);

    record = {
      ...record,
      key: code,
      instance: result.instance?.id,
      status: result.license_key?.status ?? 'active',
      checkedAt: now.toISOString(),
    };
    await writeJson(store, key, record);
    return json({ state: 'paid', card: await issue(device, 'paid', env, now) }, 200, cors);
  }

  if (url.pathname === '/api/licenca') {
    const { card, record: updated } = await cardFor(device, record, env, now, fetcher);
    if (updated !== record) await writeJson(store, key, updated);
    return json({ ...card, canBuy: true }, 200, cors);
  }

  return fail('not_found', 404, cors);
}

/* --- Checkout -------------------------------------------------------------------- */

export async function handleCheckout(
  request: Request,
  env: LicencaEnv,
  cors: Record<string, string>,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  if (!paymentsConfigured(env)) return fail('not_configured', 503, cors);
  if (request.method !== 'POST') return fail('method_not_allowed', 405, cors);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail('payload_too_large', 413, cors);
  let body: { device?: unknown; code?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return fail('invalid_json', 400, cors);
  }

  const device = typeof body.device === 'string' ? body.device : '';
  if (!deviceShape.test(device)) return fail('invalid_request', 400, cors);
  const code = typeof body.code === 'string' ? body.code.trim().slice(0, 64) : '';

  const attributes: Record<string, unknown> = {
    checkout_data: {
      // O aparelho viaja com o pagamento e volta no webhook: e assim que o
      // telemovel que pagou fica desbloqueado sem ninguem escrever nada.
      custom: { device },
      ...(code ? { discount_code: code } : {}),
    },
    product_options: {
      enabled_variants: [Number(env.LS_VARIANT_ID)],
      redirect_url: `${(env.APP_URL ?? '').replace(/\/+$/, '')}/#/assinatura`,
    },
    checkout_options: { embed: false },
  };

  let response: Response;
  try {
    response = await fetcher(`${API}/checkouts`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${env.LS_API_KEY?.trim()}`,
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes,
          relationships: {
            store: { data: { type: 'stores', id: String(env.LS_STORE_ID) } },
            variant: { data: { type: 'variants', id: String(env.LS_VARIANT_ID) } },
          },
        },
      }),
    });
  } catch {
    return fail('upstream_error', 502, cors);
  }

  if (!response.ok) {
    // Um codigo de desconto que nao existe e o caso comum: vale a pena
    // distingui-lo, para o ecra poder dizer "esse codigo nao serve".
    console.warn('checkout', response.status);
    return fail(code ? 'checkout_refused' : 'upstream_error', 502, cors);
  }

  const payload = await response.json() as { data?: { attributes?: { url?: string } } };
  const checkoutUrl = payload.data?.attributes?.url;
  if (!checkoutUrl) return fail('upstream_error', 502, cors);
  return json({ url: checkoutUrl }, 200, cors);
}

/* --- Webhook --------------------------------------------------------------------- */

/** A assinatura do Lemon Squeezy: HMAC-SHA256 do corpo em bruto, em hexadecimal. */
export async function validSignature(raw: string, signature: string, secret: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return sameSecret(hex, signature.toLowerCase());
}

export async function handleWebhook(
  request: Request,
  env: LicencaEnv,
  cors: Record<string, string>,
  now: Date = new Date(),
): Promise<Response> {
  const secret = env.LS_WEBHOOK_SECRET?.trim();
  if (!secret || !env.LICENCAS) return fail('not_configured', 503, cors);
  if (request.method !== 'POST') return fail('method_not_allowed', 405, cors);

  const raw = await request.text();
  if (raw.length > 64 * 1024) return fail('payload_too_large', 413, cors);
  if (!(await validSignature(raw, request.headers.get('x-signature') ?? '', secret))) {
    return fail('bad_signature', 401, cors);
  }

  let payload: {
    meta?: { event_name?: string; custom_data?: { device?: string } };
    data?: { id?: string; attributes?: Record<string, unknown> };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return fail('invalid_json', 400, cors);
  }

  const event = payload.meta?.event_name ?? '';
  if (!event.startsWith('subscription')) return json({ ok: true }, 200, cors);

  const device = payload.meta?.custom_data?.device;
  if (!device || !deviceShape.test(device)) {
    // Sem aparelho nao ha a quem dar acesso. Nao e um erro do Lemon Squeezy —
    // pode ser uma compra feita fora da aplicacao — e a chave de licenca, que
    // vai no recibo, continua a servir para recuperar o acesso.
    return json({ ok: true }, 200, cors);
  }

  const store = env.LICENCAS as KvStore;
  const key = `dispositivo:${device}`;
  const record = await readJson<DeviceRecord>(store, key) ?? { trialStart: day(now) };
  const attributes = payload.data?.attributes ?? {};
  const urls = attributes.urls as { customer_portal?: string } | undefined;

  await writeJson(store, key, {
    ...record,
    subscription: payload.data?.id,
    portal: typeof urls?.customer_portal === 'string' ? urls.customer_portal : record.portal ?? null,
    status: typeof attributes.status === 'string' ? attributes.status : record.status,
    renewsAt: typeof attributes.renews_at === 'string' ? attributes.renews_at : null,
    endsAt: typeof attributes.ends_at === 'string' ? attributes.ends_at : null,
  });

  return json({ ok: true }, 200, cors);
}

/* --- A porta dos outros endpoints ------------------------------------------------ */

export async function licenceOf(request: Request, env: LicencaEnv): Promise<Licence | null> {
  const secret = env.LICENCE_SECRET?.trim();
  if (!secret) return null;
  const header = request.headers.get('authorization') ?? '';
  if (!header.startsWith('Bearer ')) return null;
  return readLicence(header.slice(7).trim(), secret);
}

/**
 * Uma resposta quando não há licença, ou null quando há.
 *
 * O bloqueio da aplicação é só metade: quem perceber do assunto muda o que
 * está guardado no telemóvel. A outra metade é esta — o que custa dinheiro a
 * sério (a IA, a procura de alimentos, os avisos) sai daqui, e daqui só sai
 * com um cartão assinado.
 */
export async function requireLicence(
  request: Request,
  env: LicencaEnv,
  cors: Record<string, string>,
): Promise<Response | null> {
  if (!paymentsConfigured(env)) return null;
  const licence = await licenceOf(request, env);
  return licence ? null : fail('licence_required', 402, cors);
}
