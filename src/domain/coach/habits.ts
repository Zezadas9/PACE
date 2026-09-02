/**
 * PACE — hábitos que servem o objetivo de quem os vai fazer.
 *
 * Cada sugestão traz o motivo e, quando existe, a fonte. As que não têm fonte
 * dizem-no: "mobilidade diária faz-te bem" é uma opinião razoável, não uma
 * conclusão de literatura, e misturar as duas coisas seria o princípio de
 * inventar evidência.
 *
 * Nada é criado aqui. Isto devolve rascunhos; quem os aceita é o utilizador.
 */

import type { Goal, GoalType, Habit } from '../../core/types';
import type { HabitDraft } from './types';

interface Suggestion extends HabitDraft {
  /** Objetivos a que esta sugestão responde; vazio = serve qualquer um. */
  forGoals: GoalType[];
}

const CATALOG: Suggestion[] = [
  {
    title: 'Caminhar 30 minutos',
    kind: 'duration',
    frequency: 'daily',
    weekdays: [],
    target: 30,
    unit: 'min',
    timeOfDay: '18:00',
    durationMin: 30,
    essential: true,
    rationale:
      'Meia hora por dia coloca-te dentro dos 150 minutos semanais de atividade moderada '
      + 'que a OMS recomenda, sem precisar de ginásio nem de equipamento.',
    referenceIds: ['who-2020'],
    forGoals: ['improve_fitness', 'lose_weight', 'consistency', 'maintain_weight', 'build_habits'],
  },
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
    rationale:
      'O consenso da Academia Americana de Medicina do Sono aponta sete ou mais horas por '
      + 'noite para adultos. É o hábito com mais efeito sobre a recuperação e o mais fácil '
      + 'de sacrificar sem dar por isso.',
    referenceIds: ['watson-2015'],
    forGoals: ['improve_fitness', 'gain_muscle', 'consistency', 'build_habits'],
  },
  {
    title: 'Beber água ao longo do dia',
    kind: 'count',
    frequency: 'daily',
    weekdays: [],
    target: 8,
    unit: 'copos',
    timeOfDay: null,
    durationMin: null,
    essential: false,
    rationale:
      'A EFSA aponta cerca de 2,0 a 2,5 L de água total por dia, contando a que vem dos '
      + 'alimentos. Oito copos é uma forma prática de acompanhar, não um número mágico.',
    referenceIds: ['efsa-2010'],
    forGoals: ['improve_fitness', 'lose_weight', 'eat_better', 'build_habits'],
  },
  {
    title: 'Mobilidade de 10 minutos',
    kind: 'duration',
    frequency: 'custom',
    weekdays: [1, 3, 5],
    target: 10,
    unit: 'min',
    timeOfDay: '08:00',
    durationMin: 10,
    essential: false,
    rationale:
      'Dez minutos de mobilidade em dias alternados. Convém ser claro: é uma escolha '
      + 'prática pela consistência, não uma recomendação com evidência forte por trás.',
    referenceIds: [],
    forGoals: ['improve_fitness', 'gain_muscle', 'consistency'],
  },
  {
    title: 'Reforço muscular duas vezes por semana',
    kind: 'check',
    frequency: 'custom',
    weekdays: [2, 5],
    target: 1,
    unit: null,
    timeOfDay: '19:00',
    durationMin: 45,
    essential: true,
    rationale:
      'A OMS recomenda trabalho de reforço muscular em dois ou mais dias por semana, '
      + 'para além da atividade aeróbia.',
    referenceIds: ['who-2020', 'schoenfeld-2016-frequencia'],
    forGoals: ['gain_muscle', 'improve_fitness', 'lose_weight', 'maintain_weight'],
  },
  {
    title: 'Registar as refeições',
    kind: 'check',
    frequency: 'daily',
    weekdays: [],
    target: 1,
    unit: null,
    timeOfDay: '21:00',
    durationMin: null,
    essential: false,
    rationale:
      'Sem registo não há leitura possível — nem minha, nem tua. É o hábito que torna '
      + 'todos os outros mensuráveis.',
    referenceIds: [],
    forGoals: ['eat_better', 'lose_weight', 'gain_muscle', 'consistency'],
  },
];

/**
 * As sugestões que fazem sentido para estes objetivos e que ainda não existem.
 *
 * A comparação com o que já existe é por título aproximado: sugerir "caminhar
 * 30 minutos" a quem já tem esse hábito é a forma mais rápida de o assistente
 * parecer que não está a ver nada.
 */
export function suggestHabits(
  goals: Goal[],
  existing: Habit[],
  limit = 4,
): HabitDraft[] {
  const active = goals.filter((goal) => goal.active).map((goal) => goal.type);
  const current = existing
    .filter((habit) => !habit.archived)
    .map((habit) => normalize(habit.title));

  const scored = CATALOG
    .map((suggestion) => ({
      suggestion,
      score: suggestion.forGoals.filter((goal) => active.includes(goal)).length,
    }))
    .filter((entry) => active.length === 0 || entry.score > 0)
    .filter((entry) => !current.some((title) => overlaps(title, normalize(entry.suggestion.title))))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ suggestion }) => {
    const { forGoals: _forGoals, ...draft } = suggestion;
    return draft;
  });
}

function normalize(title: string): string {
  return title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Duas palavras significativas em comum chegam para ser o mesmo hábito. */
function overlaps(a: string, b: string): boolean {
  const words = (value: string): string[] =>
    value.split(/\s+/).filter((word) => word.length > 3);
  const left = new Set(words(a));
  const shared = words(b).filter((word) => left.has(word));
  return shared.length >= 2 || a === b;
}
