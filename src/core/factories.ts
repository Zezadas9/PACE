/**
 * Record factories.
 *
 * Every record is born here, so a required field can never be missing and a
 * record written by an older build still gains defaults for new fields.
 */

import { APP } from './constants';
import type {
  ActivitySession, AppSettings, CalendarEvent, Entity, Exercise, Food, Goal,
  Habit, HabitEntry, Meal, Streak, Task, User, Workout, WorkoutSession,
} from './types';
import { noRecurrence } from './scheduling';
import { createId } from './utils/id';
import { todayKey } from './utils/date';

const now = (): string => new Date().toISOString();

function base(): Entity {
  const timestamp = now();
  return { id: createId(), createdAt: timestamp, updatedAt: timestamp };
}

export function createUser(partial: Partial<User> = {}): User {
  return {
    ...base(),
    name: '',
    birthDate: null,
    gender: 'undisclosed',
    body: { heightCm: null, weightKg: null, measuredAt: null },
    preferences: {
      weightUnit: 'kg',
      distanceUnit: 'km',
      heightUnit: 'cm',
      locale: APP.locale,
      theme: 'system',
      timezone: null,
    },
    goalIds: [],
    onboardingCompleted: false,
    onboardingCompletedAt: null,
    ...partial,
  };
}

export function createGoal(partial: Partial<Goal> = {}): Goal {
  return {
    ...base(),
    type: 'other',
    label: '',
    note: null,
    targetValue: null,
    targetUnit: null,
    targetDate: null,
    active: true,
    ...partial,
  };
}

export function createHabit(partial: Partial<Habit> = {}): Habit {
  return {
    ...base(),
    title: '',
    description: null,
    kind: 'check',
    frequency: 'daily',
    weekdays: [],
    target: 1,
    unit: null,
    timeOfDay: null,
    durationMin: null,
    intervalDays: 2,
    startDate: todayKey(),
    reminder: null,
    essential: false,
    goalId: null,
    colorToken: null,
    archived: false,
    ...partial,
  };
}

export function createHabitEntry(partial: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: createId(),
    habitId: '',
    date: todayKey(),
    completed: false,
    value: 0,
    completedAt: null,
    ...partial,
  };
}

export function createTask(partial: Partial<Task> = {}): Task {
  return {
    ...base(),
    title: '',
    notes: null,
    date: null,
    time: null,
    durationMin: null,
    priority: 'normal',
    category: 'general',
    status: 'open',
    reminder: null,
    essential: false,
    goalId: null,
    tags: [],
    ...partial,
  };
}

export function createExercise(partial: Partial<Exercise> = {}): Exercise {
  return {
    ...base(),
    name: '',
    muscleGroups: [],
    equipment: null,
    isBodyweight: false,
    instructions: null,
    ...partial,
  };
}

export function createWorkout(partial: Partial<Workout> = {}): Workout {
  return {
    ...base(),
    title: '',
    type: 'strength',
    estimatedMin: null,
    blocks: [],
    goalId: null,
    tags: [],
    archived: false,
    ...partial,
  };
}

export function createWorkoutSession(partial: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    ...base(),
    workoutId: null,
    date: todayKey(),
    startedAt: null,
    endedAt: null,
    durationSec: null,
    logs: {},
    perceivedEffort: null,
    difficulty: null,
    notes: null,
    essential: false,
    completed: false,
    ...partial,
  };
}

export function createActivitySession(partial: Partial<ActivitySession> = {}): ActivitySession {
  return {
    ...base(),
    type: 'run',
    date: todayKey(),
    startedAt: null,
    durationSec: null,
    distanceM: null,
    elevationGainM: null,
    avgHeartRate: null,
    calories: null,
    avgPaceSecPerKm: null,
    source: 'manual',
    externalId: null,
    notes: null,
    ...partial,
  };
}

export function createFood(partial: Partial<Food> = {}): Food {
  return {
    ...base(),
    name: '',
    brand: null,
    kcalPer100g: 0,
    proteinPer100g: 0,
    carbsPer100g: 0,
    fatPer100g: 0,
    fiberPer100g: null,
    barcode: null,
    ...partial,
  };
}

export function createMeal(partial: Partial<Meal> = {}): Meal {
  return {
    ...base(),
    date: todayKey(),
    type: 'snack',
    time: null,
    items: [],
    notes: null,
    ...partial,
  };
}

export function createStreak(partial: Partial<Streak> = {}): Streak {
  return {
    ...base(),
    kind: 'daily_completion',
    refId: null,
    current: 0,
    longest: 0,
    lastDate: null,
    ...partial,
  };
}

export function createCalendarEvent(partial: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    ...base(),
    title: '',
    description: null,
    category: 'personal',
    date: todayKey(),
    startTime: '09:00',
    endTime: '10:00',
    allDay: false,
    recurrence: noRecurrence(),
    reminder: null,
    location: null,
    ...partial,
  };
}

/** Defaults chosen to be quiet: notifications are opt-in, never opt-out. */
export function createSettings(partial: Partial<AppSettings> = {}): AppSettings {
  return {
    notifications: {
      enabled: false,
      startTime: '08:00',
      endTime: '22:00',
      permissionRequested: false,
      highVolumeAccepted: false,
    },
    feedback: { sound: true, haptics: true },
    ...partial,
  };
}

/** Stamp updatedAt on any mutation that goes through a repository. */
export function touch<T extends { updatedAt: string }>(record: T): T {
  record.updatedAt = now();
  return record;
}
