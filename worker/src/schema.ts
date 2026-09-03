/**
 * PACE — o que entra e o que sai do backend.
 *
 * Tudo o que atravessa a rede é validado nos dois sentidos. O pedido, porque
 * vem de um browser e um browser pode enviar qualquer coisa. E a resposta do
 * modelo, porque **texto de um modelo não é uma promessa**: se não couber
 * exatamente neste formato, não chega ao utilizador.
 *
 * Os limites de tamanho não são decoração. São o que impede um pedido enorme
 * de custar tokens a sério, e uma resposta gigante de encher o ecrã.
 */

import { z } from 'zod';

/* --- Pedido ------------------------------------------------------------------ */

export const MAX_MESSAGE_CHARS = 2000;
export const MAX_HISTORY_MESSAGES = 10;
export const MAX_HISTORY_CHARS = 1200;
export const MAX_BODY_BYTES = 128 * 1024;

/**
 * O contexto chega já filtrado pelas autorizações do utilizador — é o
 * `buildContext()` do frontend que decide o que entra. Aqui valida-se a forma
 * e cortam-se as coleções, sem tentar redescrever o domínio inteiro: campos
 * desconhecidos passam, campos conhecidos têm de ser do tipo certo.
 */
const entry = z.looseObject({});

export const contextSchema = z.looseObject({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  settings: z.looseObject({
    enabled: z.boolean(),
    categories: z.record(z.string(), z.boolean()),
  }),
  profile: z
    .object({
      name: z.string().max(80).nullable(),
      ageYears: z.number().int().min(0).max(130).nullable(),
      gender: z.string().max(40).nullable(),
      heightCm: z.number().min(0).max(300).nullable(),
      weightKg: z.number().min(0).max(600).nullable(),
    })
    .nullable(),
  goals: z.array(entry).max(40).default([]),
  workouts: z.array(entry).max(60).default([]),
  exercises: z.array(entry).max(400).default([]),
  sessions: z.array(entry).max(400).default([]),
  activities: z.array(entry).max(400).default([]),
  habits: z.array(entry).max(80).default([]),
  habitEntries: z.array(entry).max(1500).default([]),
  meals: z.array(entry).max(600).default([]),
  foods: z.array(entry).max(600).default([]),
  water: z.array(entry).max(600).default([]),
  runPlan: entry.nullable().default(null),
});

export const requestSchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_CHARS),
  context: contextSchema,
  previousIntent: z.unknown().nullable().default(null),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().max(MAX_HISTORY_CHARS),
      }),
    )
    .max(MAX_HISTORY_MESSAGES)
    .default([]),
});

export type CoachRequest = z.infer<typeof requestSchema>;
export type CoachContextInput = z.infer<typeof contextSchema>;

/* --- Resposta ---------------------------------------------------------------- */

export const MAX_BLOCKS = 12;
export const MAX_BLOCK_CHARS = 900;
export const MAX_LIST_ITEMS = 8;
export const MAX_FOLLOW_UPS = 3;

const textBlock = z.object({
  kind: z.literal('text'),
  text: z.string().min(1).max(MAX_BLOCK_CHARS),
});

const listBlock = z.object({
  kind: z.literal('list'),
  items: z.array(z.string().min(1).max(MAX_BLOCK_CHARS)).min(1).max(MAX_LIST_ITEMS),
  ordered: z.boolean().optional(),
});

const metricsBlock = z.object({
  kind: z.literal('metrics'),
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(60),
        value: z.string().min(1).max(60),
        note: z.string().max(120).optional(),
      }),
    )
    .min(1)
    .max(6),
});

const noticeBlock = z.object({
  kind: z.literal('notice'),
  tone: z.enum(['info', 'caution', 'medical']),
  text: z.string().min(1).max(MAX_BLOCK_CHARS),
});

const referencesBlock = z.object({
  kind: z.literal('references'),
  ids: z.array(z.string().max(60)).min(1).max(6),
});

const caveatBlock = z.object({
  kind: z.literal('caveat'),
  text: z.string().min(1).max(MAX_BLOCK_CHARS),
});

export const blockSchema = z.discriminatedUnion('kind', [
  textBlock, listBlock, metricsBlock, noticeBlock, referencesBlock, caveatBlock,
]);

/**
 * A resposta do modelo.
 *
 * `actions` tem de vir vazia. Esta versão não deixa o modelo criar treinos,
 * hábitos, planos nem mexer na agenda: as ações que escrevem na aplicação
 * continuam a nascer do motor local, onde são código e não texto gerado.
 */
export const turnSchema = z.object({
  blocks: z.array(blockSchema).min(1).max(MAX_BLOCKS),
  actions: z.array(z.unknown()).max(0).default([]),
  followUps: z.array(z.string().min(1).max(120)).max(MAX_FOLLOW_UPS).default([]),
});

export type CoachTurnOutput = z.infer<typeof turnSchema>;

/**
 * Deixa a resposta apresentável, ou rejeita-a.
 *
 * Uma citação inventada é pior do que citação nenhuma: os blocos de fontes só
 * sobrevivem com identificadores que existem mesmo no catálogo da aplicação, e
 * um bloco que fique sem nenhum é removido em vez de aparecer vazio.
 */
export function sanitizeTurn(
  turn: CoachTurnOutput,
  knownReferenceIds: ReadonlySet<string>,
): CoachTurnOutput | null {
  const blocks = turn.blocks
    .map((block) => {
      if (block.kind !== 'references') return block;
      const ids = block.ids.filter((id) => knownReferenceIds.has(id));
      return ids.length > 0 ? { ...block, ids } : null;
    })
    .filter((block): block is z.infer<typeof blockSchema> => block != null);

  if (blocks.length === 0) return null;
  return { blocks, actions: [], followUps: turn.followUps.slice(0, MAX_FOLLOW_UPS) };
}
