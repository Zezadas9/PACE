import { describe, expect, it } from 'vitest';
import {
  createHabit, createHabitEntry, createTask, createWorkout, createWorkoutSession,
} from '../core/factories';
import type { Habit } from '../core/types';
import {
  completionScore, dailyProgress, essentialsForDay, habitAppliesOn, habitRatio,
  rangeOverview, type ProgressDataset,
} from './progress';

function dataset(overrides: Partial<ProgressDataset> = {}): ProgressDataset {
  return {
    habits: [], habitEntries: [], tasks: [], workouts: [], workoutSessions: [],
    activitySessions: [], meals: [], foods: [], ...overrides,
  };
}

const MONDAY = '2026-08-24';
const SATURDAY = '2026-08-29';
const SUNDAY = '2026-08-30';

describe('habitAppliesOn', () => {
  it('honours the frequency', () => {
    expect(habitAppliesOn(createHabit({ frequency: 'daily', startDate: null }), SATURDAY)).toBe(true);

    const weekdays = createHabit({ frequency: 'weekdays', startDate: null });
    expect(habitAppliesOn(weekdays, MONDAY)).toBe(true);
    expect(habitAppliesOn(weekdays, SATURDAY)).toBe(false);

    const custom = createHabit({ frequency: 'custom', weekdays: [6], startDate: null });
    expect(habitAppliesOn(custom, SATURDAY)).toBe(true);
    expect(habitAppliesOn(custom, MONDAY)).toBe(false);
  });

  it('repeats every N days from the start date', () => {
    const every3 = createHabit({ frequency: 'interval', intervalDays: 3, startDate: MONDAY });
    expect(habitAppliesOn(every3, MONDAY)).toBe(true);
    expect(habitAppliesOn(every3, '2026-08-26')).toBe(false);
    expect(habitAppliesOn(every3, '2026-08-27')).toBe(true);
  });

  it('never applies before its start date', () => {
    const habit = createHabit({ frequency: 'daily', startDate: SUNDAY });
    expect(habitAppliesOn(habit, SATURDAY)).toBe(false);
    expect(habitAppliesOn(habit, SUNDAY)).toBe(true);
  });

  it('excludes archived habits', () => {
    expect(habitAppliesOn(createHabit({ archived: true, startDate: null }), MONDAY)).toBe(false);
  });
});

describe('habitRatio', () => {
  it('reports partial progress on a counted habit', () => {
    const habit = createHabit({ kind: 'count', target: 8 });
    expect(habitRatio(habit, null)).toBe(0);
    expect(habitRatio(habit, createHabitEntry({ value: 2 }))).toBe(0.25);
    expect(habitRatio(habit, createHabitEntry({ value: 8 }))).toBe(1);
    expect(habitRatio(habit, createHabitEntry({ value: 12 }))).toBe(1);
  });
});

describe('completionScore', () => {
  it('ignores categories that are empty, so a blank day is not a failed one', () => {
    expect(completionScore({
      habitsTotal: 0, habitsCompleted: 0, tasksTotal: 0, tasksCompleted: 0,
      workoutPlanned: false, workoutCompleted: false,
    })).toBe(0);

    expect(completionScore({
      habitsTotal: 4, habitsCompleted: 2, tasksTotal: 0, tasksCompleted: 0,
      workoutPlanned: false, workoutCompleted: false,
    })).toBe(0.5);
  });

  it('weights each present category equally', () => {
    expect(completionScore({
      habitsTotal: 4, habitsCompleted: 4, tasksTotal: 2, tasksCompleted: 0,
      workoutPlanned: true, workoutCompleted: true,
    })).toBe(0.67);
  });
});

describe('essentialsForDay', () => {
  it('collects only the items marked essential', () => {
    const habits: Habit[] = [
      createHabit({ id: 'h1', title: 'Água', essential: true, startDate: null }),
      createHabit({ id: 'h2', title: 'Ler', essential: false, startDate: null }),
    ];
    const workout = createWorkout({ id: 'w1', title: 'Corpo inteiro' });
    const data = dataset({
      habits,
      workouts: [workout],
      tasks: [
        createTask({ id: 't1', title: 'Treinar', date: SUNDAY, essential: true }),
        createTask({ id: 't2', title: 'Responder a email', date: SUNDAY, essential: false }),
      ],
      workoutSessions: [
        createWorkoutSession({ id: 's1', workoutId: 'w1', date: SUNDAY, essential: true }),
      ],
    });

    expect(essentialsForDay(data, SUNDAY).map((item) => item.title))
      .toEqual(['Água', 'Treinar', 'Corpo inteiro']);
  });

  it('leaves events out entirely', () => {
    expect(essentialsForDay(dataset(), SUNDAY)).toEqual([]);
  });
});

describe('dailyProgress', () => {
  it('counts habits, tasks and the planned workout', () => {
    const habits: Habit[] = [
      createHabit({ id: 'h1', frequency: 'daily', startDate: null }),
      createHabit({ id: 'h2', frequency: 'daily', kind: 'count', target: 8, startDate: null }),
    ];
    const data = dataset({
      habits,
      habitEntries: [
        createHabitEntry({ habitId: 'h1', date: SUNDAY, completed: true }),
        createHabitEntry({ habitId: 'h2', date: SUNDAY, value: 3 }),
      ],
      tasks: [createTask({ date: SUNDAY, status: 'done' }), createTask({ date: SUNDAY })],
      workoutSessions: [createWorkoutSession({ date: SUNDAY, completed: false })],
    });

    const result = dailyProgress(data, SUNDAY);
    expect(result.habitsCompleted).toBe(1);
    expect(result.habitsTotal).toBe(2);
    expect(result.tasksCompleted).toBe(1);
    expect(result.workoutPlanned).toBe(true);
    expect(result.score).toBe(0.33);
  });

  it('treats a count habit as done once it reaches its target', () => {
    const data = dataset({
      habits: [createHabit({ id: 'h1', kind: 'count', target: 8, startDate: null })],
      habitEntries: [createHabitEntry({ habitId: 'h1', date: SUNDAY, value: 8 })],
    });
    expect(dailyProgress(data, SUNDAY).habitsCompleted).toBe(1);
  });

  it('is a perfect day only when every essential is done', () => {
    const habits = [
      createHabit({ id: 'h1', essential: true, startDate: null }),
      createHabit({ id: 'h2', essential: false, startDate: null }),
    ];
    const base = { habits, tasks: [createTask({ id: 't1', date: SUNDAY, essential: false })] };

    // The ordinary habit and the ordinary task are both left undone.
    const done = dailyProgress(dataset({
      ...base,
      habitEntries: [createHabitEntry({ habitId: 'h1', date: SUNDAY, completed: true })],
    }), SUNDAY);
    expect(done.isPerfectDay).toBe(true);
    expect(done.essentialTotal).toBe(1);
    expect(done.score).toBeLessThan(1);

    expect(dailyProgress(dataset(base), SUNDAY).isPerfectDay).toBe(false);
  });

  it('is not perfect when nothing essential was scheduled', () => {
    const result = dailyProgress(dataset({
      habits: [createHabit({ id: 'h1', essential: false, startDate: null })],
      habitEntries: [createHabitEntry({ habitId: 'h1', date: SUNDAY, completed: true })],
    }), SUNDAY);
    expect(result.essentialTotal).toBe(0);
    expect(result.isPerfectDay).toBe(false);
    expect(result.score).toBe(1);
  });
});

describe('rangeOverview', () => {
  it('returns one summary per day, inclusive', () => {
    const days = rangeOverview(dataset(), '2026-08-24', '2026-08-30');
    expect(days).toHaveLength(7);
    expect(days[0]?.date).toBe('2026-08-24');
    expect(days[6]?.date).toBe('2026-08-30');
  });

  it('marks future days as future', () => {
    const future = rangeOverview(dataset(), '2099-01-01', '2099-01-03');
    expect(future.every((day) => day.state === 'future')).toBe(true);
  });
});
