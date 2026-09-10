/**
 * Web Push — o que acorda a aplicação fechada para o lembrete da sequência.
 *
 * As notificações locais da web só disparam com a aplicação aberta: não há API
 * de agendamento, e um temporizador morre com a página. Um lembrete às 20h com
 * a aplicação fechada tem de chegar de fora, e é para isso que isto existe.
 *
 * No iPhone só funciona com a aplicação adicionada ao ecrã principal (iOS 16.4
 * ou mais recente). Num separador do Safari, `PushManager` nem existe — e o
 * `supported()` diz isso, para o ecrã das definições o poder dizer também.
 *
 * O que vai para o servidor: o endereço de push que o browser dá, a hora, o
 * fuso horário, e "o dia de hoje fechou" — um sim ou não. Mais nada.
 */

import type { PushPort, PushState } from '../types';

function decode64url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Se a subscrição que já existe foi feita com esta chave. */
function sameKey(current: ArrayBuffer | null | undefined, publicKey: Uint8Array): boolean {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === publicKey.length && bytes.every((byte, index) => byte === publicKey[index]);
}

async function post(url: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return null;
  }
}

export class WebPushPort implements PushPort {
  constructor(private readonly baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  supported(): boolean {
    return typeof window !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && typeof Notification !== 'undefined';
  }

  async enable(input: { id: string; time: string; timezone: string }): Promise<PushState> {
    if (!this.supported()) return 'unsupported';
    if (Notification.permission !== 'granted') return 'denied';

    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return 'unsupported';

    let keyResponse: Response;
    try {
      keyResponse = await fetch(this.url('/api/push/key'));
    } catch {
      return 'failed';
    }
    // 503 é o Worker a dizer que ainda não tem as chaves nem o KV — é
    // configuração em falta, não avaria, e o ecrã diz isso por outras palavras.
    if (keyResponse.status === 503) return 'not-configured';
    if (!keyResponse.ok) return 'failed';
    const { publicKey } = await keyResponse.json() as { publicKey?: string };
    if (!publicKey) return 'not-configured';
    const serverKey = decode64url(publicKey);

    let subscription = await registration.pushManager.getSubscription();
    // Uma subscrição feita com outra chave não serve: o serviço de push recusa
    // tudo o que vier assinado com a nova. Faz-se outra.
    if (subscription && !sameKey(subscription.options.applicationServerKey, serverKey)) {
      await subscription.unsubscribe().catch(() => false);
      subscription = null;
    }
    if (!subscription) {
      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: serverKey,
        });
      } catch {
        return 'denied';
      }
    }

    const response = await post(this.url('/api/push/subscribe'), {
      id: input.id,
      endpoint: subscription.endpoint,
      time: input.time,
      timezone: input.timezone,
    });
    return response?.ok ? 'ok' : 'failed';
  }

  async reportDay(input: { id: string; date: string; closed: boolean }): Promise<boolean> {
    const response = await post(this.url('/api/push/day'), input);
    return response?.ok === true;
  }

  async disable(id: string): Promise<void> {
    await post(this.url('/api/push/unsubscribe'), { id });
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    await subscription?.unsubscribe().catch(() => false);
  }
}

/**
 * Sem Worker configurado não há quem envie o push. Diz-se, e mais nada.
 *
 * `supported()` responde que sim de propósito: o browser pode muito bem
 * suportar push, e o que falta é o servidor. Se dissesse que não, o perfil
 * mandava instalar a aplicação no ecrã principal — a causa errada, e um
 * conselho que não resolvia nada. Assim o pedido chega ao `enable`, que dá a
 * razão certa.
 */
export class UnavailablePushPort implements PushPort {
  supported(): boolean {
    return true;
  }

  async enable(): Promise<PushState> {
    return 'not-configured';
  }

  async reportDay(): Promise<boolean> {
    return false;
  }

  async disable(): Promise<void> {}
}
