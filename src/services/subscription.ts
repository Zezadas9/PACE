/**
 * PACE — a assinatura, do lado do telemóvel.
 *
 * Guarda o cartão de licença que o Worker emite, diz se a aplicação está aberta
 * ou fechada, e trata dos dois caminhos que dão acesso: pagar, ou escrever um
 * código.
 *
 * Duas regras que valem a pena dizer em voz alta:
 *
 * 1. **Sem rede não se fecha a porta.** O cartão vale alguns dias, e enquanto
 *    valer a aplicação funciona offline — que é como a PACE funciona em tudo o
 *    resto. Uma viagem sem dados não pode trancar o diário de alguém.
 * 2. **Os dados nunca ficam reféns.** O ecrã da assinatura deixa sempre
 *    exportar a cópia de segurança, mesmo com a aplicação bloqueada.
 */

import { todayKey } from '../core/utils/date';
import type { LicenceSettings } from '../core/types';
import type { Repositories } from '../data/repositories';
import type { LicenceInfo, Platform } from '../platform/types';
import { setCard } from '../platform/web/licence';

/** O que a experiência dura. O servidor conta os mesmos dias. */
export const TRIAL_DAYS = 7;

export type Access = 'open' | 'blocked' | 'unknown';

/** Um identificador opaco deste aparelho. Não diz nada sobre ninguém. */
function newDevice(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Até quando um cartão vale, lido do próprio cartão.
 *
 * Sem verificar a assinatura — isso é do servidor, que tem o segredo. Aqui só
 * se lê a data para saber quando voltar a perguntar. Um cartão adulterado não
 * abre porta nenhuma: o Worker recusa-o na primeira vez que o vir.
 */
export function cardExpiry(card: string): string | null {
  const body = card.split('.')[1];
  if (!body) return null;
  try {
    const base64 = body.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))) as { exp?: number };
    return typeof claims.exp === 'number' ? new Date(claims.exp * 1000).toISOString() : null;
  } catch {
    return null;
  }
}

/**
 * A aplicação está aberta?
 *
 * `unknown` é o estado de quem ainda não conseguiu falar com o servidor. Não
 * bloqueia — bloquear quem acabou de instalar sem rede era começar mal — mas
 * também não dura para sempre: passada a semana, uma conta que nunca chegou a
 * confirmar nada fica fechada na mesma.
 */
export function accessOf(
  licence: LicenceSettings,
  accountStart: string | null,
  now: Date = new Date(),
): Access {
  if (licence.state === 'unmanaged') return 'open';
  if (licence.validUntil && new Date(licence.validUntil).getTime() > now.getTime()) return 'open';
  if (licence.checkedAt) return 'blocked';

  if (!accountStart) return 'unknown';
  const limit = new Date(`${accountStart}T00:00:00.000Z`);
  limit.setUTCDate(limit.getUTCDate() + TRIAL_DAYS);
  return limit.getTime() > now.getTime() ? 'unknown' : 'blocked';
}

/** Quantos dias faltam da experiência, para o ecrã poder contar. */
export function trialDaysLeft(licence: LicenceSettings, now: Date = new Date()): number | null {
  if (licence.state !== 'trial' || !licence.endsAt) return null;
  const left = new Date(licence.endsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(left / (24 * 3600 * 1000)));
}

function remember(repos: Repositories, info: LicenceInfo): LicenceSettings {
  const licence = repos.settings.updateLicence({
    state: info.state,
    card: info.card ?? null,
    validUntil: info.card ? cardExpiry(info.card) : null,
    endsAt: info.endsAt ?? null,
    renewsAt: info.renewsAt ?? null,
    portalUrl: info.portalUrl ?? null,
    canBuy: info.canBuy ?? false,
    checkedAt: new Date().toISOString(),
  }).licence;
  setCard(licence.card);
  return licence;
}

/** O identificador deste aparelho, criado na primeira vez que faz falta. */
function deviceOf(repos: Repositories): string {
  const current = repos.settings.get().licence.device;
  if (current) return current;
  const device = newDevice();
  repos.settings.updateLicence({ device });
  return device;
}

/**
 * Quando vale a pena voltar a perguntar.
 *
 * Não a cada abertura: o cartão vale dias, e um pedido por abertura era um
 * pedido por nada.
 */
export function shouldSync(licence: LicenceSettings, now: Date = new Date()): boolean {
  if (!licence.checkedAt) return true;
  if (now.getTime() - new Date(licence.checkedAt).getTime() > 6 * 3600 * 1000) return true;
  // Um cartao a chegar ao fim pede confirmacao mais cedo, para ninguem ser
  // apanhado de surpresa com a aplicacao fechada.
  return Boolean(
    licence.validUntil
    && new Date(licence.validUntil).getTime() - now.getTime() < 2 * 24 * 3600 * 1000,
  );
}

/**
 * Pergunta o estado ao servidor e guarda-o.
 *
 * Sem resposta — sem rede, servidor em baixo — fica o que já estava. É isso
 * que faz a aplicação continuar a abrir dentro do prazo do cartão.
 */
export async function syncLicence(repos: Repositories, platform: Platform): Promise<LicenceSettings> {
  const info = await platform.licence.status(deviceOf(repos)).catch(() => null);
  if (!info) {
    setCard(repos.settings.get().licence.card);
    return repos.settings.get().licence;
  }
  return remember(repos, info);
}

/** Devolve o endereço do checkout, ou null quando não foi possível abri-lo. */
export async function startCheckout(
  repos: Repositories,
  platform: Platform,
  code: string | null,
): Promise<string | null> {
  return platform.licence.checkout(deviceOf(repos), code?.trim() || null).catch(() => null);
}

export type RedeemOutcome = 'ok' | 'invalid' | 'email' | 'offline';

/** Um código: a chave de licença que veio no email da compra, ou um código de acesso. */
export async function redeemCode(
  repos: Repositories,
  platform: Platform,
  code: string,
  email: string,
): Promise<RedeemOutcome> {
  const result = await platform.licence
    .redeem(deviceOf(repos), code.trim(), email.trim().toLowerCase())
    .catch(() => ({ ok: false, error: 'offline' } as const));
  if (!result.ok) return result.error ?? 'invalid';
  remember(repos, result.info);
  return 'ok';
}

/** O primeiro dia da conta, que é o que limita quem nunca falou com o servidor. */
export function accountStart(repos: Repositories): string | null {
  const user = repos.user.get();
  return user ? user.createdAt.slice(0, 10) : todayKey();
}
