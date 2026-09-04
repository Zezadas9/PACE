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
/**
 * O corpo do pedido.
 *
 * Generoso porque uma fotografia cabe aqui dentro, e apertado porque o cliente
 * reduz a imagem antes de a enviar: 1024 px de lado e JPEG raramente passam
 * dos 300 KB. Quem enviar mais do que isto está a tentar outra coisa.
 */
export const MAX_BODY_BYTES = 3 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

/** O que o modelo consegue mesmo ler. Nada de vídeo, nada de zips. */
export const ATTACHMENT_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
] as const;

export const attachmentSchema = z.object({
  kind: z.enum(['image', 'document']),
  mediaType: z.enum(ATTACHMENT_TYPES),
  // O tamanho em base64 é cerca de 4/3 do original; o limite é sobre o que
  // atravessa a rede, que é o que interessa medir.
  data: z.string().min(1).max(Math.ceil((MAX_ATTACHMENT_BYTES * 4) / 3)),
  name: z.string().max(120).nullable().optional(),
}).refine(
  (value) => (value.kind === 'document') === (value.mediaType === 'application/pdf'),
  { message: 'o tipo do anexo tem de bater certo com o media type' },
);

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
  attachment: attachmentSchema.nullable().default(null),
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

/* --- Ações --------------------------------------------------------------------- */

/**
 * O que o modelo pode propor.
 *
 * Propor, e não fazer: uma ação é uma carga útil completa que fica à espera de
 * um toque do utilizador. Nada aqui escreve na aplicação — quem escreve é o
 * `applyAction` do frontend, depois da confirmação.
 *
 * Cada campo é limitado. Não por desconfiança do modelo, mas porque isto
 * atravessa a rede: o que chega ao `applyAction` tem de ser uma estrutura
 * conhecida, não um objeto com a forma aproximada de uma.
 */
const MAX_LABEL = 80;
const weekday = z.number().int().min(0).max(6);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const workoutDraft = z.object({
  title: z.string().min(1).max(60),
  type: z.enum([
    'strength', 'functional', 'calisthenics', 'hiit', 'mobility', 'pilates', 'sport', 'other',
  ]),
  estimatedMin: z.number().int().min(5).max(240),
  weekdays: z.array(weekday).max(7).default([]),
  blocks: z
    .array(
      z.object({
        section: z.enum(['warmup', 'main', 'cardio']),
        exerciseName: z.string().min(1).max(60),
        muscleGroups: z
          .array(z.enum(['chest', 'back', 'legs', 'shoulders', 'arms', 'core', 'full_body']))
          .max(7)
          .default([]),
        isBodyweight: z.boolean().default(false),
        sets: z.number().int().min(1).max(12),
        reps: z.number().int().min(1).max(200).nullable().default(null),
        durationSec: z.number().int().min(5).max(7200).nullable().default(null),
        restSec: z.number().int().min(0).max(600).nullable().default(null),
        note: z.string().max(160).nullable().default(null),
      }),
    )
    .min(1)
    .max(20),
});

const habitDraft = z.object({
  title: z.string().min(1).max(60),
  kind: z.enum(['check', 'count', 'duration']),
  frequency: z.enum(['daily', 'weekly', 'weekdays', 'custom']),
  weekdays: z.array(weekday).max(7).default([]),
  target: z.number().int().min(1).max(1000),
  unit: z.string().max(20).nullable().default(null),
  timeOfDay: clock.nullable().default(null),
  durationMin: z.number().int().min(1).max(600).nullable().default(null),
  essential: z.boolean().default(false),
  rationale: z.string().max(300).default(''),
  referenceIds: z.array(z.string().max(60)).max(4).default([]),
});

const runPlanDraft = z.object({
  title: z.string().min(1).max(60),
  goalDistanceM: z.number().int().min(1000).max(100000),
  weeks: z.number().int().min(1).max(52),
  weekdays: z.array(weekday).max(7).default([]),
  startDate: dayKey,
  sessions: z
    .array(
      z.object({
        weekIndex: z.number().int().min(0).max(51),
        date: dayKey,
        kind: z.enum(['easy', 'intervals', 'long', 'tempo', 'rest', 'walk_run']),
        segments: z
          .array(
            z.object({
              runSec: z.number().int().min(0).max(7200),
              walkSec: z.number().int().min(0).max(7200),
              repeats: z.number().int().min(1).max(40),
            }),
          )
          .max(20)
          .default([]),
        targetDistanceM: z.number().int().min(0).max(100000).nullable().default(null),
        targetDurationSec: z.number().int().min(0).max(36000).nullable().default(null),
        note: z.string().max(160).nullable().default(null),
      }),
    )
    .min(1)
    .max(200),
});

const scheduleDraft = z.object({
  items: z
    .array(
      z.object({
        weekday,
        time: clock.nullable().default(null),
        durationMin: z.number().int().min(5).max(600).nullable().default(null),
        kind: z.enum(['workout', 'run', 'walk', 'water']),
        label: z.string().min(1).max(60),
      }),
    )
    .max(30)
    .default([]),
  untouched: z.array(z.string().max(120)).max(30).default([]),
  unplaced: z.array(z.string().max(120)).max(30).default([]),
  summary: z.array(z.string().max(120)).max(10).default([]),
});

/**
 * Para onde uma ação "open" pode levar.
 *
 * Uma lista fechada, e não um caminho livre: o destino vem de texto gerado, e
 * um caminho gerado é um sítio onde ninguém devia poder mandar o utilizador.
 */
export const OPEN_PATHS = [
  '/hoje', '/agenda', '/treino', '/atividade', '/atividade/historico',
  '/alimentacao', '/ia', '/ia/corrida', '/ia/dados', '/perfil',
] as const;

export const actionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('create_workout'),
    label: z.string().min(1).max(MAX_LABEL),
    draft: workoutDraft,
  }),
  z.object({
    kind: z.literal('create_habits'),
    label: z.string().min(1).max(MAX_LABEL),
    drafts: z.array(habitDraft).min(1).max(8),
  }),
  z.object({
    kind: z.literal('create_run_plan'),
    label: z.string().min(1).max(MAX_LABEL),
    draft: runPlanDraft,
  }),
  z.object({
    kind: z.literal('apply_schedule'),
    label: z.string().min(1).max(MAX_LABEL),
    draft: scheduleDraft,
  }),
  z.object({
    kind: z.literal('open'),
    label: z.string().min(1).max(MAX_LABEL),
    path: z.enum(OPEN_PATHS),
  }),
]);

export const MAX_ACTIONS = 3;

/**
 * A resposta do modelo.
 *
 * As ações já podem vir preenchidas — é o que separa um assistente que fala de
 * um que ajuda. O que não muda é que nenhuma corre sozinha: cada uma aparece
 * como um botão, com o que vai acontecer escrito, e só o toque a executa.
 *
 * `move_workout` fica de fora de propósito: mexer no que já está marcado exige
 * conhecer ids reais da aplicação, e um id vindo de texto gerado não é um id.
 */
export const turnSchema = z.object({
  blocks: z.array(blockSchema).min(1).max(MAX_BLOCKS),
  actions: z.array(actionSchema).max(MAX_ACTIONS).default([]),
  followUps: z.array(z.string().min(1).max(120)).max(MAX_FOLLOW_UPS).default([]),
});

export type CoachTurnOutput = z.infer<typeof turnSchema>;

/**
 * Deixa a resposta apresentável, ou rejeita-a.
 *
 * Uma citação inventada é pior do que citação nenhuma: os blocos de fontes só
 * sobrevivem com identificadores que existem mesmo no catálogo da aplicação, e
 * um bloco que fique sem nenhum é removido em vez de aparecer vazio. O mesmo
 * vale para as referências que vêm agarradas a um hábito proposto.
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

  const actions = turn.actions.slice(0, MAX_ACTIONS).map((action) => {
    if (action.kind !== 'create_habits') return action;
    return {
      ...action,
      drafts: action.drafts.map((draft) => ({
        ...draft,
        referenceIds: draft.referenceIds.filter((id) => knownReferenceIds.has(id)),
      })),
    };
  });

  return { blocks, actions, followUps: turn.followUps.slice(0, MAX_FOLLOW_UPS) };
}
