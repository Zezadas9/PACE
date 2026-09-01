/**
 * PACE — Training service.
 *
 * Owns the workout lifecycle: building a plan, starting a session, logging
 * sets, finishing. Screens call these; none of them touches a collection.
 */

import { createId } from '../core/utils/id';
import { todayKey } from '../core/utils/date';
import { hasSections } from '../core/constants';
import type {
  DayKey, Exercise, SessionDifficulty, SetLog, Workout, WorkoutBlock,
  WorkoutSection, WorkoutSession, WorkoutType,
} from '../core/types';
import * as training from '../domain/training';
import type { Repositories } from '../data/repositories';

/* --- Building a plan -------------------------------------------------------- */

/** One exercise as the builder edits it, before it becomes a block. */
export interface BlockDraft {
  id: string;
  section: WorkoutSection;
  exerciseName: string;
  sets: number;
  reps: number | null;
  loadKg: number | null;
  durationSec: number | null;
  restSec: number | null;
  note: string | null;
}

export interface WorkoutDraft {
  id: string | null;
  title: string;
  type: WorkoutType;
  /** 0 = Sunday .. 6 = Saturday. Empty means the plan is not on a schedule. */
  weekdays: number[];
  estimatedMin: number | null;
  description: string | null;
  blocks: BlockDraft[];
}

export function emptyBlockDraft(section: WorkoutSection = 'main'): BlockDraft {
  return {
    id: createId(),
    section,
    exerciseName: '',
    sets: 3,
    reps: 10,
    loadKg: null,
    durationSec: null,
    restSec: 90,
    note: null,
  };
}

export function emptyWorkoutDraft(): WorkoutDraft {
  return {
    id: null,
    title: '',
    type: 'strength',
    weekdays: [],
    estimatedMin: 45,
    description: null,
    blocks: [emptyBlockDraft()],
  };
}

/** Turns a stored workout back into an editable draft. */
export function draftFromWorkout(workout: Workout, exercises: Exercise[]): WorkoutDraft {
  return {
    id: workout.id,
    title: workout.title,
    type: workout.type,
    weekdays: workout.weekdays,
    estimatedMin: workout.estimatedMin,
    description: workout.tags[0] ?? null,
    blocks: workout.blocks.map((block) => ({
      id: block.id,
      section: block.section,
      exerciseName: exercises.find((e) => e.id === block.exerciseId)?.name ?? '',
      sets: block.sets,
      reps: block.reps,
      loadKg: block.loadKg,
      durationSec: block.durationSec,
      restSec: block.restSec,
      note: block.note,
    })),
  };
}

/**
 * Finds an exercise by name or creates it.
 *
 * The catalogue grows from what people actually type rather than from a fixed
 * list, and matching case-insensitively keeps "Supino" and "supino" as one
 * movement — otherwise the progression chart would split in two.
 */
function resolveExercise(repos: Repositories, name: string): Exercise {
  const trimmed = name.trim();
  const existing = repos.exercises
    .all()
    .find((candidate) => candidate.name.toLowerCase() === trimmed.toLowerCase());
  return existing ?? repos.exercises.create({ name: trimmed });
}

export function saveWorkout(repos: Repositories, draft: WorkoutDraft): Workout {
  const blocks: WorkoutBlock[] = draft.blocks
    .filter((block) => block.exerciseName.trim().length > 0)
    .map((block) => ({
      id: block.id,
      // Sections only mean something for the types that are built that way;
      // everything else collapses into the main set.
      section: hasSections(draft.type) ? block.section : ('main' as const),
      exerciseId: resolveExercise(repos, block.exerciseName).id,
      sets: Math.max(1, Math.floor(block.sets) || 1),
      reps: block.reps,
      loadKg: block.loadKg,
      durationSec: block.durationSec,
      restSec: block.restSec,
      note: block.note,
    }));

  const payload = {
    title: draft.title.trim(),
    type: draft.type,
    weekdays: draft.weekdays,
    estimatedMin: draft.estimatedMin,
    blocks,
    // Description rides in tags[0] rather than adding a field the model does
    // not otherwise need; workouts have no free-text column yet.
    tags: draft.description ? [draft.description] : [],
  };

  if (draft.id) {
    const updated = repos.workouts.update(draft.id, payload);
    if (updated) return updated;
  }
  return repos.workouts.create(payload);
}

export function archiveWorkout(repos: Repositories, workoutId: string): void {
  repos.workouts.update(workoutId, { archived: true });
}

export function describeWorkout(workout: Workout): string {
  return workout.tags[0] ?? '';
}

/* --- Running a session ------------------------------------------------------ */

/** The one session currently in progress, if any. */
export function activeSession(repos: Repositories): WorkoutSession | null {
  return repos.workoutSessions
    .where((session) => !session.completed && session.startedAt !== null)
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0] ?? null;
}

/**
 * What is on for a day: the session if one exists, otherwise the plan the
 * weekday schedule says is due. The session is only created when the user
 * actually starts, so an unopened day leaves no record behind.
 */
export function plannedForDay(
  repos: Repositories,
  date: DayKey = todayKey(),
): { session: WorkoutSession | null; workout: Workout | null } {
  const session = sessionForDay(repos, date);
  if (session) {
    return {
      session,
      workout: session.workoutId ? repos.workouts.byId(session.workoutId) : null,
    };
  }
  const scheduled = training.workoutsForDay(repos.workouts.all(), date)[0] ?? null;
  return { session: null, workout: scheduled };
}

/** The session planned for a day, started or not. */
export function sessionForDay(repos: Repositories, date: DayKey): WorkoutSession | null {
  return repos.workoutSessions.where((session) => session.date === date)[0] ?? null;
}

/**
 * Starts a session for a workout.
 *
 * Reuses the day's planned session when there is one, so starting a workout
 * that was already on the agenda does not leave two records for the same day —
 * which would double-count the workout in the perfect-day tally.
 */
export function startSession(
  repos: Repositories,
  workoutId: string,
  date: DayKey = todayKey(),
): WorkoutSession {
  const now = new Date().toISOString();
  const planned = repos.workoutSessions.where(
    (session) => session.date === date && session.workoutId === workoutId && !session.completed,
  )[0];

  if (planned) {
    return repos.workoutSessions.update(planned.id, { startedAt: now }) ?? planned;
  }
  return repos.workoutSessions.create({ workoutId, date, startedAt: now });
}

/** Schedules a workout for a day without starting it. */
export function planSession(
  repos: Repositories,
  workoutId: string,
  date: DayKey,
  essential = false,
): WorkoutSession {
  const existing = repos.workoutSessions.where(
    (session) => session.date === date && !session.completed,
  )[0];
  if (existing) {
    return repos.workoutSessions.update(existing.id, { workoutId, essential }) ?? existing;
  }
  return repos.workoutSessions.create({ workoutId, date, essential });
}

/** Writes one set, creating the block's log array on first touch. */
export function logSet(
  repos: Repositories,
  sessionId: string,
  blockId: string,
  setIndex: number,
  patch: Partial<SetLog>,
): void {
  const session = repos.workoutSessions.byId(sessionId);
  if (!session) return;

  const workout = session.workoutId ? repos.workouts.byId(session.workoutId) : null;
  const block = workout?.blocks.find((candidate) => candidate.id === blockId);
  if (!block) return;

  const sets = training.setsFor(session, block).map((set, index) =>
    (index === setIndex ? { ...set, ...patch } : set));

  repos.workoutSessions.update(sessionId, {
    logs: { ...session.logs, [blockId]: sets },
  });
}

/** Marks the next incomplete set done — the one-tap action during a session. */
export function completeNextSet(repos: Repositories, sessionId: string): boolean {
  const session = repos.workoutSessions.byId(sessionId);
  if (!session) return false;
  const workout = session.workoutId ? repos.workouts.byId(session.workoutId) : null;
  const next = training.nextSet(session, workout);
  if (!next) return false;
  logSet(repos, sessionId, next.block.id, next.set.setIndex, { completed: true });
  return true;
}

export interface FinishInput {
  notes?: string | null;
  perceivedEffort?: number | null;
  difficulty?: SessionDifficulty | null;
}

export function finishSession(
  repos: Repositories,
  sessionId: string,
  input: FinishInput = {},
): WorkoutSession | null {
  const session = repos.workoutSessions.byId(sessionId);
  if (!session) return null;
  const endedAt = new Date().toISOString();

  return repos.workoutSessions.update(sessionId, {
    completed: true,
    endedAt,
    // Measured from the clock, not from the plan: the real duration is the
    // whole point of recording one.
    durationSec: training.elapsedSeconds(session, new Date(endedAt)),
    notes: input.notes ?? session.notes,
    perceivedEffort: input.perceivedEffort ?? session.perceivedEffort,
    difficulty: input.difficulty ?? session.difficulty,
  });
}

/** Abandons a started session, leaving it planned rather than deleting it. */
export function discardSession(repos: Repositories, sessionId: string): void {
  repos.workoutSessions.update(sessionId, { startedAt: null, endedAt: null, logs: {} });
}
