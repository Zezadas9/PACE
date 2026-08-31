/**
 * PACE — Repositories.
 *
 * A typed view over one collection inside the snapshot. Features mutate through
 * these so that persistence, `updatedAt` stamping and change notification all
 * happen in one place.
 */

import { touch } from '../core/factories';
import * as factories from '../core/factories';
import type {
  ActivitySession, AppSettings, CalendarEvent, Entity, Exercise, Food, Goal,
  Habit, HabitEntry, Meal, Streak, Task, User, Workout, WorkoutSession,
} from '../core/types';
import type { CollectionKey } from './snapshot';
import type { Store } from './store';

export class Collection<T extends { id: string }> {
  constructor(
    private readonly store: Store,
    private readonly key: CollectionKey,
    private readonly factory: (partial?: Partial<T>) => T,
  ) {}

  private rows(): T[] {
    return this.store.snapshot[this.key] as unknown as T[];
  }

  all(): T[] {
    return this.rows().slice();
  }

  count(): number {
    return this.rows().length;
  }

  byId(id: string): T | null {
    return this.rows().find((row) => row.id === id) ?? null;
  }

  where(predicate: (row: T) => boolean): T[] {
    return this.rows().filter(predicate);
  }

  create(partial?: Partial<T>): T {
    const record = this.factory(partial);
    this.rows().push(record);
    this.store.persist();
    return record;
  }

  /** Insert a fully-formed record (seeding, import, health sync). */
  insert(record: T): T {
    this.rows().push(record);
    this.store.persist();
    return record;
  }

  update(id: string, patch: Partial<T>): T | null {
    const record = this.byId(id);
    if (!record) return null;
    Object.assign(record, patch);
    touch(record as unknown as Entity);
    this.store.persist();
    return record;
  }

  remove(id: string): boolean {
    const rows = this.rows();
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) return false;
    rows.splice(index, 1);
    this.store.persist();
    return true;
  }

  replaceAll(records: T[]): T[] {
    (this.store.snapshot[this.key] as unknown as T[]) = records.slice();
    this.store.persist();
    return records;
  }
}

/** The user is a singleton, so it gets its own small surface. */
export class UserRepository {
  constructor(private readonly store: Store) {}

  get(): User | null {
    return this.store.snapshot.user;
  }

  exists(): boolean {
    return this.store.snapshot.user !== null;
  }

  set(user: User): User {
    this.store.snapshot.user = user;
    this.store.persist();
    return user;
  }

  update(patch: Partial<User>): User | null {
    const user = this.store.snapshot.user;
    if (!user) return null;
    Object.assign(user, patch);
    touch(user);
    this.store.persist();
    return user;
  }
}

/** Settings are a singleton too, and always present after `normalize`. */
export class SettingsRepository {
  constructor(private readonly store: Store) {}

  get(): AppSettings {
    return this.store.snapshot.settings;
  }

  update(patch: Partial<AppSettings['notifications']>): AppSettings {
    const current = this.store.snapshot.settings;
    this.store.snapshot.settings = {
      ...current,
      notifications: { ...current.notifications, ...patch },
    };
    this.store.persist();
    return this.store.snapshot.settings;
  }

  updateFeedback(patch: Partial<AppSettings['feedback']>): AppSettings {
    const current = this.store.snapshot.settings;
    this.store.snapshot.settings = {
      ...current,
      feedback: { ...current.feedback, ...patch },
    };
    this.store.persist();
    return this.store.snapshot.settings;
  }
}

export interface Repositories {
  user: UserRepository;
  settings: SettingsRepository;
  goals: Collection<Goal>;
  habits: Collection<Habit>;
  habitEntries: Collection<HabitEntry>;
  tasks: Collection<Task>;
  events: Collection<CalendarEvent>;
  exercises: Collection<Exercise>;
  workouts: Collection<Workout>;
  workoutSessions: Collection<WorkoutSession>;
  activitySessions: Collection<ActivitySession>;
  foods: Collection<Food>;
  meals: Collection<Meal>;
  streaks: Collection<Streak>;
}

export function createRepositories(store: Store): Repositories {
  return {
    user: new UserRepository(store),
    settings: new SettingsRepository(store),
    goals: new Collection(store, 'goals', factories.createGoal),
    habits: new Collection(store, 'habits', factories.createHabit),
    habitEntries: new Collection(store, 'habitEntries', factories.createHabitEntry),
    tasks: new Collection(store, 'tasks', factories.createTask),
    events: new Collection(store, 'events', factories.createCalendarEvent),
    exercises: new Collection(store, 'exercises', factories.createExercise),
    workouts: new Collection(store, 'workouts', factories.createWorkout),
    workoutSessions: new Collection(store, 'workoutSessions', factories.createWorkoutSession),
    activitySessions: new Collection(store, 'activitySessions', factories.createActivitySession),
    foods: new Collection(store, 'foods', factories.createFood),
    meals: new Collection(store, 'meals', factories.createMeal),
    streaks: new Collection(store, 'streaks', factories.createStreak),
  };
}
