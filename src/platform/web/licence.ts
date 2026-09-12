/**
 * A licença, vista do telemóvel.
 *
 * Fala com o Worker e mais nada. Não sabe preços, não sabe cartões de crédito
 * e não decide nada: pergunta o estado, recebe um cartão assinado, e é o
 * servidor que manda. Do lado de cá o cartão é só um texto que se guarda e se
 * mostra nos pedidos seguintes.
 *
 * Sem Worker configurado, a porta diz `unmanaged` e a aplicação não cobra nada
 * a ninguém — é o estado em que o repositório vive antes de a loja existir.
 */

import type { LicenceInfo, LicencePort, RedeemResult } from '../types';

/** O cartão que acompanha os pedidos pagos. Vive aqui para todos o alcançarem. */
let card: string | null = null;

export function setCard(value: string | null): void {
  card = value;
}

/**
 * O cabeçalho que prova o direito de usar o que custa dinheiro.
 *
 * Vazio quando não há cartão — e aí o Worker responde 402, que é exactamente o
 * que deve acontecer.
 */
export function cardHeaders(): Record<string, string> {
  return card ? { authorization: `Bearer ${card}` } : {};
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

export class RemoteLicencePort implements LicencePort {
  constructor(private readonly baseUrl: string) {}

  private url(path: string): string {
    return `${this.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  async status(device: string): Promise<LicenceInfo | null> {
    const response = await post(this.url('/api/licenca'), { device });
    if (!response?.ok) return null;
    return await response.json() as LicenceInfo;
  }

  async redeem(device: string, code: string, email: string): Promise<RedeemResult> {
    const response = await post(this.url('/api/licenca/codigo'), { device, code, email });
    if (!response) return { ok: false, error: 'offline' };
    if (response.ok) return { ok: true, info: await response.json() as LicenceInfo };
    const body = await response.json().catch(() => ({})) as { error?: string };
    // `email_mismatch` merece frase própria: o código está certo e o email não,
    // e dizer "código inválido" mandava a pessoa procurar no sítio errado.
    return { ok: false, error: body.error === 'email_mismatch' ? 'email' : 'invalid' };
  }

  async checkout(device: string, code: string | null): Promise<string | null> {
    const response = await post(this.url('/api/pagamento/checkout'), { device, code });
    if (!response?.ok) return null;
    const body = await response.json() as { url?: string };
    return body.url ?? null;
  }
}

/** Sem backend não há nada a cobrar, e a aplicação abre para toda a gente. */
export class UnmanagedLicencePort implements LicencePort {
  async status(): Promise<LicenceInfo> {
    return { state: 'unmanaged' };
  }

  async redeem(): Promise<RedeemResult> {
    return { ok: false, error: 'invalid' };
  }

  async checkout(): Promise<string | null> {
    return null;
  }
}
