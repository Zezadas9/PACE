import { describe, expect, it } from 'vitest';
import { createExercise, createWorkout, createWorkoutSession } from '../core/factories';
import type { SetLog, Workout, WorkoutBlock, WorkoutSession } from '../core/types';
import {
  elapsedSeconds, exerciseProgress, history, isBlockComplete, nextSet,
  plannedSets, sessionProgress, sessionReps, sessionVolumeKg, setsFor,
  trainedExercises, trainingStats, volumeApplies, weeklyFrequency, workoutsForDay,
} from './training';

function block(partial: Partial<WorkoutBlock> = {}): WorkoutBlock {
  return {
    id: 'b1', section: 'main', exerciseId: 'e1', sets: 3, reps: 10, loadKg: 50,
    durationSec: null, restSec: 90, note: null, ...partial,
  };
}

function workout(blocks: WorkoutBlock[], partial: Partial<Workout> = {}): Workout {
  return createWorkout({ id: 'w1', title: 'Treino A', type: 'strength', blocks, ...partial });
}

function done(count: number, load = 50, reps = 10): SetLog[] {
  return Array.from({ length: 3 }, (_, index) => ({
    setIndex: index, reps, loadKg: load, durationSec: null, rpe: null,
    completed: index < count,
  }));
}

describe('plannedSets and setsFor', () => {
  it('expands the plan into sets', () => {
    expect(plannedSets(block({ sets: 3 }))).toHaveLength(3);
    expect(plannedSets(block({ sets: 0 }))).toHaveLength(1);
  });

  it('pads logged sets out to the plan, so adding a set shows up mid-session', () => {
    const b = block({ sets: 4 });
    const session = createWorkoutSession({ logs: { b1: done(2) } });
    const sets = setsFor(session, b);
    expect(sets).toHaveLength(4);
    expect(sets.filter((set) => set.completed)).toHaveLength(2);
  });
});

describe('sessionProgress', () => {
  const plan = workout([block({ id: 'b1' }), block({ id: 'b2', exerciseId: 'e2' })]);

  it('counts sets and blocks', () => {
    const session = createWorkoutSession({ workoutId: 'w1', logs: { b1: done(3), b2: done(1) } });
    const progress = sessionProgress(session, plan);
    expect(progress.setsTotal).toBe(6);
    expect(progress.setsCompleted).toBe(4);
    expect(progress.blocksCompleted).toBe(1);
    expect(progress.ratio).toBe(0.67);
  });

  it('is zero for a session with no plan', () => {
    expect(sessionProgress(createWorkoutSession(), null).ratio).toBe(0);
  });
});

describe('nextSet', () => {
  const plan = workout([block({ id: 'b1' }), block({ id: 'b2', exerciseId: 'e2' })]);

  it('walks the plan in order', () => {
    const fresh = createWorkoutSession({ workoutId: 'w1' });
    expect(nextSet(fresh, plan)?.set.setIndex).toBe(0);
    expect(nextSet(fresh, plan)?.block.id).toBe('b1');

    const midway = createWorkoutSession({ workoutId: 'w1', logs: { b1: done(3) } });
    expect(nextSet(midway, plan)?.block.id).toBe('b2');
    expect(nextSet(midway, plan)?.blockIndex).toBe(1);
  });

  it('returns null once everything is done', () => {
    const finished = createWorkoutSession({
      workoutId: 'w1', logs: { b1: done(3), b2: done(3) },
    });
    expect(nextSet(finished, plan)).toBeNull();
  });
});

describe('volume', () => {
  it('counts completed sets only', () => {
    const plan = workout([block({ sets: 3, reps: 10, loadKg: 50 })]);
    const session = createWorkoutSession({ workoutId: 'w1', logs: { b1: done(2) } });
    expect(sessionVolumeKg(session, plan)).toBe(1000);
    expect(sessionReps(session, plan)).toBe(20);
  });

  it('ignores sets without a load, so bodyweight work does not inflate it', () => {
    const plan = workout([block({ loadKg: null })]);
    const session = createWorkoutSession({
      workoutId: 'w1',
      logs: {
        b1: [{ setIndex: 0, reps: 12, loadKg: null, durationSec: null, rpe: null, completed: true }],
      },
    });
    expect(sessionVolumeKg(session, plan)).toBe(0);
    expect(sessionReps(session, plan)).toBe(12);
  });

  it('only applies to load-bearing workout types', () => {
    expect(volumeApplies(workout([], { type: 'strength' }))).toBe(true);
    expect(volumeApplies(workout([], { type: 'calisthenics' }))).toBe(true);
    expect(volumeApplies(workout([], { type: 'mobility' }))).toBe(false);
    expect(volumeApplies(workout([], { type: 'pilates' }))).toBe(false);
    expect(volumeApplies(null)).toBe(false);
  });
});

describe('elapsedSeconds', () => {
  it('prefers the stored duration once the session is finished', () => {
    const session = createWorkoutSession({ durationSec: 2400, startedAt: '2026-08-30T10:00:00.000Z' });
    expect(elapsedSeconds(session, new Date('2026-08-30T18:00:00.000Z'))).toBe(2400);
  });

  it('measures from the clock while running', () => {
    const session = createWorkoutSession({ startedAt: '2026-08-30T10:00:00.000Z', durationSec: null });
    expect(elapsedSeconds(session, new Date('2026-08-30T10:45:30.000Z'))).toBe(2730);
  });

  it('is zero before the session starts', () => {
    expect(elapsedSeconds(createWorkoutSession({ startedAt: null }))).toBe(0);
  });
});

describe('history', () => {
  const plan = workout([block()]);

  it('lists completed sessions newest first', () => {
    const sessions: WorkoutSession[] = [
      createWorkoutSession({ id: 's1', workoutId: 'w1', date: '2026-08-24', completed: true }),
      createWorkoutSession({ id: 's2', workoutId: 'w1', date: '2026-08-28', completed: true }),
      createWorkoutSession({ id: 's3', workoutId: 'w1', date: '2026-08-30', completed: false }),
    ];
    const rows = history(sessions, [plan]);
    expect(rows.map((row) => row.session.id)).toEqual(['s2', 's1']);
    expect(rows[0]?.title).toBe('Treino A');
  });

  it('honours a limit', () => {
    const sessions = ['2026-08-20', '2026-08-22', '2026-08-24'].map((date, i) =>
      createWorkoutSession({ id: `s${i}`, workoutId: 'w1', date, completed: true }));
    expect(history(sessions, [plan], 2)).toHaveLength(2);
  });
});

describe('exerciseProgress', () => {
  const plan = workout([
    block({ id: 'b1', exerciseId: 'e1' }),
    block({ id: 'b2', exerciseId: 'e2' }),
  ]);

  it('tracks the heaviest set per day for one movement', () => {
    const sessions = [
      createWorkoutSession({
        id: 's1', workoutId: 'w1', date: '2026-08-24', completed: true,
        logs: { b1: done(3, 50, 10), b2: done(3, 80, 5) },
      }),
      createWorkoutSession({
        id: 's2', workoutId: 'w1', date: '2026-08-31', completed: true,
        logs: { b1: done(3, 55, 8) },
      }),
    ];

    const points = exerciseProgress('e1', sessions, [plan]);
    expect(points.map((p) => p.date)).toEqual(['2026-08-24', '2026-08-31']);
    expect(points[0]?.topLoadKg).toBe(50);
    expect(points[1]?.topLoadKg).toBe(55);
    expect(points[1]?.topReps).toBe(8);
    expect(points[0]?.volumeKg).toBe(1500);
    expect(points[0]?.totalReps).toBe(30);
  });

  it('ignores sessions that were never completed', () => {
    const sessions = [createWorkoutSession({
      workoutId: 'w1', date: '2026-08-24', completed: false, logs: { b1: done(3) },
    })];
    expect(exerciseProgress('e1', sessions, [plan])).toEqual([]);
  });
});

describe('trainedExercises', () => {
  it('lists movements actually completed, most recent first', () => {
    const plan = workout([
      block({ id: 'b1', exerciseId: 'e1' }),
      block({ id: 'b2', exerciseId: 'e2' }),
    ]);
    const exercises = [
      createExercise({ id: 'e1', name: 'Agachamento' }),
      createExercise({ id: 'e2', name: 'Supino' }),
    ];
    const sessions = [
      createWorkoutSession({
        workoutId: 'w1', date: '2026-08-24', completed: true,
        logs: { b1: done(3), b2: done(3) },
      }),
      createWorkoutSession({
        workoutId: 'w1', date: '2026-08-31', completed: true,
        // Only the first exercise was finished this time.
        logs: { b1: done(3), b2: done(1) },
      }),
    ];

    const rows = trainedExercises(sessions, [plan], exercises);
    expect(rows.map((row) => row.exercise.name)).toEqual(['Agachamento', 'Supino']);
    expect(rows[0]?.sessions).toBe(2);
    expect(rows[1]?.sessions).toBe(1);
  });
});

describe('weeklyFrequency', () => {
  it('buckets sessions into Monday-based weeks', () => {
    const sessions = [
      createWorkoutSession({ date: '2026-08-24', completed: true }),
      createWorkoutSession({ date: '2026-08-26', completed: true }),
      createWorkoutSession({ date: '2026-08-31', completed: true }),
      createWorkoutSession({ date: '2026-08-31', completed: false }),
    ];
    const bars = weeklyFrequency(sessions, 2, '2026-08-31');
    expect(bars).toHaveLength(2);
    expect(bars[0]).toEqual({ start: '2026-08-24', sessions: 2 });
    expect(bars[1]).toEqual({ start: '2026-08-31', sessions: 1 });
  });
});

describe('trainingStats', () => {
  const plan = workout([block({ sets: 3, reps: 10, loadKg: 50 })]);

  it('summarises volume, frequency and recency', () => {
    const sessions = [
      createWorkoutSession({
        workoutId: 'w1', date: '2026-08-28', completed: true,
        durationSec: 2700, logs: { b1: done(3) },
      }),
      createWorkoutSession({
        workoutId: 'w1', date: '2026-08-10', completed: true,
        durationSec: 1800, logs: { b1: done(3) },
      }),
    ];
    const stats = trainingStats(sessions, [plan], '2026-08-31');
    expect(stats.totalSessions).toBe(2);
    expect(stats.last7).toBe(1);
    expect(stats.last28).toBe(2);
    expect(stats.perWeek).toBe(0.5);
    expect(stats.totalVolumeKg).toBe(3000);
    expect(stats.totalDurationSec).toBe(4500);
    expect(stats.lastSession).toBe('2026-08-28');
    expect(stats.daysSinceLast).toBe(3);
  });

  it('is empty when nothing has been trained', () => {
    const stats = trainingStats([], [], '2026-08-31');
    expect(stats.totalSessions).toBe(0);
    expect(stats.lastSession).toBeNull();
    expect(stats.daysSinceLast).toBeNull();
  });
});

describe('isBlockComplete', () => {
  it('requires every set', () => {
    const b = block({ sets: 3 });
    expect(isBlockComplete(createWorkoutSession({ logs: { b1: done(3) } }), b)).toBe(true);
    expect(isBlockComplete(createWorkoutSession({ logs: { b1: done(2) } }), b)).toBe(false);
    expect(isBlockComplete(createWorkoutSession(), b)).toBe(false);
  });
});

describe('workoutsForDay', () => {
  const monWedFri = createWorkout({
    id: 'w1', title: 'Força', weekdays: [1, 3, 5], blocks: [block()],
  });
  const unscheduled = createWorkout({ id: 'w2', title: 'Extra', weekdays: [] });
  const archived = createWorkout({ id: 'w3', weekdays: [1], archived: true });

  it('returns the plans due on that weekday', () => {
    // 2026-08-31 is a Monday, 2026-09-01 a Tuesday.
    expect(workoutsForDay([monWedFri, unscheduled], '2026-08-31').map((w) => w.id))
      .toEqual(['w1']);
    expect(workoutsForDay([monWedFri, unscheduled], '2026-09-01')).toEqual([]);
  });

  it('leaves unscheduled plans alone', () => {
    // No weekdays means "start it deliberately", not "due every day".
    expect(workoutsForDay([unscheduled], '2026-08-31')).toEqual([]);
  });

  it('ignores archived plans', () => {
    expect(workoutsForDay([archived], '2026-08-31')).toEqual([]);
  });
});

describe('sections', () => {
  it('keeps blocks in their section', () => {
    const plan = createWorkout({
      blocks: [
        block({ id: 'b1', section: 'warmup' }),
        block({ id: 'b2', section: 'main' }),
        block({ id: 'b3', section: 'cardio' }),
      ],
    });
    expect(plan.blocks.map((b) => b.section)).toEqual(['warmup', 'main', 'cardio']);
  });

  it('walks the plan in order regardless of section', () => {
    const plan = createWorkout({
      id: 'w1',
      blocks: [block({ id: 'b1', section: 'warmup' }), block({ id: 'b2', section: 'main' })],
    });
    const session = createWorkoutSession({ workoutId: 'w1', logs: { b1: done(3) } });
    expect(nextSet(session, plan)?.block.section).toBe('main');
  });
});
