/**
 * PACE — o assistente remoto.
 *
 * Fala com o Worker da PACE, e só com ele. A chave da Anthropic não existe
 * deste lado: o browser conhece um URL público e mais nada.
 *
 * Três coisas que este ficheiro leva a sério:
 *
 * 1. **Timeout.** Uma resposta que nunca chega é pior do que uma resposta
 *    local: o `AbortController` corta e o motor local responde.
 * 2. **Desconfiança.** O que volta do backend é validado outra vez aqui. Já foi
 *    validado lá, mas quem escreve o cliente não devia assumir isso.
 * 3. **Nunca um beco.** Qualquer falha — rede, timeout, formato — cai no motor
 *    local em vez de deixar o utilizador sem resposta.
 */

import { respond } from '../../domain/coach';
import { cardHeaders } from './licence';
import type { CoachBlock, CoachTurn } from '../../domain/coach/types';
import type {
  AssistantAttachment, AssistantPort, AssistantReply, AssistantRequest,
} from '../types';

/**
 * Quanto tempo esperar pelo modelo.
 *
 * Estavam aqui doze segundos, que é o tempo de uma conversa. Um treino
 * completo não é uma conversa: são alguns milhares de tokens de JSON, e o
 * modelo leva mais do que isso a escrevê-los. O `AbortController` cortava
 * antes de a resposta chegar, sempre, e a aplicação dizia que não tinha
 * chegado ao assistente — quando na verdade tinha desistido dele.
 *
 * Quarenta segundos é muito para esperar por uma frase, e é por isso que o
 * ecrã mostra que está à espera. É pouco para perder um treino inteiro.
 */
const TIMEOUT_MS = 40_000;

/**
 * O tamanho maximo do pedido, com folga sobre o que o backend aceita.
 *
 * O corpo cresce com os dados do utilizador. Sem este corte, ao fim de uns
 * meses de uso o pedido passava o limite do backend, o backend recusava-o, e a
 * aplicacao caia sem barulho no motor local — que responde a outra coisa. Era
 * um problema que so aparecia a quem usasse a aplicacao a serio.
 */
const MAX_BODY_BYTES = 900 * 1024;

/**
 * A ordem por que o contexto se desfaz quando nao cabe.
 *
 * Do menos ao mais util para responder: mil registos de hábitos dizem o mesmo
 * que cem, e os planos e o perfil ficam sempre.
 */
const SHEDDABLE = [
  'habitEntries', 'water', 'meals', 'sessions', 'activities', 'foods', 'exercises',
] as const;

/** Corta o contexto ate o pedido caber, e diz o que cortou. */
function fit(body: Record<string, unknown>, attachments: AssistantAttachment[] = []): string {
  let json = JSON.stringify(body);
  // Os anexos juntam-se so no fim, depois de o contexto caber. Medidos com ele,
  // uma fotografia bastava para o contexto inteiro ser cortado — e a IA via a
  // fotografia sem saber nada de quem a tirou.
  const done = (): string => (
    attachments.length > 0 ? JSON.stringify({ ...body, attachments }) : json
  );
  if (json.length <= MAX_BODY_BYTES) return done();

  const context = body.context as Record<string, unknown>;
  for (const key of SHEDDABLE) {
    const rows = context[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    // Metade de cada vez, os mais recentes primeiro — o contexto ja vem
    // ordenado do mais novo para o mais velho.
    let kept = rows;
    while (kept.length > 0 && json.length > MAX_BODY_BYTES) {
      kept = kept.slice(0, Math.floor(kept.length / 2));
      context[key] = kept;
      json = JSON.stringify(body);
    }
    if (json.length <= MAX_BODY_BYTES) break;
  }
  return done();
}

/**
 * Porque é que a resposta não veio do modelo.
 *
 * O `catch` que engolia tudo custou caro: "não cheguei ao assistente online"
 * dizia-se em cinco situações diferentes — sem rede, sem backend configurado,
 * demorou de mais, o backend recusou, o formato não bateu certo — e nenhuma
 * delas se distinguia das outras, nem para quem usa nem para quem corrige.
 * Passar a saber qual foi custa um campo.
 */
export type FallbackReason =
  | 'sem-configuracao'
  | 'sem-rede'
  | 'demorou'
  | 'recusado'
  | 'formato'
  | 'desconhecido';

/** O erro traz o motivo colado, para o fallback o poder ler. */
class RemoteFailure extends Error {
  constructor(readonly reason: FallbackReason, readonly status?: number) {
    super(reason);
    this.name = 'RemoteFailure';
  }
}

const BLOCK_KINDS = ['text', 'list', 'metrics', 'notice', 'references', 'caveat'];

const ACTION_KINDS = [
  'create_workout', 'create_habits', 'create_run_plan', 'apply_schedule',
  'log_meal', 'create_foods', 'create_events', 'create_playlist', 'open',
];

/**
 * Para onde uma ação "open" pode levar.
 *
 * A mesma lista que o backend impõe, repetida aqui de propósito. O destino vem
 * de texto gerado, e este é o último sítio antes de o utilizador ser levado
 * para lá — se as duas listas divergirem, ganha a mais restritiva.
 */
const OPEN_PATHS = new Set([
  '/hoje', '/agenda', '/treino', '/atividade', '/atividade/historico',
  '/alimentacao', '/sono', '/ia', '/ia/corrida', '/atividade/plano', '/ia/dados', '/perfil',
]);

const MAX_ACTIONS = 3;

/**
 * Uma ação bem formada.
 *
 * Não é uma revalidação campo a campo — isso é do backend, com o Zod. É a
 * verificação de que a forma é reconhecível antes de virar um botão que
 * escreve na aplicação do utilizador.
 */
function isAction(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const action = value as { kind?: string; label?: unknown; path?: unknown; draft?: unknown; drafts?: unknown };
  if (!action.kind || !ACTION_KINDS.includes(action.kind)) return false;
  if (typeof action.label !== 'string' || action.label.trim() === '') return false;

  if (action.kind === 'open') return typeof action.path === 'string' && OPEN_PATHS.has(action.path);
  if (action.kind === 'create_playlist') {
    const tracks = (action.draft as { tracks?: unknown } | undefined)?.tracks;
    return Array.isArray(tracks) && tracks.length > 0;
  }
  if (action.kind === 'create_events') {
    const items = (action.draft as { items?: unknown } | undefined)?.items;
    return Array.isArray(items) && items.length > 0;
  }
  if (action.kind === 'create_habits' || action.kind === 'create_foods') {
    return Array.isArray(action.drafts) && action.drafts.length > 0;
  }
  return !!action.draft && typeof action.draft === 'object';
}

/** Uma validação curta do que chegou. Não substitui a do backend — repete-a. */
function isTurn(value: unknown): value is CoachTurn {
  if (!value || typeof value !== 'object') return false;
  const turn = value as Partial<CoachTurn>;
  if (!Array.isArray(turn.blocks) || turn.blocks.length === 0) return false;
  if (!turn.blocks.every((block: CoachBlock) => BLOCK_KINDS.includes(block?.kind))) return false;
  if (turn.actions != null && !Array.isArray(turn.actions)) return false;
  if (Array.isArray(turn.actions)) {
    if (turn.actions.length > MAX_ACTIONS) return false;
    if (!turn.actions.every(isAction)) return false;
  }
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
        // O cartao de licenca vai em todos os pedidos que custam dinheiro: e
        // ele que o Worker verifica antes de chamar o modelo.
        headers: { 'content-type': 'application/json', ...cardHeaders() },
        signal: controller.signal,
        body: fit({
          message: request.message,
          context: request.context,
          previousIntent: request.previousIntent ?? null,
          history: request.history ?? [],
        }, request.attachments ?? []),
      });

      if (!response.ok) throw new RemoteFailure('recusado', response.status);

      const payload: unknown = await response.json();
      const turn = (payload as { turn?: unknown })?.turn;
      if (!isTurn(turn)) throw new RemoteFailure('formato');

      return {
        // A intenção continua a ser lida pelo motor local: é ela que faz uma
        // correção ("mas só de superiores") colar-se ao pedido anterior, e não
        // se confia essa continuidade a texto gerado.
        turn: { ...turn, intent: request.previousIntent ?? null },
        elapsedMs: Date.now() - started,
        engine: this.engine,
        remote: true,
      };
    } catch (error) {
      if (error instanceof RemoteFailure) throw error;
      // Perguntar ao sinal, e não ao erro: o nome do erro de um `fetch`
      // cortado muda com o motor, e o sinal sabe sempre se fomos nós a cortar.
      // Tudo o resto que o `fetch` rejeita é rede que não chegou lá.
      throw new RemoteFailure(controller.signal.aborted ? 'demorou' : 'sem-rede');
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
      let reason: FallbackReason = 'sem-rede';
      if (await remote.isAvailable().catch(() => false)) {
        try {
          return await remote.respond(request);
        } catch (error) {
          // Sem consola suja: uma falha do backend é um caminho previsto, não
          // um erro do programa. Mas o motivo fica, para o ecrã o poder dizer.
          reason = error instanceof RemoteFailure ? error.reason : 'desconhecido';
        }
      } else if (typeof navigator !== 'undefined' && navigator.onLine !== false) {
        // Há rede, e mesmo assim o remoto diz que não está disponível: o que
        // falta é o endereço do backend, e isso é configuração, não avaria.
        reason = 'sem-configuracao';
      }

      const reply = await local.respond(request);

      // O motor local nao le imagens nem ficheiros. Se a pergunta trazia um,
      // a resposta tem de dizer que ele nao foi visto — calar isso seria deixar
      // o utilizador a achar que a fotografia contou para a resposta.
      if ((request.attachments?.length ?? 0) > 0) {
        return {
          ...reply,
          fallback: true,
          fallbackReason: reason,
          turn: {
            ...reply.turn,
            blocks: [
              {
                kind: 'notice',
                tone: 'caution',
                text: 'Não consegui ligar-me ao assistente online, e o motor que corre '
                  + 'aqui no telemóvel não lê imagens nem ficheiros. Esta resposta não '
                  + 'teve em conta o que enviaste.',
              },
              ...reply.turn.blocks,
            ],
          },
        };
      }

      return { ...reply, fallback: true, fallbackReason: reason };
    },
  };
}

/** O motor local, para quem só precisa dele (testes e fallback direto). */
export function localTurn(request: AssistantRequest): CoachTurn {
  return respond(request.context, request.message, request.previousIntent ?? null);
}
