/**
 * PACE — o cartão de licença.
 *
 * Um texto curto e assinado que diz três coisas: que aparelho é, que direito
 * tem, e até quando vale sem voltar a perguntar. A aplicação guarda-o e mostra
 * -o de cada vez que fala com o servidor; o servidor confirma a assinatura e
 * não precisa de ir à base de dados a cada pedido.
 *
 * É um JWT HS256, assinado com um segredo que só o Worker conhece. Ninguém o
 * pode fabricar sem esse segredo, e ninguém lhe pode mudar a data de validade
 * sem partir a assinatura.
 *
 * A validade é curta de propósito. Enquanto vale, a aplicação funciona sem
 * rede — que é uma propriedade que a PACE não pode perder, porque tudo o resto
 * funciona offline. Quando expira, basta abrir a aplicação com rede para
 * receber outro. Uma subscrição cancelada deixa de ter acesso quando o cartão
 * que tem na mão expirar, e não no instante do cancelamento: é o preço de
 * funcionar sem rede, e é um preço de dias, não de meses.
 */

export type LicenceKind = 'trial' | 'paid' | 'lifetime';

export interface Licence {
  /** O aparelho a que este cartão pertence. */
  device: string;
  kind: LicenceKind;
  /** Segundos desde 1970, como manda o JWT. */
  exp: number;
  /** Quando a subscrição renova, para o ecrã o poder dizer. */
  renews?: string | null;
}

/** Quanto tempo um cartão vale sem a aplicação voltar a falar com o servidor. */
export const LICENCE_DAYS = { trial: 7, paid: 7, lifetime: 90 } as const;

function encode64url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode64url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function signLicence(licence: Licence, secret: string): Promise<string> {
  const text = new TextEncoder();
  const header = encode64url(text.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = encode64url(text.encode(JSON.stringify({
    sub: licence.device,
    kind: licence.kind,
    exp: licence.exp,
    renews: licence.renews ?? null,
  })));
  const signature = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    await key(secret),
    text.encode(`${header}.${body}`),
  ));
  return `${header}.${body}.${encode64url(signature)}`;
}

/**
 * Lê um cartão, ou devolve null.
 *
 * Null para tudo o que esteja mal — assinatura errada, formato estranho, prazo
 * passado. Quem chama não tem de distinguir: sem cartão válido, não há acesso.
 */
export async function readLicence(
  token: string,
  secret: string,
  now: Date = new Date(),
): Promise<Licence | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header = '', body = '', signature = ''] = parts;

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      await key(secret),
      decode64url(signature),
      new TextEncoder().encode(`${header}.${body}`),
    );
  } catch {
    return null;
  }
  if (!valid) return null;

  let claims: { sub?: unknown; kind?: unknown; exp?: unknown; renews?: unknown };
  try {
    claims = JSON.parse(new TextDecoder().decode(decode64url(body)));
  } catch {
    return null;
  }

  const { sub, kind, exp } = claims;
  if (typeof sub !== 'string' || typeof exp !== 'number') return null;
  if (kind !== 'trial' && kind !== 'paid' && kind !== 'lifetime') return null;
  if (exp * 1000 <= now.getTime()) return null;

  return {
    device: sub,
    kind,
    exp,
    renews: typeof claims.renews === 'string' ? claims.renews : null,
  };
}

/** A validade de um cartão novo, a contar de agora. */
export function expiryFor(kind: LicenceKind, now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000) + LICENCE_DAYS[kind] * 24 * 3600;
}

/**
 * Comparação que demora sempre o mesmo tempo.
 *
 * Para o código de acesso. Um `===` devolve falso mais depressa quando o
 * primeiro caractere já não bate certo, e isso, medido muitas vezes, deixa
 * adivinhar o código letra a letra.
 */
export function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
