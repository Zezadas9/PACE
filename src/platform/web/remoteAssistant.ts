/**
 * PACE — o assistente remoto.
 *
 * Fala com o Worker da PACE, e só com ele. A chave da Anthropic não existe
 * deste lado: o browser conhece um URL público e mais nada.
 *
 * Três coisas que este ficheiro leva a sério:
 *
 * 1. **Timeout.** Uma resposta que nunca chega é pior do que uma resposta
 *    local: o `AbortController` corta aos doze segundos e o motor local
 *    responde.
 * 2. **Desconfiança.** O que volta do backend é validado outra vez aqui. Já foi
 *    validado lá, mas quem escreve o cliente não devia assumir isso.
 * 3. **Nunca um beco.** Qualquer falha — rede, timeout, formato — cai no motor
 *    local em vez de deixar o utilizador sem resposta.
 */

import { respond } from '../../domain/coach';
import type { CoachBlock, CoachTurn } from '../../domain/coach/types';
import type { AssistantPort, AssistantReply, AssistantRequest } from '../types';

const TIMEOUT_MS = 12_000;

const BLOCK_KINDS = ['text', 'list', 'metrics', 'notice', 'references', 'caveat'];

/** Uma validação curta do que chegou. Não substitui a do backend — repete-a. */
function isTurn(value: unknown): value is CoachTurn {
  if (!value || typeof value !== 'object') return false;
  const turn = value as Partial<CoachTurn>;
  if (!Array.isArray(turn.blocks) || turn.blocks.length === 0) return false;
  if (!turn.blocks.every((block: CoachBlock) => BLOCK_KINDS.includes(block?.kind))) return false;
  // Nesta versão o remoto nunca propõe ações; se vierem, a resposta é suspeita.
  if (Array.isArray(turn.actions) && turn.actions.length > 0) return false;
  return true;
}

export class RemoteAssistantPort implements AssistantPort {
  readonly engine = 'Claude, através do backend da PACE';

  constructor(private readonly baseUrl: string) {}

  async isAvailable(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    return this.baseUrl.trim() !== '';
  }

  isRemote(): boolean {
    return true;
  }

  async respond(request: AssistantRequest): Promise<AssistantReply> {
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/api/coach`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: request.message,
          context: request.context,
          previousIntent: request.previousIntent ?? null,
          history: request.history ?? [],
        }),
      });

      if (!response.ok) throw new Error(`estado ${response.status}`);

      const payload: unknown = await response.json();
      const turn = (payload as { turn?: unknown })?.turn;
      if (!isTurn(turn)) throw new Error('resposta fora do formato');

      return {
        // A intenção continua a ser lida pelo motor local: é ela que faz uma
        // correção ("mas só de superiores") colar-se ao pedido anterior, e não
        // se confia essa continuidade a texto gerado.
        turn: { ...turn, intent: request.previousIntent ?? null },
        elapsedMs: Date.now() - started,
        engine: this.engine,
        remote: true,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * O remoto com o motor local por baixo.
 *
 * A ordem importa: tenta-se o Claude, e se ele falhar por qualquer razão a
 * resposta local sai à mesma. O utilizador fica sempre com uma resposta, e o
 * ecrã sabe qual das duas foi, para o poder dizer sem drama.
 */
export function withLocalFallback(
  remote: AssistantPort,
  local: AssistantPort,
): AssistantPort {
  return {
    engine: remote.engine,
    isRemote: () => true,
    isAvailable: () => remote.isAvailable(),

    async respond(request: AssistantRequest): Promise<AssistantReply> {
      if (await remote.isAvailable().catch(() => false)) {
        try {
          return await remote.respond(request);
        } catch {
          // Sem consola suja: uma falha do backend é um caminho previsto, não
          // um erro do programa.
        }
      }
      const reply = await local.respond(request);
      return { ...reply, fallback: true };
    },
  };
}

/** O motor local, para quem só precisa dele (testes e fallback direto). */
export function localTurn(request: AssistantRequest): CoachTurn {
  return respond(request.context, request.message, request.previousIntent ?? null);
}
