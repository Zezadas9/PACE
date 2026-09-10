/**
 * PACE — o lembrete diário da sequência.
 *
 * Um aviso por dia, à hora escolhida, e só se o dia ainda não fechou. Quem já
 * marcou os essenciais não recebe nada: um lembrete que chega a quem já fez o
 * que tinha a fazer é ruído, e ruído ensina a ignorar os avisos todos.
 *
 * Na web, com a aplicação fechada, só um push chega — por isso este lembrete
 * não entra no planeador das notificações locais, que só disparam com a
 * aplicação aberta. O push vem do Worker, e o Worker só sabe três coisas: o
 * endereço de push, a hora, e se o dia de hoje fechou. Tudo o resto fica aqui.
 */

import { todayKey } from '../core/utils/date';
import { streakDetail } from '../domain/streak';
import type { Repositories } from '../data/repositories';
import type { Platform, PushState } from '../platform/types';
import { progressDataset } from './agenda';

export type StreakReminderStatus = PushState | 'off';

/*
 * O que já foi dito ao Worker nesta sessão.
 *
 * A sincronização corre a cada alteração dos dados. Sem isto, marcar quatro
 * hábitos seguidos eram quatro pedidos a dizer a mesma coisa — e o KV do plano
 * gratuito conta as escritas.
 */
let enabledFor = '';
let reportedDay = '';

/** Um identificador opaco. Não diz nada sobre ninguém; só separa aparelhos. */
function newId(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Deixa o número de dias onde o service worker o encontra.
 *
 * O push chega vazio, de propósito, e o texto do aviso escreve-se no telemóvel.
 * "Faltam os essenciais para manteres os teus 12 dias" diz mais do que um
 * aviso genérico — e o 12 nunca sai do aparelho.
 */
async function rememberStreak(days: number): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open('pace-estado');
    await cache.put('./_sequencia', new Response(JSON.stringify({ days }), {
      headers: { 'content-type': 'application/json' },
    }));
  } catch {
    /* Sem o número, o aviso usa o texto genérico. */
  }
}

export async function syncStreakReminder(
  repos: Repositories,
  platform: Platform,
  today = todayKey(),
): Promise<StreakReminderStatus> {
  const settings = repos.settings.get().notifications;
  const user = repos.user.get();
  const detail = streakDetail(progressDataset(repos), user ? user.createdAt.slice(0, 10) : null, today);
  void rememberStreak(detail.current);

  if (!settings.enabled || !settings.streakReminder) {
    // Desligado depois de ter estado ligado: o Worker esquece este aparelho.
    if (settings.pushId && enabledFor !== 'off') {
      enabledFor = 'off';
      reportedDay = '';
      await platform.push.disable(settings.pushId).catch(() => {});
    }
    return 'off';
  }

  if (!platform.push.supported()) return 'unsupported';

  let id = settings.pushId;
  if (!id) {
    id = newId();
    repos.settings.update({ pushId: id });
  }

  // O campo da hora escreve a cada tecla — "2", "20:", "20:3". Uma hora a meio
  // nao vai para o Worker: esperava-se um pedido falhado por cada tecla.
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(settings.streakReminderTime)) return 'failed';

  const zone = timezone();
  const subscription = `${id}|${settings.streakReminderTime}|${zone}`;
  if (enabledFor !== subscription) {
    const state = await platform.push.enable({ id, time: settings.streakReminderTime, timezone: zone });
    if (state !== 'ok') return state;
    enabledFor = subscription;
    reportedDay = '';
  }

  // O dia fecha quando não falta nenhum essencial. Um dia sem essenciais
  // também conta como fechado: não há sequência a proteger, e não se avisa.
  const closed = detail.remainingToday === 0;
  const day = `${today}|${closed}`;
  if (reportedDay !== day && await platform.push.reportDay({ id, date: today, closed })) {
    reportedDay = day;
  }
  return 'ok';
}

/** Para os testes: o que foi dito ao Worker vive em memória, e tem de se poder esquecer. */
export function forgetStreakReminderSession(): void {
  enabledFor = '';
  reportedDay = '';
}
