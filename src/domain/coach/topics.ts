/**
 * PACE — os temas que não são treino nem números.
 *
 * Sono, alongamentos, recuperação, caminhada, o dia de hoje, ideias de
 * refeições. São perguntas legítimas de quem usa a aplicação, e um assistente
 * que só sabe montar treinos e ler gráficos manda a pessoa embora exatamente
 * quando ela precisa de uma resposta simples.
 *
 * O que aqui não muda: o que não se sabe é dito, e o que não tem evidência
 * forte por trás é marcado como tal.
 */

import type { DayKey, Habit, Task, Workout } from '../../core/types';
import { addDaysToKey } from '../../core/utils/date';
import type { CoachBlock, HabitDraft } from './types';
import { caveat, notice, sources, text } from './types';

export interface TopicAnswer {
  blocks: CoachBlock[];
  habitDrafts: HabitDraft[];
  followUps: string[];
}

/* --- Sono ------------------------------------------------------------------------ */

export function sleepAnswer(hasSleepData: boolean): TopicAnswer {
  const blocks: CoachBlock[] = [
    text('Sobre sono posso dar-te o que a evidência diz e ajudar-te a criar o hábito — '
      + 'medir é que ainda não consigo.'),
    { kind: 'list', items: [
      '**Sete horas ou mais** por noite, para adultos, é o consenso da Academia Americana '
      + 'de Medicina do Sono.',
      '**Horas regulares** contam tanto como o total: deitar e levantar à mesma hora, '
      + 'incluindo ao fim de semana.',
      '**A recuperação do treino acontece aqui.** Se andas a dormir mal, isso explica mais '
      + 'sobre o teu cansaço do que qualquer detalhe do programa.',
    ] },
    sources('watson-2015'),
  ];

  if (!hasSleepData) {
    blocks.push(notice('info',
      'A PACE ainda não regista sono, por isso não sei quanto dormes. Quando houver '
      + 'ligação ao Health ou ao Health Connect, passo a ler — e a categoria já está no '
      + 'ecrã de autorizações à espera disso.'));
  }
  blocks.push(caveat(
    'Rotinas de higiene do sono — luz, ecrãs, cafeína à tarde — ajudam muita gente, mas o '
    + 'tamanho do efeito varia bastante de pessoa para pessoa. Trato-as como hábitos a '
    + 'testar, não como receita.',
  ));

  return {
    blocks,
    habitDrafts: [
      {
        title: 'Dormir sete horas',
        kind: 'check',
        frequency: 'daily',
        weekdays: [],
        target: 1,
        unit: null,
        timeOfDay: '23:00',
        durationMin: null,
        essential: true,
        rationale: 'Sete ou mais horas por noite, segundo o consenso da AASM e da SRS.',
        referenceIds: ['watson-2015'],
      },
      {
        title: 'Hora de deitar fixa',
        kind: 'check',
        frequency: 'daily',
        weekdays: [],
        target: 1,
        unit: null,
        timeOfDay: '22:45',
        durationMin: null,
        essential: false,
        rationale: 'A regularidade é a parte mais fácil de controlar e a primeira a cair.',
        referenceIds: ['watson-2015'],
      },
    ],
    followUps: ['Sinto-me cansado, o que faço?', 'Sugere hábitos para o meu objetivo'],
  };
}

/* --- Recuperação ------------------------------------------------------------------ */

export function recoveryAnswer(restDaysLastWeek: number | null, avgRpe: number | null): TopicAnswer {
  const blocks: CoachBlock[] = [
    text('O que consigo ver sobre recuperação, e o que não consigo:'),
    {
      kind: 'metrics',
      items: [
        {
          label: 'Folgas (última semana)',
          value: restDaysLastWeek == null ? '—' : String(restDaysLastWeek),
          note: restDaysLastWeek == null ? 'sem registos' : undefined,
        },
        {
          label: 'RPE médio',
          value: avgRpe == null ? '—' : String(avgRpe),
          note: avgRpe == null ? 'por registar' : undefined,
        },
        { label: 'Sono', value: '—', note: 'a PACE ainda não mede' },
        { label: 'FC repouso', value: '—', note: 'sem wearable ligado' },
      ],
    },
  ];

  if (restDaysLastWeek != null && restDaysLastWeek <= 1) {
    blocks.push(text('Treinaste quase todos os dias da última semana. O estímulo é o treino; '
      + 'a adaptação acontece no descanso — um ou dois dias mais leves não são tempo perdido.'));
  }
  blocks.push(text('O mais provável, por ordem: dormir pouco, subir carga depressa demais, '
    + 'comer abaixo do que gastas. Nenhuma destas eu consigo confirmar com o que tenho.'));
  blocks.push(notice('medical',
    'Se o cansaço for persistente, vier com dores, tonturas ou falta de ar, isso é conversa '
    + 'para o médico e não para mim.'));
  blocks.push(sources('watson-2015', 'foster-2001', 'garber-2011'));

  return {
    blocks,
    habitDrafts: [],
    followUps: ['Como está a minha evolução?', 'Cria-me um treino de mobilidade de 20 minutos'],
  };
}

/* --- Caminhar e pedalar ------------------------------------------------------------ */

export function activityAnswer(weeklyMinutes: number | null): TopicAnswer {
  const target = 150;
  const blocks: CoachBlock[] = [
    text(weeklyMinutes == null
      ? 'Não tenho atividades registadas para saber onde estás, por isso parto do princípio.'
      : `Nas últimas semanas fizeste cerca de **${weeklyMinutes} minutos** de atividade por semana.`),
    text(`A referência da OMS para adultos são 150 a 300 minutos de atividade moderada por `
      + `semana — caminhar a bom passo conta. ${weeklyMinutes != null && weeklyMinutes >= target
        ? 'Já lá estás; a partir daqui é manter.'
        : 'Trinta minutos por dia, cinco dias, chega lá.'}`),
    { kind: 'list', items: [
      'Começa pelo que já fazes e acrescenta dez minutos por semana.',
      'Ritmo moderado é aquele em que consegues falar mas não cantar.',
      'Duas caminhadas curtas contam tanto como uma longa.',
    ] },
    sources('who-2020'),
  ];

  return {
    blocks,
    habitDrafts: [{
      title: 'Caminhar 30 minutos',
      kind: 'duration',
      frequency: 'daily',
      weekdays: [],
      target: 30,
      unit: 'min',
      timeOfDay: '18:00',
      durationMin: 30,
      essential: false,
      rationale: 'Trinta minutos por dia colocam-te dentro da recomendação da OMS.',
      referenceIds: ['who-2020'],
    }],
    followUps: ['Quero conseguir correr 5 km', 'Organiza a minha semana'],
  };
}

/* --- Ideias de refeições ------------------------------------------------------------ */

/**
 * Estruturas, não ementas com números.
 *
 * A regra da secção de alimentação vale aqui inteira: não invento valores
 * nutricionais. Portanto isto sugere **como montar** uma refeição, e não quantas
 * calorias ela tem — porque isso dependeria de quantidades que ninguém me deu.
 */
export function mealIdeasAnswer(): TopicAnswer {
  return {
    blocks: [
      text('Não te dou ementas com números — não sei as quantidades e não invento valores. '
        + 'O que te posso dar é a estrutura que costuma resolver a maior parte das refeições:'),
      { kind: 'list', items: [
        '**Uma fonte de proteína** — ovos, peixe, carne, leguminosas, laticínios.',
        '**Um hidrato** que aguente o teu dia — arroz, massa, batata, pão, aveia.',
        '**Vegetais ou fruta**, de preferência os que realmente comes.',
        '**Gordura** que venha de comida, não de molho — azeite, frutos secos, abacate.',
      ] },
      text('Se registares os alimentos com os valores do rótulo, passo a conseguir dizer-te '
        + 'onde é que a tua semana fica curta.'),
      notice('info',
        'Isto não é um plano alimentar nem aconselhamento nutricional. Para um plano à tua '
        + 'medida — ainda mais se houver alguma condição de saúde — é com um nutricionista.'),
      sources('morton-2018'),
    ],
    habitDrafts: [{
      title: 'Registar as refeições',
      kind: 'check',
      frequency: 'daily',
      weekdays: [],
      target: 1,
      unit: null,
      timeOfDay: '21:00',
      durationMin: null,
      essential: false,
      rationale: 'Sem registo não há leitura possível — nem minha, nem tua.',
      referenceIds: [],
    }],
    followUps: ['Tenho consumido pouca proteína?', 'Sugere hábitos para o meu objetivo'],
  };
}

/* --- O dia de hoje ------------------------------------------------------------------- */

export interface TodayInput {
  today: DayKey;
  workouts: Workout[];
  habits: Habit[];
  tasks: Task[];
  nextRun: { date: DayKey; label: string } | null;
}

export function todayAnswer(input: TodayInput): TopicAnswer {
  const weekday = new Date(`${input.today}T12:00:00`).getDay();
  const planned = input.workouts.filter(
    (workout) => !workout.archived && workout.weekdays.includes(weekday),
  );
  const habits = input.habits.filter((habit) => !habit.archived && (
    habit.frequency === 'daily'
    || (habit.frequency === 'weekdays' && weekday >= 1 && weekday <= 5)
    || habit.weekdays.includes(weekday)
  ));
  const tasks = input.tasks.filter(
    (task) => task.date === input.today && task.status === 'open',
  );

  const items: string[] = [
    ...planned.map((workout) => `**${workout.title}** — treino marcado para hoje`),
    ...(input.nextRun && input.nextRun.date === input.today
      ? [`**${input.nextRun.label}** — sessão do plano de corrida`]
      : []),
    ...habits.slice(0, 5).map((habit) => `${habit.title}${habit.essential ? ' (essencial)' : ''}`),
    ...tasks.slice(0, 4).map((task) => `${task.title} — tarefa`),
  ];

  const nothing = items.length === 0;
  return {
    blocks: [
      text(nothing
        ? 'Hoje não tens nada marcado. Se te apetecer mexer, meia hora de caminhada ou uma '
          + 'sessão curta de mobilidade são a forma mais barata de não perder o ritmo.'
        : 'O que tens marcado para hoje:'),
      ...(nothing ? [] : [{ kind: 'list' as const, items }]),
      ...(input.nextRun && input.nextRun.date !== input.today
        ? [text(`A próxima corrida do plano é a ${formatDay(input.nextRun.date)}: ${input.nextRun.label}.`)]
        : []),
    ],
    habitDrafts: [],
    followUps: nothing
      ? ['Cria-me um treino de 30 minutos', 'Organiza a minha semana']
      : ['Este treino está equilibrado?', 'Como está a minha evolução?'],
  };
}

function formatDay(date: DayKey): string {
  const parts = date.split('-');
  return `${parts[2]}/${parts[1]}`;
}

/** Minutos de atividade por semana nas últimas seis, quando há registos. */
export function weeklyActivityMinutes(
  sessions: Array<{ date: DayKey; durationSec: number | null }>,
  today: DayKey,
): number | null {
  const since = addDaysToKey(today, -42);
  const recent = sessions.filter((session) => session.date >= since && session.durationSec);
  if (recent.length === 0) return null;
  const total = recent.reduce((sum, session) => sum + (session.durationSec ?? 0), 0);
  return Math.round(total / 60 / 6);
}
