/**
 * PACE — Training.
 *
 * Pure arithmetic over workouts and sessions: how far through a session you
 * are, how much you lifted, how a lift has moved over time, and how often you
 * actually train.
 *
 * Nothing here knows about the screen or the store, which is what lets the
 * live session runner stay a thin shell over these numbers.
 */

import { LOAD_BEARING_TYPES } from '../core/constants';
import type {
  DayKey, Exercise, SetLog, Workout, WorkoutBlock, WorkoutSession,
} from '../core/types';
import { addDaysToKey, fromKey, startOfWeekKey, todayKey } from '../core/utils/date';
import { daysBetween } from './recurrence';

/* --- Sets ------------------------------------------------------------------ */

/** The planned set list for a block, before anything is logged. */
export function plannedSets(block: WorkoutBlock): SetLog[] {
  const count = Math.max(1, Math.floor(block.sets) || 1);
  return Array.from({ length: count }, (_, index) => ({
    setIndex: index,
    reps: block.reps,
    loadKg: block.loadKg,
    durationSec: block.durationSec,
    rpe: null,
    completed: false,
  }));
}

/**
 * The logged sets for a block, padded out to the plan.
 *
 * Padding rather than trusting the stored array means adding a set to a plan
 * shows up in an in-progress session instead of silently going missing.
 */
export function setsFor(session: WorkoutSession, block: WorkoutBlock): SetLog[] {
  const logged = session.logs[block.id] ?? [];
  const planned = plannedSets(block);
  return planned.map((fallback, index) => logged[index] ?? fallback);
}

export function isBlockComplete(session: WorkoutSession, block: WorkoutBlock): boolean {
  const sets = setsFor(session, block);
  return sets.length > 0 && sets.every((set) => set.completed);
}

/* --- Session progress ------------------------------------------------------ */

export interface SessionProgress {
  setsTotal: number;
  setsCompleted: number;
  blocksTotal: number;
  blocksCompleted: number;
  /** 0..1 by sets, which moves more smoothly than by exercise. */
  ratio: number;
}

export function sessionProgress(
  session: WorkoutSession,
  workout: Workout | null,
): SessionProgress {
  const blocks = workout?.blocks ?? [];
  let setsTotal = 0;
  let setsCompleted = 0;
  let blocksCompleted = 0;

  for (const block of blocks) {
    const sets = setsFor(session, block);
    setsTotal += sets.length;
    const done = sets.filter((set) => set.completed).length;
    setsCompleted += done;
    if (done === sets.length && sets.length > 0) blocksCompleted += 1;
  }

  return {
    setsTotal,
    setsCompleted,
    blocksTotal: blocks.length,
    blocksCompleted,
    ratio: setsTotal === 0 ? 0 : Math.round((setsCompleted / setsTotal) * 100) / 100,
  };
}

/**
 * The next set the user should be looking at: the first incomplete one, in
 * plan order. Returns null once the session is finished.
 */
export function nextSet(
  session: WorkoutSession,
  workout: Workout | null,
): { block: WorkoutBlock; blockIndex: number; set: SetLog } | null {
  const blocks = workout?.blocks ?? [];
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex]!;
    const sets = setsFor(session, block);
    const set = sets.find((candidate) => !candidate.completed);
    if (set) return { block, blockIndex, set };
  }
  return null;
}

/* --- Volume ---------------------------------------------------------------- */

/**
 * Tonnage: reps x load, over completed sets only.
 *
 * Only meaningful where load is the point. A mobility session or a football
 * match has no volume worth reporting, so `volumeApplies` gates the display
 * rather than showing an honest-looking zero.
 */
export function sessionVolumeKg(session: WorkoutSession, workout: Workout | null): number {
  const blocks = workout?.blocks ?? [];
  let total = 0;
  for (const block of blocks) {
    for (const set of setsFor(session, block)) {
      if (!set.completed) continue;
      if (set.loadKg == null || set.reps == null) continue;
      total += set.loadKg * set.reps;
    }
  }
  return Math.round(total);
}

export function volumeApplies(workout: Workout | null): boolean {
  if (!workout) return false;
  return LOAD_BEARING_TYPES.includes(workout.type);
}

/** Total completed repetitions, which is the counterpart for bodyweight work. */
export function sessionReps(session: WorkoutSession, workout: Workout | null): number {
  const blocks = workout?.blocks ?? [];
  let total = 0;
  for (const block of blocks) {
    for (const set of setsFor(session, block)) {
      if (set.completed && set.reps != null) total += set.reps;
    }
  }
  return total;
}

/** Elapsed seconds, from the stored duration or from the clock while running. */
export function elapsedSeconds(session: WorkoutSession, now: Date = new Date()): number {
  if (session.durationSec != null) return session.durationSec;
  if (!session.startedAt) return 0;
  const started = new Date(session.startedAt).getTime();
  return Math.max(0, Math.round((now.getTime() - started) / 1000));
}

/**
 * The plans scheduled for a given weekday.
 *
 * A plan with no weekdays is not scheduled at all — it exists to be started
 * deliberately, which is different from being due every day.
 */
export function workoutsForDay(workouts: Workout[], date: DayKey): Workout[] {
  const parsed = fromKey(date);
  if (!parsed) return [];
  const weekday = parsed.getDay();
  return workouts.filter(
    (workout) => !workout.archived && workout.weekdays.includes(weekday),
  );
}

/* --- History --------------------------------------------------------------- */

export interface SessionSummary {
  session: WorkoutSession;
  workout: Workout | null;
  title: string;
  durationSec: number;
  volumeKg: number;
  reps: number;
  progress: SessionProgress;
}

export function summarizeSession(
  session: WorkoutSession,
  workouts: Workout[],
): SessionSummary {
  const workout = workouts.find((candidate) => candidate.id === session.workoutId) ?? null;
  return {
    session,
    workout,
    title: workout?.title ?? 'Treino',
    durationSec: session.durationSec ?? 0,
    volumeKg: sessionVolumeKg(session, workout),
    reps: sessionReps(session, workout),
    progress: sessionProgress(session, workout),
  };
}

/** Completed sessions, newest first. */
export function history(
  sessions: WorkoutSession[],
  workouts: Workout[],
  limit?: number,
): SessionSummary[] {
  const done = sessions
    .filter((session) => session.completed)
    .sort((a, b) => (a.date === b.date
      ? (b.endedAt ?? '').localeCompare(a.endedAt ?? '')
      : b.date.localeCompare(a.date)));
  const sliced = limit == null ? done : done.slice(0, limit);
  return sliced.map((session) => summarizeSession(session, workouts));
}

export interface ExercisePoint {
  date: DayKey;
  /** Heaviest completed set that day. */
  topLoadKg: number | null;
  /** Reps performed at that load. */
  topReps: number | null;
  totalReps: number;
  volumeKg: number;
  sets: number;
}

/**
 * How one exercise has moved over time.
 *
 * Keyed on the exercise rather than the workout, because the same movement
 * appears in several plans and the progression is the movement's, not the
 * plan's.
 */
export function exerciseProgress(
  exerciseId: string,
  sessions: WorkoutSession[],
  workouts: Workout[],
): ExercisePoint[] {
  const points = new Map<DayKey, ExercisePoint>();

  for (const session of sessions) {
    if (!session.completed) continue;
    const workout = workouts.find((candidate) => candidate.id === session.workoutId);
    if (!workout) continue;

    for (const block of workout.blocks) {
      if (block.exerciseId !== exerciseId) continue;
      for (const set of setsFor(session, block)) {
        if (!set.completed) continue;

        const point = points.get(session.date) ?? {
          date: session.date,
          topLoadKg: null,
          topReps: null,
          totalReps: 0,
          volumeKg: 0,
          sets: 0,
        };
        point.sets += 1;
        point.totalReps += set.reps ?? 0;
        if (set.loadKg != null && set.reps != null) point.volumeKg += set.loadKg * set.reps;
        if (set.loadKg != null && (point.topLoadKg == null || set.loadKg > point.topLoadKg)) {
          point.topLoadKg = set.loadKg;
          point.topReps = set.reps;
        }
        points.set(session.date, point);
      }
    }
  }

  return Array.from(points.values())
    .map((point) => ({ ...point, volumeKg: Math.round(point.volumeKg) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Every exercise that has ever been logged, most recently trained first. */
export function trainedExercises(
  sessions: WorkoutSession[],
  workouts: Workout[],
  exercises: Exercise[],
): Array<{ exercise: Exercise; lastDate: DayKey; sessions: number }> {
  const seen = new Map<string, { lastDate: DayKey; sessions: number }>();

  for (const session of sessions) {
    if (!session.completed) continue;
    const workout = workouts.find((candidate) => candidate.id === session.workoutId);
    if (!workout) continue;
    const ids = new Set(workout.blocks
      .filter((block) => isBlockComplete(session, block))
      .map((block) => block.exerciseId));
    for (const id of ids) {
      const entry = seen.get(id);
      if (!entry) seen.set(id, { lastDate: session.date, sessions: 1 });
      else {
        entry.sessions += 1;
        if (session.date > entry.lastDate) entry.lastDate = session.date;
      }
    }
  }

  return Array.from(seen.entries())
    .map(([id, entry]) => ({
      exercise: exercises.find((candidate) => candidate.id === id),
      ...entry,
    }))
    .filter((row): row is { exercise: Exercise; lastDate: DayKey; sessions: number } =>
      row.exercise !== undefined)
    .sort((a, b) => b.lastDate.localeCompare(a.lastDate));
}

/* --- Frequency & consistency ------------------------------------------------ */

export interface WeekBar {
  /** Monday of the week. */
  start: DayKey;
  sessions: number;
}

/** Sessions per week over the last `weeks` weeks, oldest first. */
export function weeklyFrequency(
  sessions: WorkoutSession[],
  weeks = 8,
  today: DayKey = todayKey(),
): WeekBar[] {
  const thisWeek = startOfWeekKey(today);
  const bars: WeekBar[] = [];

  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDaysToKey(thisWeek, -7 * i);
    const end = addDaysToKey(start, 6);
    const count = sessions.filter(
      (session) => session.completed && session.date >= start && session.date <= end,
    ).length;
    bars.push({ start, sessions: count });
  }
  return bars;
}

export interface TrainingStats {
  totalSessions: number;
  /** Sessions in the last 7 days, today included. */
  last7: number;
  /** Sessions in the last 28 days. */
  last28: number;
  /** Average sessions per week over the last 28 days, to one decimal. */
  perWeek: number;
  totalVolumeKg: number;
  totalDurationSec: number;
  lastSession: DayKey | null;
  /** Days since the last completed session, null when there is none. */
  daysSinceLast: number | null;
}

export function trainingStats(
  sessions: WorkoutSession[],
  workouts: Workout[],
  today: DayKey = todayKey(),
): TrainingStats {
  const done = sessions.filter((session) => session.completed);
  const since = (days: number): number => {
    const from = addDaysToKey(today, -(days - 1));
    return done.filter((session) => session.date >= from && session.date <= today).length;
  };

  const last28 = since(28);
  const lastSession = done.reduce<DayKey | null>(
    (latest, session) => (latest == null || session.date > latest ? session.date : latest),
    null,
  );

  return {
    totalSessions: done.length,
    last7: since(7),
    last28,
    perWeek: Math.round((last28 / 4) * 10) / 10,
    totalVolumeKg: done.reduce(
      (sum, session) => sum + sessionVolumeKg(
        session,
        workouts.find((workout) => workout.id === session.workoutId) ?? null,
      ),
      0,
    ),
    totalDurationSec: done.reduce((sum, session) => sum + (session.durationSec ?? 0), 0),
    lastSession,
    daysSinceLast: lastSession ? daysBetween(lastSession, today) : null,
  };
}
