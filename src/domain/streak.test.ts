import { describe, expect, it } from 'vitest';
import { createHabit, createHabitEntry, createTask, createWorkoutSession } from '../core/factories';
import { addDaysToKey } from '../core/utils/date';
import type { ProgressDataset } from './progress';
import { historyStart, streakStats } from './streak';

const TODAY = '2026-08-30';

function dataset(overrides: Partial<ProgressDataset> = {}): ProgressDataset {
  return {
    habits: [], habitEntries: [], tasks: [], workouts: [], workoutSessions: [],
    activitySessions: [], meals: [], foods: [], ...overrides,
  };
}

/** One essential daily habit, ticked on the given days. */
function withHabitOn(dates: string[], startDate = '2026-08-01'): ProgressDataset {
  return dataset({
    habits: [createHabit({ id: 'h1', essential: true, frequency: 'daily', startDate })],
    habitEntries: dates.map((date) => createHabitEntry({ habitId: 'h1', date, completed: true })),
  });
}

describe('streakStats — current', () => {
  it('counts consecutive perfect days ending today', () => {
    const data = withHabitOn(['2026-08-28', '2026-08-29', TODAY]);
    expect(streakStats(data, '2026-08-01', TODAY).current).toBe(3);
  });

  it('does not break because today is still unfinished', () => {
    const data = withHabitOn(['2026-08-28', '2026-08-29']);
    expect(streakStats(data, '2026-08-01', TODAY).current).toBe(2);
  });

  it('breaks on a missed day that had essentials', () => {
    const data = withHabitOn(['2026-08-26', '2026-08-29', TODAY]);
    // 27 and 28 were expected and missed, so only 29 + 30 survive.
    expect(streakStats(data, '2026-08-01', TODAY).current).toBe(2);
  });

  it('is zero with nothing behind it', () => {
    expect(streakStats(dataset(), '2026-08-01', TODAY).current).toBe(0);
  });
});

describe('streakStats — neutral days', () => {
  it('does not break a run on a day with no essentials scheduled', () => {
    // Weekday-only habit: the weekend is neutral, not a failure.
    const data = dataset({
      habits: [createHabit({
        id: 'h1', essential: true, frequency: 'weekdays', startDate: '2026-08-01',
      })],
      habitEntries: ['2026-08-26', '2026-08-27', '2026-08-28'].map((date) =>
        createHabitEntry({ habitId: 'h1', date, completed: true })),
    });
    // 29 (Sat) and 30 (Sun) are neutral; the Wed–Fri run stays intact.
    const stats = streakStats(data, '2026-08-01', TODAY);
    expect(stats.current).toBe(3);
  });

  it('leaves neutral days out of the consistency denominator', () => {
    const data = dataset({
      habits: [createHabit({
        id: 'h1', essential: true, frequency: 'custom', weekdays: [1],
        startDate: '2026-08-24',
      })],
      habitEntries: [createHabitEntry({ habitId: 'h1', date: '2026-08-24', completed: true })],
    });
    const stats = streakStats(data, '2026-08-24', TODAY);
    // Only one Monday in the window, and it was perfect.
    expect(stats.qualifyingDays).toBe(1);
    expect(stats.perfectDays).toBe(1);
    expect(stats.consistency).toBe(1);
  });
});

describe('streakStats — best, perfect days and consistency', () => {
  it('remembers the longest run even after it breaks', () => {
    const data = withHabitOn([
      '2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23', // run of 4
      '2026-08-29', TODAY,                                     // current run of 2
    ]);
    const stats = streakStats(data, '2026-08-01', TODAY);
    expect(stats.best).toBe(4);
    expect(stats.current).toBe(2);
    expect(stats.perfectDays).toBe(6);
  });

  it('reports consistency as perfect days over days that had essentials', () => {
    const data = withHabitOn(['2026-08-28', '2026-08-29', TODAY], '2026-08-26');
    // Essentials existed on 26..30 (5 days); 3 of them were perfect.
    const stats = streakStats(data, '2026-08-26', TODAY);
    expect(stats.qualifyingDays).toBe(5);
    expect(stats.perfectDays).toBe(3);
    expect(stats.consistency).toBe(0.6);
  });

  it('is all zeroes when nothing was ever essential', () => {
    const data = dataset({
      habits: [createHabit({ id: 'h1', essential: false, startDate: '2026-08-01' })],
    });
    expect(streakStats(data, '2026-08-01', TODAY)).toEqual({
      current: 0, best: 0, perfectDays: 0, consistency: 0, qualifyingDays: 0,
    });
  });
});

describe('streakStats — mixed essentials', () => {
  it('requires every kind of essential to be done', () => {
    const base = {
      habits: [createHabit({ id: 'h1', essential: true, startDate: TODAY })],
      habitEntries: [createHabitEntry({ habitId: 'h1', date: TODAY, completed: true })],
    };

    // Habit done, essential task still open.
    const withOpenTask = dataset({
      ...base,
      tasks: [createTask({ id: 't1', date: TODAY, essential: true })],
    });
    expect(streakStats(withOpenTask, TODAY, TODAY).perfectDays).toBe(0);

    // Same day with the task done.
    const withDoneTask = dataset({
      ...base,
      tasks: [createTask({ id: 't1', date: TODAY, essential: true, status: 'done' })],
    });
    expect(streakStats(withDoneTask, TODAY, TODAY).perfectDays).toBe(1);
  });

  it('ignores a non-essential task left undone', () => {
    const data = dataset({
      habits: [createHabit({ id: 'h1', essential: true, startDate: TODAY })],
      habitEntries: [createHabitEntry({ habitId: 'h1', date: TODAY, completed: true })],
      tasks: [createTask({ id: 't1', title: 'Responder a email', date: TODAY })],
    });
    expect(streakStats(data, TODAY, TODAY).current).toBe(1);
  });

  it('counts an essential workout session', () => {
    const open = dataset({
      workoutSessions: [createWorkoutSession({ date: TODAY, essential: true })],
    });
    expect(streakStats(open, TODAY, TODAY).perfectDays).toBe(0);

    const done = dataset({
      workoutSessions: [
        createWorkoutSession({ date: TODAY, essential: true, completed: true }),
      ],
    });
    expect(streakStats(done, TODAY, TODAY).perfectDays).toBe(1);
  });
});

describe('historyStart', () => {
  it('never looks back further than the cap', () => {
    expect(historyStart('2000-01-01', TODAY)).toBe(addDaysToKey(TODAY, -730));
  });

  it('starts at the account creation date when it is recent', () => {
    expect(historyStart('2026-08-01', TODAY)).toBe('2026-08-01');
  });
});
