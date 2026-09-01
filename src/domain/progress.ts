/**
 * PACE — Daily progress.
 *
 * Derives the DailyProgress shape from raw records. Pure: give it collections
 * and a day key, get a summary back.
 *
 * Two different numbers come out of here and they must not be confused:
 *
 *   `score`        everything scheduled that day, essential or not. Drives the
 *                  ring, so the dashboard reflects the whole day.
 *   `isPerfectDay` only the items the user marked essential. Drives the streak,
 *                  so an unanswered email cannot break a run.
 */

import type {
  ActivitySession, DailyProgress, DayKey, Food, Habit, HabitEntry, Meal, Task,
  Workout, WorkoutSession,
} from '../core/types';
import {
  addDaysToKey, dayOfMonth, fromKey, todayKey, weekKeys, weekdayShort,
} from '../core/utils/date';
import { daysBetween } from './recurrence';
import { mealTotals } from './nutrition';

/** The slice of storage the domain layer reads. */
export interface ProgressDataset {
  habits: Habit[];
  habitEntries: HabitEntry[];
  tasks: Task[];
  workouts: Workout[];
  workoutSessions: WorkoutSession[];
  activitySessions: ActivitySession[];
  meals: Meal[];
  foods: Food[];
  caloriesTarget?: number | null;
}

/** Does this habit belong on that day? */
export function habitAppliesOn(habit: Habit, date: DayKey): boolean {
  if (habit.archived) return false;
  const parsed = fromKey(date);
  if (!parsed) return false;
  // A habit never applies before the day it was meant to start.
  if (habit.startDate && date < habit.startDate) return false;

  const dayOfWeek = parsed.getDay();
  switch (habit.frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekly':
    case 'custom':
      return habit.weekdays.includes(dayOfWeek);
    case 'interval': {
      const anchor = habit.startDate;
      if (!anchor) return true;
      const delta = daysBetween(anchor, date);
      const step = Math.max(1, Math.floor(habit.intervalDays) || 1);
      return delta != null && delta >= 0 && delta % step === 0;
    }
    default:
      return true;
  }
}

export function habitsForDay(habits: Habit[], date: DayKey): Habit[] {
  return habits.filter((habit) => habitAppliesOn(habit, date));
}

export function entryFor(
  entries: HabitEntry[],
  habitId: string,
  date: DayKey,
): HabitEntry | null {
  return entries.find((entry) => entry.habitId === habitId && entry.date === date) ?? null;
}

export function isHabitDone(habit: Habit, entry: HabitEntry | null): boolean {
  if (!entry) return false;
  if (habit.kind === 'check') return entry.completed;
  return entry.completed || entry.value >= habit.target;
}

/** Progress on a counted habit, 0..1 — used for the row meter. */
export function habitRatio(habit: Habit, entry: HabitEntry | null): number {
  if (isHabitDone(habit, entry)) return 1;
  if (!entry || habit.target <= 0) return 0;
  if (habit.kind === 'check') return entry.completed ? 1 : 0;
  return Math.min(1, Math.max(0, entry.value / habit.target));
}

/** Calories for a meal, counting only what is actually known. */
export function mealCalories(meal: Meal, foods: Food[]): number {
  return mealTotals(meal, foods).values.kcal ?? 0;
}

interface ScoreInput {
  habitsTotal: number;
  habitsCompleted: number;
  tasksTotal: number;
  tasksCompleted: number;
  workoutPlanned: boolean;
  workoutCompleted: boolean;
}

/**
 * A single 0..1 number for the day. Habits, tasks and the planned workout each
 * contribute only when they exist, so an empty day is not a failed one.
 */
export function completionScore(input: ScoreInput): number {
  const parts: number[] = [];
  if (input.habitsTotal > 0) parts.push(input.habitsCompleted / input.habitsTotal);
  if (input.tasksTotal > 0) parts.push(input.tasksCompleted / input.tasksTotal);
  if (input.workoutPlanned) parts.push(input.workoutCompleted ? 1 : 0);
  if (parts.length === 0) return 0;
  const sum = parts.reduce((total, part) => total + part, 0);
  return Math.round((sum / parts.length) * 100) / 100;
}

/* --- Essentials ----------------------------------------------------------- */

export interface EssentialItem {
  id: string;
  kind: 'habit' | 'task' | 'workout';
  title: string;
  done: boolean;
}

/**
 * The items that decide whether a day is perfect.
 *
 * Events are absent on purpose. An event is something that happens to you; the
 * perfect day is built from what you committed to doing.
 */
export function essentialsForDay(data: ProgressDataset, date: DayKey): EssentialItem[] {
  const items: EssentialItem[] = [];

  for (const habit of habitsForDay(data.habits, date)) {
    if (!habit.essential) continue;
    items.push({
      id: habit.id,
      kind: 'habit',
      title: habit.title,
      done: isHabitDone(habit, entryFor(data.habitEntries, habit.id, date)),
    });
  }

  for (const task of data.tasks) {
    if (task.date !== date || !task.essential) continue;
    items.push({ id: task.id, kind: 'task', title: task.title, done: task.status === 'done' });
  }

  for (const session of data.workoutSessions) {
    if (session.date !== date || !session.essential) continue;
    const plan = data.workouts.find((workout) => workout.id === session.workoutId);
    items.push({
      id: session.id,
      kind: 'workout',
      title: plan?.title ?? 'Treino',
      done: session.completed,
    });
  }

  return items;
}

export function dailyProgress(data: ProgressDataset, date: DayKey): DailyProgress {
  const habits = habitsForDay(data.habits, date);
  const habitsCompleted = habits.filter(
    (habit) => isHabitDone(habit, entryFor(data.habitEntries, habit.id, date)),
  ).length;

  const tasks = data.tasks.filter((task) => task.date === date);
  const tasksCompleted = tasks.filter((task) => task.status === 'done').length;

  const sessions = data.workoutSessions.filter((session) => session.date === date);
  const workoutPlanned = sessions.length > 0;
  const workoutCompleted = sessions.some((session) => session.completed);

  const activities = data.activitySessions.filter((activity) => activity.date === date);
  const activityDurationSec = activities.reduce((sum, a) => sum + (a.durationSec ?? 0), 0);
  const activityDistanceM = activities.reduce((sum, a) => sum + (a.distanceM ?? 0), 0);

  const meals = data.meals.filter((meal) => meal.date === date);
  const caloriesConsumed = meals.reduce((sum, meal) => sum + mealCalories(meal, data.foods), 0);

  const essentials = essentialsForDay(data, date);
  const essentialCompleted = essentials.filter((item) => item.done).length;

  return {
    date,
    habitsTotal: habits.length,
    habitsCompleted,
    tasksTotal: tasks.length,
    tasksCompleted,
    workoutPlanned,
    workoutCompleted,
    activityDurationSec,
    activityDistanceM,
    caloriesConsumed: Math.round(caloriesConsumed),
    caloriesTarget: data.caloriesTarget ?? null,
    essentialTotal: essentials.length,
    essentialCompleted,
    isPerfectDay: essentials.length > 0 && essentialCompleted === essentials.length,
    score: completionScore({
      habitsTotal: habits.length,
      habitsCompleted,
      tasksTotal: tasks.length,
      tasksCompleted,
      workoutPlanned,
      workoutCompleted,
    }),
  };
}

export type DayState = 'perfect' | 'partial' | 'today' | 'missed' | 'future' | 'empty';

export interface DaySummary {
  date: DayKey;
  label: string;
  day: number | null;
  state: DayState;
  score: number;
  isPerfectDay: boolean;
  essentialTotal: number;
}

function stateFor(progress: DailyProgress, date: DayKey, today: DayKey): DayState {
  if (date > today) return 'future';
  if (progress.isPerfectDay) return 'perfect';
  if (date === today) return 'today';
  if (progress.essentialTotal === 0 && progress.score === 0) return 'empty';
  if (progress.score > 0) return 'partial';
  return 'missed';
}

function summarize(data: ProgressDataset, date: DayKey, today: DayKey): DaySummary {
  const progress = dailyProgress(data, date);
  return {
    date,
    label: weekdayShort(date),
    day: dayOfMonth(date),
    state: stateFor(progress, date, today),
    score: progress.score,
    isPerfectDay: progress.isPerfectDay,
    essentialTotal: progress.essentialTotal,
  };
}

/** Per-day state for the week strip on the dashboard. */
export function weekOverview(data: ProgressDataset, reference?: Date): DaySummary[] {
  const today = todayKey();
  return weekKeys(reference).map((date) => summarize(data, date, today));
}

/** Day states across an arbitrary range — the month and year views use this. */
export function rangeOverview(data: ProgressDataset, from: DayKey, to: DayKey): DaySummary[] {
  const today = todayKey();
  const out: DaySummary[] = [];
  let cursor = from;
  // A year view asks for 366 days; the guard stops a bad range, not a real one.
  let guard = 0;
  while (cursor <= to && guard < 400) {
    guard += 1;
    out.push(summarize(data, cursor, today));
    cursor = addDaysToKey(cursor, 1);
  }
  return out;
}
