/**
 * PACE — The persisted document.
 *
 * One snapshot holds everything. Adding an entity means adding a collection
 * here; adding a field to an existing entity means a factory default plus, when
 * old records need backfilling, a migration.
 */

import { APP } from '../core/constants';
import { createSettings } from '../core/factories';
import type {
  ActivityGoal, ActivitySession, AppSettings, CalendarEvent, Exercise, Food,
  Goal, Habit, HabitEntry, Meal, Streak, Task, User, Workout, WorkoutSession,
} from '../core/types';

export interface Snapshot {
  schemaVersion: number;
  appVersion: string;
  savedAt: string | null;
  /** Singletons, not collections. */
  user: User | null;
  settings: AppSettings;
  goals: Goal[];
  habits: Habit[];
  habitEntries: HabitEntry[];
  tasks: Task[];
  events: CalendarEvent[];
  exercises: Exercise[];
  workouts: Workout[];
  workoutSessions: WorkoutSession[];
  activitySessions: ActivitySession[];
  activityGoals: ActivityGoal[];
  foods: Food[];
  meals: Meal[];
  streaks: Streak[];
}

export type CollectionKey = Exclude<
  keyof Snapshot,
  'schemaVersion' | 'appVersion' | 'savedAt' | 'user' | 'settings'
>;

export const COLLECTION_KEYS: CollectionKey[] = [
  'goals', 'habits', 'habitEntries', 'tasks', 'events', 'exercises', 'workouts',
  'workoutSessions', 'activitySessions', 'activityGoals', 'foods', 'meals',
  'streaks',
];

export const STORAGE_KEY = `${APP.storageNamespace}.snapshot`;

export function emptySnapshot(): Snapshot {
  return {
    schemaVersion: APP.schemaVersion,
    appVersion: APP.version,
    savedAt: null,
    user: null,
    settings: createSettings(),
    goals: [],
    habits: [],
    habitEntries: [],
    tasks: [],
    events: [],
    exercises: [],
    workouts: [],
    workoutSessions: [],
    activitySessions: [],
    activityGoals: [],
    foods: [],
    meals: [],
    streaks: [],
  };
}

/**
 * Migrations keyed by the version being migrated *from*. Never edit a shipped
 * migration; add the next one. This matters more on device than on the web: a
 * phone can sit on an old build for months and then jump several versions.
 */
type Migration = (snapshot: Snapshot) => Snapshot;

/**
 * Workout types were four broad buckets before the training system landed.
 * Mapping them keeps old plans readable instead of leaving them on a value the
 * union no longer contains.
 */
const LEGACY_WORKOUT_TYPES: Record<string, Workout['type']> = {
  conditioning: 'hiit',
  rest: 'other',
};

const MIGRATIONS: Record<number, Migration> = {
  /**
   * v1 → v2 — agenda, essentials and reminders.
   *
   * Old records predate the fields the streak and the notification planner
   * read. Backfilling them here rather than relying on `undefined` being falsy
   * keeps the stored document honest and the types truthful.
   */
  1: (snapshot) => ({
    ...snapshot,
    schemaVersion: 2,
    events: snapshot.events ?? [],
    settings: snapshot.settings ?? createSettings(),
    habits: (snapshot.habits ?? []).map((habit) => ({
      ...habit,
      durationMin: habit.durationMin ?? null,
      intervalDays: habit.intervalDays ?? 2,
      startDate: habit.startDate ?? null,
      reminder: habit.reminder ?? null,
      essential: habit.essential ?? false,
    })),
    tasks: (snapshot.tasks ?? []).map((task) => ({
      ...task,
      category: task.category ?? 'general',
      reminder: task.reminder ?? null,
      essential: task.essential ?? false,
    })),
    workoutSessions: (snapshot.workoutSessions ?? []).map((session) => ({
      ...session,
      essential: session.essential ?? false,
    })),
  }),
  /**
   * v4 -> v5 — scheduled workouts and workout sections.
   *
   * Existing plans have no weekday, which reads as "unscheduled" rather than
   * "every day", and every existing exercise lands in the main set — the only
   * section that existed before.
   */
  4: (snapshot) => ({
    ...snapshot,
    schemaVersion: 5,
    workouts: (snapshot.workouts ?? []).map((workout) => ({
      ...workout,
      weekdays: workout.weekdays ?? [],
      blocks: (workout.blocks ?? []).map((block) => ({
        ...block,
        section: block.section ?? 'main',
      })),
    })),
  }),

  /**
   * v3 -> v4 — activities.
   *
   * Swimming left the list of types, so any session recorded as one becomes
   * 'other' rather than a value the union no longer contains. The live-session
   * fields are backfilled so an old record reads as finished, not as one that
   * has been running since 2026.
   */
  3: (snapshot) => ({
    ...snapshot,
    schemaVersion: 4,
    activityGoals: snapshot.activityGoals ?? [],
    activitySessions: (snapshot.activitySessions ?? []).map((session) => ({
      ...session,
      type: (session.type as string) === 'swim' ? 'other' : session.type,
      endedAt: session.endedAt ?? session.startedAt,
      pausedAt: session.pausedAt ?? null,
      pausedTotalSec: session.pausedTotalSec ?? 0,
      track: session.track ?? [],
    })),
  }),

  /** v2 -> v3 — the training system. */
  2: (snapshot) => ({
    ...snapshot,
    schemaVersion: 3,
    workouts: (snapshot.workouts ?? []).map((workout) => ({
      ...workout,
      type: LEGACY_WORKOUT_TYPES[workout.type] ?? workout.type,
    })),
    workoutSessions: (snapshot.workoutSessions ?? []).map((session) => ({
      ...session,
      difficulty: session.difficulty ?? null,
      logs: session.logs ?? {},
    })),
  }),
};

export function migrate(input: Snapshot): Snapshot {
  let snapshot = input;
  let guard = 0;
  while (snapshot.schemaVersion < APP.schemaVersion && guard < 50) {
    guard += 1;
    const step = MIGRATIONS[snapshot.schemaVersion];
    if (!step) {
      snapshot = { ...snapshot, schemaVersion: APP.schemaVersion };
      break;
    }
    snapshot = step(snapshot);
  }
  // A snapshot from a newer build than this one: do not guess, start clean.
  if (snapshot.schemaVersion > APP.schemaVersion) return emptySnapshot();
  return snapshot;
}

/** Fill in collections and singletons added after this snapshot was written. */
export function normalize(input: Partial<Snapshot> | null): Snapshot {
  const snapshot = { ...emptySnapshot(), ...(input ?? {}) } as Snapshot;
  for (const key of COLLECTION_KEYS) {
    if (!Array.isArray(snapshot[key])) {
      (snapshot[key] as unknown[]) = [];
    }
  }
  // Settings are merged rather than replaced, so a block added in a later
  // release gains its defaults without needing a migration of its own.
  const defaults = createSettings();
  snapshot.settings = {
    notifications: { ...defaults.notifications, ...(snapshot.settings?.notifications ?? {}) },
    feedback: { ...defaults.feedback, ...(snapshot.settings?.feedback ?? {}) },
  };
  return snapshot;
}
