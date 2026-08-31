/**
 * PACE — Demo content.
 *
 * Placeholder records so the dashboard has something to show before real
 * capture exists. Written once, right after onboarding, then owned by the user
 * like any other data. Delete this file when capture ships.
 */

import { createId } from '../core/utils/id';
import { addDaysToKey, todayKey } from '../core/utils/date';
import type { Repositories } from './repositories';

export function seed(repos: Repositories): void {
  const today = todayKey();
  const now = new Date().toISOString();

  const habits = [
    {
      title: 'Beber 2 L de água', kind: 'count' as const, target: 8, unit: 'copos',
      timeOfDay: null, essential: true,
    },
    {
      title: 'Caminhar 30 minutos', kind: 'duration' as const, target: 30, unit: 'min',
      timeOfDay: '18:00', essential: true, durationMin: 30,
    },
    {
      title: 'Ler 20 minutos', kind: 'duration' as const, target: 20, unit: 'min',
      timeOfDay: '21:30', essential: false,
    },
    {
      title: 'Alongamentos', kind: 'check' as const, target: 1, unit: null,
      timeOfDay: '08:00', essential: true,
    },
  ].map((habit) => repos.habits.create({ ...habit, frequency: 'daily', startDate: today }));

  // Two habits already done, so the ring is not at zero on day one.
  for (const index of [1, 3]) {
    const habit = habits[index]!;
    repos.habitEntries.create({
      habitId: habit.id,
      date: today,
      completed: true,
      // Full target, not 1: a duration habit shown as done must not also
      // read "1 / 30 min".
      value: habit.target,
      completedAt: now,
    });
  }

  repos.tasks.create({
    title: 'Planear a semana', date: today, time: '18:30',
    priority: 'normal', category: 'general', essential: true,
  });
  repos.tasks.create({
    title: 'Responder a emails', date: today, time: '20:00',
    priority: 'low', category: 'work', essential: false,
  });

  const plan = [
    { name: 'Agachamento', muscleGroups: ['legs' as const], equipment: 'barra',
      sets: 4, reps: 8, loadKg: 60, restSec: 120 },
    { name: 'Supino', muscleGroups: ['chest' as const], equipment: 'barra',
      sets: 3, reps: 10, loadKg: 40, restSec: 90 },
    { name: 'Remada curvada', muscleGroups: ['back' as const], equipment: 'barra',
      sets: 3, reps: 10, loadKg: 35, restSec: 90 },
    { name: 'Prancha', muscleGroups: ['core' as const], isBodyweight: true,
      sets: 3, reps: null, durationSec: 45, restSec: 60 },
  ];

  const workout = repos.workouts.create({
    title: 'Corpo inteiro A',
    type: 'strength',
    estimatedMin: 50,
    tags: ['Treino base de força, três vezes por semana.'],
    blocks: plan.map((item) => {
      const exercise = repos.exercises.create({
        name: item.name,
        muscleGroups: item.muscleGroups,
        equipment: item.equipment ?? null,
        isBodyweight: item.isBodyweight ?? false,
      });
      return {
        id: createId(),
        exerciseId: exercise.id,
        sets: item.sets,
        reps: item.reps ?? null,
        loadKg: item.loadKg ?? null,
        durationSec: item.durationSec ?? null,
        restSec: item.restSec,
        note: null,
      };
    }),
  });

  // A second plan, so the type picker and the plan list are not a list of one.
  repos.workouts.create({
    title: 'Mobilidade da manhã',
    type: 'mobility',
    estimatedMin: 15,
    tags: ['Rotina curta para começar o dia.'],
    blocks: ['Gato-camelo', 'Abertura de anca', 'Rotação torácica'].map((name) => ({
      id: createId(),
      exerciseId: repos.exercises.create({ name, isBodyweight: true }).id,
      sets: 2,
      reps: null,
      loadKg: null,
      durationSec: 40,
      restSec: 20,
      note: null,
    })),
  });

  repos.workoutSessions.create({
    workoutId: workout.id, date: today, completed: false, essential: true,
  });

  // A weekly recurring event and a one-off, so the agenda has something on more
  // than one day and the recurrence expansion is visible immediately.
  repos.events.create({
    title: 'Reunião de equipa',
    category: 'meeting',
    date: today,
    startTime: '10:00',
    endTime: '11:00',
    recurrence: { kind: 'weekly', interval: 1, weekdays: [1], until: null },
    reminder: { enabled: true, minutesBefore: 10 },
  });
  repos.events.create({
    title: 'Consulta médica',
    category: 'appointment',
    date: addDaysToKey(today, 3),
    startTime: '15:30',
    endTime: '16:15',
  });

  repos.activitySessions.create({
    type: 'walk', date: today, durationSec: 32 * 60, distanceM: 2800, calories: 145,
  });

  const foods = [
    { name: 'Aveia', kcalPer100g: 379, proteinPer100g: 13, carbsPer100g: 67, fatPer100g: 7 },
    { name: 'Iogurte natural', kcalPer100g: 61, proteinPer100g: 3.5, carbsPer100g: 4.7, fatPer100g: 3.3 },
    { name: 'Peito de frango', kcalPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6 },
    { name: 'Arroz cozido', kcalPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3 },
  ].map((food) => repos.foods.create(food));

  repos.meals.create({
    date: today, type: 'breakfast', time: '08:15',
    items: [
      { id: createId(), foodId: foods[0]!.id, quantityG: 60 },
      { id: createId(), foodId: foods[1]!.id, quantityG: 150 },
    ],
  });
  repos.meals.create({
    date: today, type: 'lunch', time: '13:00',
    items: [
      { id: createId(), foodId: foods[2]!.id, quantityG: 180 },
      { id: createId(), foodId: foods[3]!.id, quantityG: 200 },
    ],
  });

  repos.streaks.create({ kind: 'daily_completion', current: 0, longest: 0, lastDate: null });
}
