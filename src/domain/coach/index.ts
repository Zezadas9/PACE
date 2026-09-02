/**
 * PACE — o assistente.
 *
 * Uma função: mensagem para dentro, resposta e propostas para fora. Tudo o que
 * está aqui é determinístico e testável, e essa é a escolha central desta fase.
 *
 * **Não há modelo de linguagem por trás disto.** A aplicação não tem servidor
 * nem chave de API, e uma chave dentro de uma app é uma chave pública. Em vez
 * de fingir uma IA, o que existe é um treinador de regras: lê os teus dados,
 * calcula, cita a fonte e propõe ações concretas. Quando houver back-end, um
 * modelo entra por `AssistantPort` e devolve este mesmo `CoachTurn` — os ecrãs,
 * as ações e as regras de segurança não mudam uma linha.
 *
 * As três regras que nenhum caminho pode contornar:
 *
 * 1. O que for clínico não é respondido — é encaminhado.
 * 2. O que não estiver autorizado não é lido.
 * 3. O que não se souber é dito, nunca preenchido com um valor plausível.
 */

import type { AiDataCategory, MuscleGroup } from '../../core/types';
import { addDaysToKey } from '../../core/utils/date';
import { buildWorkout, setsByGroup } from './build-workout';
import { evaluateWeek, findingsFor as workoutFindings, type Finding } from './evaluate-workout';
import { MUSCLE_LABELS } from './exercises';
import { suggestHabits } from './habits';
import { parseIntent, refine, type CoachIntent } from './intent';
import { readNutrition } from './nutrition-advice';
import { readPerformance } from './performance';
import { baselineFrom, buildRunPlan } from './running';
import { screen } from './safety';
import { caveat, notice, sources, text, type CoachBlock, type CoachContext, type CoachTurn } from './types';
import { missingPlans, proposeWeek, weekdayName } from './week-plan';
import {
  activityAnswer, mealIdeasAnswer, recoveryAnswer, sleepAnswer, todayAnswer,
  weeklyActivityMinutes, type TopicAnswer,
} from './topics';

export { parseIntent, refine, looksLikeRefinement } from './intent';
export type { CoachIntent } from './intent';
export { screen, LIMITS } from './safety';
export * from './references';
export type { CoachContext, CoachTurn, CoachBlock } from './types';

/** Blocos que transformam achados em texto lido de cima para baixo. */
function findingBlocks(findings: Finding[]): CoachBlock[] {
  const blocks: CoachBlock[] = [];
  const icon = { good: '✓', watch: '!', gap: '→', unknown: '?' } as const;

  for (const finding of findings) {
    blocks.push(text(`${icon[finding.tone]} **${finding.title}** — ${finding.detail}`));
  }
  const ids = [...new Set(findings.flatMap((finding) => finding.referenceIds))];
  if (ids.length > 0) blocks.push(sources(...ids));
  return blocks;
}

function allowed(context: CoachContext, ...categories: AiDataCategory[]): boolean {
  if (!context.settings.enabled) return false;
  return categories.every((category) => context.settings.categories[category]);
}

function consentTurn(missing: AiDataCategory[]): CoachTurn {
  const labels: Record<AiDataCategory, string> = {
    profile: 'perfil', goals: 'objetivos', training: 'treinos', activity: 'atividade',
    nutrition: 'alimentação', habits: 'hábitos', sleep: 'sono', feedback: 'feedback',
  };
  return {
    blocks: [
      notice('info',
        `Para responder a isto preciso de ler: ${missing.map((c) => labels[c]).join(', ')}. `
        + 'Não leio nada que não tenhas autorizado.'),
    ],
    actions: [{ kind: 'open', label: 'Escolher o que posso ler', path: '/ia/dados' }],
    followUps: [],
  };
}

/** O objetivo dominante, quando há autorização para o ler. */
function dominantGoal(context: CoachContext): 'gain_muscle' | 'lose_weight' | 'improve_fitness' | 'general' {
  if (!allowed(context, 'goals')) return 'general';
  const active = context.goals.filter((goal) => goal.active).map((goal) => goal.type);
  if (active.includes('gain_muscle')) return 'gain_muscle';
  if (active.includes('lose_weight')) return 'lose_weight';
  if (active.includes('improve_fitness')) return 'improve_fitness';
  return 'general';
}

/* --- As respostas ---------------------------------------------------------------- */

function createWorkoutTurn(context: CoachContext, intent: CoachIntent): CoachTurn {
  // Cada tipo tem uma duração natural: ninguém alonga 45 minutos, e um HIIT
  // de uma hora deixa de ser HIIT.
  const byType: Partial<Record<string, number>> = {
    mobility: 15, pilates: 30, hiit: 25, functional: 35,
  };
  const fallback = byType[intent.workoutType ?? 'strength'] ?? 45;
  const minutes = Math.min(120, Math.max(10, intent.minutes ?? fallback));
  const muscles: MuscleGroup[] = intent.muscles.length > 0 ? intent.muscles : ['full_body'];

  const draft = buildWorkout({
    minutes,
    muscles,
    excluded: intent.excluded,
    type: intent.workoutType ?? 'strength',
    equipment: intent.equipment,
    goal: dominantGoal(context),
    weekdays: [],
  });

  const main = draft.blocks.filter((block) => block.section === 'main');
  const perGroup = setsByGroup(draft)
    .map((entry) => `${MUSCLE_LABELS[entry.group]}: ${entry.sets} séries`);

  const blocks: CoachBlock[] = [
    // Uma correção merece ser reconhecida: mostra que a conversa foi seguida.
    text(`${intent.isRefinement ? 'Ajustei. ' : ''}**${draft.title}** — cerca de `
      + `${draft.estimatedMin} minutos, ${main.length} exercícios na parte principal.`),
  ];
  if (perGroup.length > 0) blocks.push({ kind: 'list', items: perGroup });
  if (intent.equipment === 'home' || intent.equipment === 'bodyweight') {
    blocks.push(text('Só com o peso do corpo, sem material.'));
  }
  if (intent.excluded.length > 0) {
    blocks.push(text(`Deixei de fora: ${intent.excluded.map((group) => MUSCLE_LABELS[group]).join(', ')}.`));
  }

  if (draft.type === 'strength' || draft.type === 'calisthenics') {
    blocks.push(text(
      'As repetições e os descansos seguem os intervalos da posição da ACSM para o teu '
      + 'objetivo. As cargas ficam por tua conta: só tu sabes com quanto peso é que a última '
      + 'repetição ainda sai com boa técnica.',
    ));
    blocks.push(sources('acsm-2009', 'schoenfeld-2017-volume'));
  } else if (draft.type === 'mobility') {
    blocks.push(caveat(
      'Mobilidade entra aqui pelo conforto e pela consistência. Não te prometo prevenção '
      + 'de lesões: a evidência nesse ponto é mista.',
    ));
  } else {
    blocks.push(text('Trabalho curto, descanso curto, várias voltas. Se a técnica se '
      + 'estragar, para a volta — o cansaço não vale a lesão.'));
    blocks.push(sources('garber-2011'));
  }

  return {
    blocks,
    actions: [{ kind: 'create_workout', label: 'Adicionar treino', draft }],
    followUps: [
      'Mas só de superiores',
      'Faz antes em casa, sem equipamento',
      'Este treino está equilibrado?',
    ],
  };
}

function evaluateTurn(context: CoachContext): CoachTurn {
  const groups = new Map(context.exercises.map((exercise) => [exercise.id, exercise.muscleGroups]));
  const evaluation = evaluateWeek(context.workouts, groups, context.sessions, context.today);
  const findings = workoutFindings(evaluation);

  const blocks: CoachBlock[] = [
    text('Li a tua semana como está marcada nos planos.'),
    {
      kind: 'metrics',
      items: [
        { label: 'Dias de treino', value: `${evaluation.sessionsPerWeek}` },
        { label: 'Dias de folga', value: `${evaluation.restDays}` },
        {
          label: 'Duração média',
          value: evaluation.avgMinutes == null ? '—' : `${evaluation.avgMinutes} min`,
          note: evaluation.avgMinutes == null ? 'sem sessões cronometradas' : undefined,
        },
        {
          label: 'RPE médio',
          value: evaluation.avgRpe == null ? '—' : `${evaluation.avgRpe}`,
          note: evaluation.avgRpe == null ? 'por registar' : undefined,
        },
      ],
    },
    ...findingBlocks(findings),
  ];

  return {
    blocks,
    actions: [{ kind: 'open', label: 'Ver treinos', path: '/treino' }],
    followUps: ['Cria-me um treino de 45 minutos', 'Como está a minha evolução?'],
  };
}

function runPlanTurn(context: CoachContext, intent: CoachIntent): CoachTurn {
  const goalDistanceM = intent.distanceM ?? 10000;
  const baseline = allowed(context, 'activity')
    ? baselineFrom(context.activities, context.today)
    : { hasHistory: false, longestRunM: null, weeklyVolumeM: null, sessionsPerWeek: null };

  const draft = buildRunPlan(goalDistanceM, addDaysToKey(context.today, 1), baseline);
  const km = Math.round(goalDistanceM / 1000);

  const blocks: CoachBlock[] = [
    text(baseline.hasHistory
      ? `Parti da tua corrida mais longa das últimas semanas (${((baseline.longestRunM ?? 0) / 1000).toFixed(1)} km) `
        + `até aos ${km} km: **${draft.weeks} semanas**, três sessões por semana.`
      : `Não tenho corridas tuas registadas, por isso começo do princípio — corrida e `
        + `caminhada alternadas nas primeiras semanas — até aos ${km} km: **${draft.weeks} semanas**.`),
    { kind: 'list', items: [
      'Duas sessões curtas e uma mais longa por semana.',
      'A subida semanal está travada em 10% — com um mínimo de 400 m enquanto as '
      + 'distâncias ainda são curtas, senão as primeiras semanas não saíam do sítio.',
      'Uma semana mais leve a cada quatro.',
    ] },
    caveat(
      'A regra dos 10% é prudência convencional, não um facto demonstrado: no ensaio de '
      + 'Buist (2008), um programa graduado não reduziu as lesões face ao habitual. Serve '
      + 'de travão para eu nunca subir depressa demais.',
    ),
    text('No fim de cada sessão pergunto-te como correu. Duas sessões difíceis seguidas e '
      + 'eu baixo; duas fáceis e subo — sempre dentro do mesmo limite.'),
    sources('buist-2008', 'who-2020'),
  ];

  return {
    blocks,
    actions: [{ kind: 'create_run_plan', label: `Criar plano de ${km} km`, draft }],
    followUps: ['Como está a minha evolução?', 'Sugere hábitos para correr melhor'],
  };
}

function performanceTurn(context: CoachContext): CoachTurn {
  const reading = readPerformance(
    context.sessions, context.workouts, context.activities, context.today,
  );
  return {
    blocks: [
      text('O que os teus registos mostram nas últimas seis semanas:'),
      {
        kind: 'metrics',
        items: [
          { label: 'Sessões/semana', value: `${reading.sessionsPerWeek}` },
          {
            label: 'Volume',
            value: { up: 'a subir', flat: 'estável', down: 'a descer', unknown: '—' }[reading.volumeTrend],
          },
          {
            label: 'Ritmo',
            value: { faster: 'melhor', flat: 'estável', slower: 'mais lento', unknown: '—' }[reading.paceTrend],
          },
          {
            label: 'Folgas (última semana)',
            value: reading.restDaysLastWeek == null ? '—' : `${reading.restDaysLastWeek}`,
          },
        ],
      },
      ...findingBlocks(reading.findings),
    ],
    actions: [],
    followUps: ['Este treino está equilibrado?', 'Tenho consumido pouca proteína?'],
  };
}

function nutritionTurn(context: CoachContext): CoachTurn {
  const weightKg = allowed(context, 'profile') ? context.profile?.weightKg ?? null : null;
  const reading = readNutrition(
    context.meals, context.foods, context.water, weightKg, context.today,
  );

  const blocks: CoachBlock[] = [
    text(`Li os últimos ${reading.daysTracked} dias do teu diário — `
      + `${reading.daysLogged} com registo.`),
    ...findingBlocks(reading.findings),
    notice('info',
      'Isto é leitura de dados, não aconselhamento nutricional. Para um plano alimentar '
      + 'a sério, um nutricionista vê coisas que eu não vejo.'),
  ];

  return {
    blocks,
    actions: [{ kind: 'open', label: 'Ver alimentação', path: '/alimentacao' }],
    followUps: ['Sugere hábitos para o meu objetivo', 'Como está a minha evolução?'],
  };
}

function habitsTurn(context: CoachContext): CoachTurn {
  const drafts = suggestHabits(context.goals, context.habits);
  if (drafts.length === 0) {
    return {
      blocks: [text('Já tens hábitos a cobrir aquilo que eu sugeriria. Se quiseres outra '
        + 'coisa, diz-me qual é o objetivo e eu proponho algo diferente.')],
      actions: [{ kind: 'open', label: 'Ver agenda', path: '/agenda' }],
      followUps: ['Quero melhorar a minha condição física'],
    };
  }

  return {
    blocks: [
      text('Pelos teus objetivos, sugiro estes:'),
      { kind: 'list', items: drafts.map((draft) => `**${draft.title}** — ${draft.rationale}`) },
      sources(...new Set(drafts.flatMap((draft) => draft.referenceIds))),
      notice('info', 'Só entram na agenda se disseres que sim.'),
    ],
    actions: [{ kind: 'create_habits', label: 'Adicionar à agenda', drafts }],
    followUps: ['Organiza a minha semana', 'Cria-me um treino de 45 minutos'],
  };
}

function organizeTurn(context: CoachContext, intent: CoachIntent): CoachTurn {
  const draft = proposeWeek(intent.perWeek, context.workouts, context.habits);
  const missing = missingPlans(intent.perWeek, context.workouts);

  const lines = draft.days.map((day) => {
    const labels = day.items
      .map((item) => (item.existing ? `${item.label} (já tinhas)` : item.label))
      .join(' · ');
    return `**${weekdayName(day.weekday)}** — ${labels}`;
  });

  const blocks: CoachBlock[] = [
    text('Uma proposta de semana. Nada disto muda até dizeres que sim.'),
    { kind: 'list', items: lines },
  ];
  if (missing > 0) {
    blocks.push(notice('caution',
      `Faltam ${missing} planos de treino para cobrir todos os dias propostos. Posso criar `
      + 'um se me disseres o que queres treinar e em quanto tempo.'));
  }
  if (draft.untouched.length > 0) {
    blocks.push(text('Fica como está:'));
    blocks.push({ kind: 'list', items: draft.untouched });
  }
  blocks.push(sources('who-2020', 'garber-2011'));

  return {
    blocks,
    actions: [{ kind: 'apply_week_plan', label: 'Aplicar proposta', draft }],
    followUps: ['Cria-me um treino de 45 minutos', 'Este treino está equilibrado?'],
  };
}

function capabilitiesTurn(context: CoachContext): CoachTurn {
  const on = (Object.keys(context.settings.categories) as AiDataCategory[])
    .filter((category) => context.settings.categories[category]);
  return {
    blocks: [
      text('Sou um treinador de regras: leio os teus dados, faço contas e proponho — não '
        + 'invento e não decido por ti.'),
      { kind: 'list', items: [
        'Criar treinos para o tempo que tiveres — força, HIIT, funcional, pilates, '
        + 'mobilidade, com ou sem equipamento.',
        'Avaliar volume, frequência, distribuição e descanso da tua semana.',
        'Montar um plano de corrida progressivo e adaptá-lo ao que sentires.',
        'Progressões de caminhada e bicicleta.',
        'Ler tendências de evolução, consistência e carga.',
        'Olhar para o diário alimentar e dizer o que dá — e o que não dá — para concluir.',
        'Sono, recuperação e alongamentos: o que a evidência diz e que hábitos criar.',
        'Dizer-te o que tens marcado para hoje.',
        'Sugerir hábitos e organizar a semana, sempre com confirmação.',
      ] },
      text('E se corrigires o pedido a meio — "mas só de superiores", "faz antes em casa" '
        + '— eu sigo a conversa em vez de recomeçar.'),
      text(on.length === 0
        ? 'Neste momento não tenho autorização para ler nada.'
        : `Agora posso ler: ${on.join(', ')}.`),
      notice('medical',
        'Não diagnostico, não prescrevo e não substituo um profissional. Dores, lesões, '
        + 'sintomas ou medicação são conversa para o teu médico ou fisioterapeuta.'),
    ],
    actions: [{ kind: 'open', label: 'Escolher o que posso ler', path: '/ia/dados' }],
    followUps: ['Cria-me um treino de 45 minutos', 'Quero conseguir correr 10 km'],
  };
}

/** Que dados é que cada pedido precisa de ler. */
const NEEDS: Record<string, AiDataCategory[]> = {
  create_workout: ['training'],
  evaluate_workout: ['training'],
  run_plan: ['activity'],
  activity_plan: ['activity'],
  performance: ['training', 'activity'],
  nutrition: ['nutrition'],
  habits: ['goals', 'habits'],
  organize_week: ['training', 'habits'],
  today: ['training', 'habits'],
  recovery: ['training'],
};

function withIntent(turn: CoachTurn, intent: CoachIntent): CoachTurn {
  return { ...turn, intent };
}

/** Uma resposta montada a partir de um tema, com o hábito a propor se houver. */
function fromTopic(answer: TopicAnswer, label = 'Adicionar à agenda'): CoachTurn {
  return {
    blocks: answer.habitDrafts.length > 0
      ? [...answer.blocks, notice('info', 'Só entra na agenda se disseres que sim.')]
      : answer.blocks,
    actions: answer.habitDrafts.length > 0
      ? [{ kind: 'create_habits', label, drafts: answer.habitDrafts }]
      : [],
    followUps: answer.followUps,
  };
}

/**
 * Responde.
 *
 * `previous` é a intenção da resposta anterior. Sem ela, "mas eu queria que
 * fosse só de superiores" não quer dizer nada; com ela, quer dizer tudo.
 */
export function respond(
  context: CoachContext,
  message: string,
  previous: CoachIntent | null = null,
): CoachTurn {
  // Segurança primeiro, sempre: nem sequer se olha para a intenção.
  const verdict = screen(message);
  if (verdict.level !== 'none') {
    return { blocks: [notice('medical', verdict.message)], actions: [], followUps: [] };
  }

  const intent = refine(previous, parseIntent(message));

  if (!context.settings.enabled) {
    return {
      blocks: [notice('info',
        'O assistente está desligado, por isso não leio nada dos teus dados. Podes ligá-lo '
        + 'e escolher exatamente o que fica acessível.')],
      actions: [{ kind: 'open', label: 'Ligar e escolher', path: '/ia/dados' }],
      followUps: [],
    };
  }

  const needs = NEEDS[intent.kind] ?? [];
  const missing = needs.filter((category) => !context.settings.categories[category]);
  if (missing.length > 0) return withIntent(consentTurn(missing), intent);

  return withIntent(route(context, intent), intent);
}

function route(context: CoachContext, intent: CoachIntent): CoachTurn {
  switch (intent.kind) {
    case 'create_workout': return createWorkoutTurn(context, intent);
    case 'stretching': return createWorkoutTurn(context, { ...intent, workoutType: 'mobility' });
    case 'evaluate_workout': return evaluateTurn(context);
    case 'run_plan': return runPlanTurn(context, intent);
    case 'performance': return performanceTurn(context);
    case 'nutrition': return nutritionTurn(context);
    case 'habits': return habitsTurn(context);
    case 'organize_week': return organizeTurn(context, intent);
    case 'capabilities': return capabilitiesTurn(context);

    case 'sleep':
      return fromTopic(sleepAnswer(context.sleep != null), 'Criar hábitos de sono');

    case 'recovery': {
      const reading = readPerformance(
        context.sessions, context.workouts, context.activities, context.today,
      );
      const rpes = context.sessions
        .map((session) => session.perceivedEffort)
        .filter((value): value is number => value != null);
      const avgRpe = rpes.length
        ? Math.round((rpes.reduce((sum, value) => sum + value, 0) / rpes.length) * 10) / 10
        : null;
      return fromTopic(recoveryAnswer(reading.restDaysLastWeek, avgRpe));
    }

    case 'activity_plan':
      return fromTopic(
        activityAnswer(weeklyActivityMinutes(context.activities, context.today)),
        'Adicionar caminhada à agenda',
      );

    case 'meal_ideas':
      return fromTopic(mealIdeasAnswer(), 'Criar o hábito de registar');

    case 'today':
      return fromTopic(todayAnswer({
        today: context.today,
        workouts: context.workouts,
        habits: context.habits,
        tasks: [],
        nextRun: nextRunSession(context),
      }));

    default:
      return helpfulFallback(intent);
  }
}

function nextRunSession(context: CoachContext): { date: string; label: string } | null {
  const plan = context.runPlan;
  if (!plan) return null;
  const next = plan.sessions.find((session) => session.status === 'planned');
  if (!next) return null;
  const label = next.targetDistanceM
    ? `${(next.targetDistanceM / 1000).toFixed(1).replace('.0', '')} km`
    : 'corrida e caminhada';
  return { date: next.date, label };
}

/**
 * Quando a leitura não chega.
 *
 * Nunca um beco. A mensagem trouxe alguma coisa — um músculo, um tempo, uma
 * palavra de um tema — e é a partir daí que se oferece o passo seguinte. Só
 * quando não trouxe mesmo nada é que se pergunta, e mesmo aí com caminhos à
 * frente em vez de um "não percebi" seco.
 */
function helpfulFallback(intent: CoachIntent): CoachTurn {
  const hints: string[] = [];
  if (intent.muscles.length > 0) hints.push('um treino para esses grupos');
  if (intent.minutes != null) hints.push(`uma sessão de ${intent.minutes} minutos`);
  if (intent.distanceM != null) hints.push('um plano de corrida');

  if (hints.length > 0) {
    return {
      blocks: [text(`Não tenho a certeza do que querias, mas dá para fazer ${hints.join(' ou ')}. `
        + 'Diz-me qual e eu monto.')],
      actions: [],
      followUps: [
        `Cria-me um treino de ${intent.minutes ?? 45} minutos`,
        intent.distanceM != null
          ? `Quero conseguir correr ${Math.round(intent.distanceM / 1000)} km`
          : 'Quero conseguir correr 5 km',
        'Organiza a minha semana',
      ],
    };
  }

  return {
    blocks: [
      text('Não apanhei o pedido. Consigo ajudar com treino, corrida, caminhada, '
        + 'alimentação, hábitos, sono, recuperação e a organização da semana — diz-me o '
        + 'tema e eu trato do resto.'),
    ],
    actions: [],
    followUps: [
      'O que faço hoje?',
      'Cria-me um treino de 45 minutos',
      'Quero conseguir correr 5 km',
      'Sinto-me cansado, o que faço?',
      'Sugere ideias de refeições',
      'Como durmo melhor?',
    ],
  };
}
