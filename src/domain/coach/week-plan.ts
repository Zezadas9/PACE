/**
 * PACE — "quero treinar 4 vezes por semana, correr 2 e caminhar todos os dias".
 *
 * Isto devolve uma **proposta**. Nada é aplicado, nada é reagendado por
 * iniciativa própria e o que já está marcado aparece na lista do que fica
 * intocado — é a diferença entre um assistente e uma coisa que mexe na agenda
 * de alguém sem avisar.
 */

import type { Habit, Workout } from '../../core/types';
import type { HabitDraft, WeekPlanDraft } from './types';
import { LIMITS } from './safety';

export interface WeekRequest {
  workouts: number | null;
  runs: number | null;
  walksDaily: boolean;
}

const WEEKDAY_NAMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** Dias preferidos por número de sessões, com folga entre eles. */
const SPREAD: Record<number, number[]> = {
  1: [3],
  2: [2, 5],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
};

function spreadFor(count: number): number[] {
  return SPREAD[Math.min(6, Math.max(1, count))] ?? SPREAD[3]!;
}

/** Dias livres para correr: longe dos dias de treino, se der. */
function runDays(count: number, busy: number[]): number[] {
  const free = [2, 4, 0, 6, 3, 1, 5].filter((day) => !busy.includes(day));
  const chosen = free.slice(0, count);
  // Se não houver dias livres suficientes, empilha nos que sobram — mas nunca
  // além do limite de sessões de corrida por semana.
  const rest = [0, 2, 4, 6, 1, 3, 5].filter((day) => !chosen.includes(day));
  while (chosen.length < Math.min(count, LIMITS.maxRunSessionsPerWeek) && rest.length > 0) {
    chosen.push(rest.shift()!);
  }
  return chosen.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
}

export function proposeWeek(
  request: WeekRequest,
  workouts: Workout[],
  habits: Habit[],
): WeekPlanDraft {
  const plans = workouts.filter((workout) => !workout.archived);
  const wanted = request.workouts ?? plans.filter((plan) => plan.weekdays.length > 0).length;
  const trainingDays = spreadFor(wanted || 3);

  /* Os dias são repartidos pelos planos existentes, à vez: quatro dias e dois
     planos dão dois dias a cada um, e não dois dias sem treino nenhum. Não se
     criam planos novos — se faltarem, a proposta diz isso em vez de inventar. */
  const assignments = plans.length === 0 ? [] : plans.map((plan, index) => ({
    workoutId: plan.id,
    title: plan.title,
    weekdays: trainingDays.filter((_, position) => position % plans.length === index),
  })).filter((assignment) => assignment.weekdays.length > 0);

  const runCount = Math.min(request.runs ?? 0, LIMITS.maxRunSessionsPerWeek);
  const chosenRunDays = runCount > 0 ? runDays(runCount, trainingDays) : [];

  const existingTitles = habits
    .filter((habit) => !habit.archived)
    .map((habit) => habit.title.toLowerCase());
  const isNew = (title: string): boolean =>
    !existingTitles.some((existing) => existing === title.toLowerCase());

  const habitDrafts: HabitDraft[] = [];
  if (runCount > 0 && isNew('Correr')) {
    habitDrafts.push({
      title: 'Correr',
      kind: 'check',
      frequency: 'custom',
      weekdays: chosenRunDays,
      target: 1,
      unit: null,
      timeOfDay: '18:30',
      durationMin: 40,
      essential: false,
      rationale: `${runCount} corridas por semana, nos dias sem treino de força.`,
      referenceIds: ['who-2020'],
    });
  }
  if (request.walksDaily && isNew('Caminhar 30 minutos')) {
    habitDrafts.push({
      title: 'Caminhar 30 minutos',
      kind: 'duration',
      frequency: 'daily',
      weekdays: [],
      target: 30,
      unit: 'min',
      timeOfDay: '13:00',
      durationMin: 30,
      essential: false,
      rationale:
        'Caminhada diária, que soma para os 150 minutos semanais de atividade moderada.',
      referenceIds: ['who-2020'],
    });
  }

  const existingHabits = habits.filter((habit) => !habit.archived);
  const untouched: string[] = [
    ...plans
      .filter((plan) => plan.weekdays.length > 0)
      .map((plan) => `${plan.title} — ${describeDays(plan.weekdays)}`),
    ...existingHabits
      .filter((habit) => habit.weekdays.length > 0 || habit.frequency === 'daily')
      .map((habit) => `${habit.title} — ${habit.frequency === 'daily' ? 'todos os dias' : describeDays(habit.weekdays)}`),
  ];

  const days = [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
    const items: WeekPlanDraft['days'][number]['items'] = [];

    const assigned = assignments.find((entry) => entry.weekdays.includes(weekday));
    if (assigned) items.push({ kind: 'workout', label: assigned.title, existing: false });
    if (chosenRunDays.includes(weekday)) {
      items.push({ kind: 'run', label: 'Correr', existing: false });
    }
    if (request.walksDaily) {
      items.push({ kind: 'walk', label: 'Caminhar 30 min', existing: false });
    }
    // Só os hábitos com dia marcado entram na grelha. Os diários já estão na
    // lista do que fica intocado, e repeti-los sete vezes tornava a proposta
    // ilegível.
    for (const habit of existingHabits) {
      if (habit.frequency === 'daily' || !habit.weekdays.includes(weekday)) continue;
      items.push({ kind: 'walk', label: habit.title, existing: true });
    }
    if (items.length === 0) items.push({ kind: 'rest', label: 'Descanso', existing: false });

    return { weekday, items };
  });

  return { days, workoutAssignments: assignments, habitDrafts, untouched };
}

export function describeDays(weekdays: number[]): string {
  if (weekdays.length === 0) return 'sem dia marcado';
  if (weekdays.length === 7) return 'todos os dias';
  return weekdays
    .slice()
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((day) => WEEKDAY_NAMES[day]?.slice(0, 3) ?? '')
    .join(', ');
}

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? '';
}

/** Quantos planos faltam para cobrir os dias propostos. */
export function missingPlans(request: WeekRequest, workouts: Workout[]): number {
  const wanted = request.workouts ?? 0;
  const available = workouts.filter((workout) => !workout.archived).length;
  return Math.max(0, wanted - available);
}
