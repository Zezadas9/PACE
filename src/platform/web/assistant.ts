/**
 * PACE — o assistente local.
 *
 * Corre no dispositivo, sem rede e sem chave de API. É determinístico: a mesma
 * pergunta com os mesmos dados dá a mesma resposta, o que também quer dizer que
 * é testável — e um treinador que não se consegue testar não devia dar
 * conselhos a ninguém.
 */

import { respond } from '../../domain/coach';
import type { AssistantPort, AssistantReply, AssistantRequest } from '../types';

export class LocalAssistantPort implements AssistantPort {
  readonly engine = 'motor local de regras';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  isRemote(): boolean {
    return false;
  }

  async respond(request: AssistantRequest): Promise<AssistantReply> {
    const started = performance.now();
    const turn = respond(request.context, request.message, request.previousIntent ?? null);
    return {
      turn,
      elapsedMs: Math.round(performance.now() - started),
      engine: this.engine,
      remote: false,
    };
  }
}
