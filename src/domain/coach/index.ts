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
import {
  formatMinutes, planWeek, readCommitments, readExisting, requestFromIntent,
  subtractExisting, summarize, WEEKDAY_NAMES, type SchedulePlan,
} from './agenda-plan';
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

/**
 * "Quero treinar 4 vezes, correr 2 e caminhar todos os dias."
 *
 * A resposta segue a ordem que faz sentido a quem lê: primeiro o que há de
 * livre, depois a proposta, depois o que fica intocado, e só no fim o resumo do
 * que vai ser criado. Nada acontece sem o toque de confirmação.
 */
function scheduleTurn(context: CoachContext, intent: CoachIntent): CoachTurn {
  const plans = context.workouts.filter((workout) => !workout.archived);
  const request = requestFromIntent(
    intent,
    plans[0]?.title ?? (intent.workoutType === 'strength' ? 'Musculação' : 'Treino'),
  );

  if (request.workouts === 0 && request.runs === 0 && !request.walksDaily && !request.water) {
    return {
      blocks: [text('Diz-me quantas vezes por semana queres cada coisa — por exemplo '
        + '"treinar 3 vezes, correr 2 e caminhar todos os dias" — e eu procuro espaço na '
        + 'tua agenda.')],
      actions: [],
      followUps: [
        'Quero treinar 4 vezes por semana e correr 2',
        'Quero começar a caminhar todos os dias',
      ],
    };
  }

  const commitments = readCommitments({
    habits: context.habits,
    workouts: context.workouts,
    events: [],
    tasks: [],
  });

  // O que já está feito não se propõe outra vez: quem já caminha todos os dias
  // não precisa de uma segunda caminhada diária.
  const cover = readExisting(context.habits, context.workouts);
  const falta = subtractExisting(request, cover);
  const plan = planWeek(falta, commitments);

  const nadaAFazer = plan.items.length === 0 && plan.unplaced.length === 0;
  if (nadaAFazer && cover.labels.length > 0) {
    return {
      blocks: [
        text('Isso já está tratado na tua agenda:'),
        { kind: 'list', items: cover.labels },
        text('Se quiseres mais do que isto, diz-me quantas vezes — por exemplo '
          + '"quero treinar 5 vezes por semana".'),
      ],
      actions: [{ kind: 'open', label: 'Ver agenda', path: '/agenda' }],
      followUps: ['Quero treinar mais uma vez por semana', 'Não consigo treinar à quarta'],
    };
  }

  const blocks: CoachBlock[] = [
    text('**Encontrei estes horários disponíveis.**'),
    { kind: 'list', items: freeSummary(plan) },
    text('E esta é a proposta:'),
    { kind: 'list', items: proposalLines(plan) },
  ];

  if (plan.untouched.length > 0) {
    blocks.push(text('Fica tudo como está — não apago nem mudo nada do que já tens:'));
    blocks.push({
      kind: 'list',
      items: [...new Set(plan.untouched.map(
        (item) => `${WEEKDAY_NAMES[item.weekday]}, ${formatMinutes(item.startMin)} — ${item.label}`,
      ))].slice(0, 6),
    });
  }

  if (plan.unplaced.length > 0) {
    blocks.push(notice('caution',
      `Não encontrei espaço para: ${plan.unplaced.slice(0, 4).join(', ')}. `
      + 'Diz-me o que posso trocar e eu proponho outra coisa.'));
  }

  if (cover.labels.length > 0) {
    blocks.push(text('Já tinhas, e não mexo: ' + cover.labels.join('; ') + '.'));
  }

  const summary = summarize(plan);
  if (summary.length > 0) {
    blocks.push(text(`Se confirmares, vou adicionar: **${summary.join(', ')}**.`));
  }
  blocks.push(sources('who-2020', 'garber-2011'));

  return {
    blocks,
    actions: [{
      kind: 'apply_schedule',
      label: 'Ver e confirmar',
      draft: {
        items: plan.items.map((item) => ({
          weekday: item.weekday,
          time: item.startMin == null ? null : formatMinutes(item.startMin),
          durationMin: item.durationMin,
          kind: item.kind,
          label: item.label,
        })),
        untouched: [...new Set(plan.untouched.map(
          (item) => `${WEEKDAY_NAMES[item.weekday]}, ${formatMinutes(item.startMin)} — ${item.label}`,
        ))],
        unplaced: plan.unplaced,
        summary,
      },
    }],
    followUps: ['Não consigo treinar à quarta', 'Quero correr de manhã'],
  };
}

/** As janelas livres, em linguagem de pessoa e sem encher o ecrã. */
function freeSummary(plan: SchedulePlan): string[] {
  return plan.windows
    .slice()
    .sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
    .map((day) => {
      const janelas = day.free
        .filter((window) => window.endMin - window.startMin >= 30)
        .slice(0, 3)
        .map((window) => `${formatMinutes(window.startMin)}–${formatMinutes(window.endMin)}`);
      return `**${WEEKDAY_NAMES[day.weekday]}**: ${janelas.length > 0 ? janelas.join(', ') : 'sem espaço livre'}`;
    });
}

function proposalLines(plan: SchedulePlan): string[] {
  return plan.items.map((item) => (item.startMin == null
    ? `**Todos os dias** — ${item.label}`
    : `**${WEEKDAY_NAMES[item.weekday]}** ${formatMinutes(item.startMin)} — ${item.label}`
      + (item.durationMin ? ` (${item.durationMin} min)` : '')));
}

/**
 * "Passa o treino de sexta para sábado."
 *
 * Mover um compromisso existente é a única coisa aqui que mexe no que já
 * estava, por isso é a que mais cuidado leva: identifica-se o plano em causa,
 * diz-se exatamente o que muda, e só se aplica com confirmação.
 */
function moveTurn(context: CoachContext, intent: CoachIntent): CoachTurn {
  const move = intent.move;
  if (!move) return helpfulFallback(intent);

  const candidato = context.workouts.find(
    (workout) => !workout.archived && workout.weekdays.includes(move.from),
  );

  if (!candidato) {
    return {
      blocks: [text(`Não tenho nenhum treino marcado para ${WEEKDAY_NAMES[move.from]}. `
        + 'Se quiseres, digo-te o que tens marcado na semana.')],
      actions: [{ kind: 'open', label: 'Ver treinos', path: '/treino' }],
      followUps: ['Organiza a minha semana'],
    };
  }

  const outros = candidato.weekdays
    .filter((day) => day !== move.from)
    .map((day) => WEEKDAY_NAMES[day]);

  return {
    blocks: [
      text(`**${candidato.title}** passa de ${WEEKDAY_NAMES[move.from]} para `
        + `${WEEKDAY_NAMES[move.to]}.`),
      ...(outros.length > 0
        ? [text(`Os outros dias deste plano ficam como estão: ${outros.join(', ')}.`)]
        : []),
      notice('info', 'Só muda depois de confirmares.'),
    ],
    actions: [{
      kind: 'move_workout',
      label: `Passar para ${WEEKDAY_NAMES[move.to]}`,
      workoutId: candidato.id,
      from: move.from,
      to: move.to,
    }],
    followUps: ['Organiza a minha semana', 'Este treino está equilibrado?'],
  };
}

/**
 * "Não consigo treinar à quarta."
 *
 * Não é um pedido para apagar nada: é uma restrição. Se houver treino nesse
 * dia, propõe-se movê-lo — com confirmação — para o dia livre mais próximo.
 */
function blockDayTurn(context: CoachContext, intent: CoachIntent): CoachTurn {
  const dia = intent.excludedWeekdays[0];
  if (dia == null) return helpfulFallback(intent);

  const afetados = context.workouts.filter(
    (workout) => !workout.archived && workout.weekdays.includes(dia),
  );

  if (afetados.length === 0) {
    return {
      blocks: [
        text(`Está anotado: ${WEEKDAY_NAMES[dia]} fica livre. Não tens nada de treino `
          + 'marcado nesse dia, por isso não há nada a mudar.'),
        text('Quando organizarmos a semana, não vou propor nada para esse dia.'),
      ],
      actions: [],
      followUps: ['Organiza a minha semana', 'Quero treinar 3 vezes por semana'],
    };
  }

  const alvo = candidateDay(context, dia);
  const plano = afetados[0]!;

  return {
    blocks: [
      text(`Tens **${plano.title}** marcado para ${WEEKDAY_NAMES[dia]}.`),
      text(alvo == null
        ? 'Não encontrei outro dia livre para o pôr. Diz-me qual preferes.'
        : `Posso passá-lo para ${WEEKDAY_NAMES[alvo]}, que é o dia livre mais próximo.`),
      notice('info', 'Nada muda sem tu confirmares.'),
    ],
    actions: alvo == null ? [] : [{
      kind: 'move_workout',
      label: `Passar para ${WEEKDAY_NAMES[alvo]}`,
      workoutId: plano.id,
      from: dia,
      to: alvo,
    }],
    followUps: ['Organiza a minha semana'],
  };
}

/** O dia mais próximo sem treino marcado, à frente do dia bloqueado. */
function candidateDay(context: CoachContext, blocked: number): number | null {
  const ocupados = new Set(
    context.workouts.filter((workout) => !workout.archived).flatMap((workout) => workout.weekdays),
  );
  for (let step = 1; step <= 6; step += 1) {
    const day = (blocked + step) % 7;
    if (!ocupados.has(day)) return day;
  }
  return null;
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
  move_session: ['training'],
  block_day: ['training'],
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
    case 'organize_week': return scheduleTurn(context, intent);
    case 'move_session': return moveTurn(context, intent);
    case 'block_day': return blockDayTurn(context, intent);
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
