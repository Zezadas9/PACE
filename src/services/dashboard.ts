/**
 * PACE — Dashboard service.
 *
 * Assembles the single view-model the Today screen renders. The screen does no
 * arithmetic and reaches into no collection, so swapping the data source later
 * leaves the dashboard untouched.
 */

import type {
  ActivitySession, DailyProgress, DayKey, EventOccurrence, Goal, Habit,
  HabitEntry, Meal, Task, User, UserPreferences, Workout, WorkoutSession,
} from '../core/types';
import { addDaysToKey, greeting, longDate, todayKey } from '../core/utils/date';
import * as progress from '../domain/progress';
import type { DaySummary, EssentialItem } from '../domain/progress';
import { streakDetail, type StreakDetail } from '../domain/streak';
import * as training from '../domain/training';
import type { GoalProgress } from '../domain/activity';
import {
  activeGoalProgress, dayTotals, waterOn,
  type NutritionProgress, type NutritionTotals,
} from '../domain/nutrition';
import { goalProgress as activityGoalProgress } from './activity';
import type { Repositories } from '../data/repositories';
import { eventsOn, progressDataset } from './agenda';
import { goalsOf } from './profile';

export { progressDataset as datasetFrom };

export interface HabitView {
  habit: Habit;
  entry: HabitEntry | null;
  done: boolean;
  value: number;
  ratio: number;
}

export interface WorkoutView {
  /** Null when the plan is due by schedule but has not been started. */
  session: WorkoutSession | null;
  workout: Workout | null;
  title: string;
  blockCount: number;
  estimatedMin: number | null;
  completed: boolean;
  essential: boolean;
  /** Started but not finished — the card offers "continuar" instead of "começar". */
  running: boolean;
  progress: number;
}

/** The training block on the dashboard: what is next, and what just happened. */
export interface TrainingView {
  next: { session: WorkoutSession; workout: Workout | null; date: DayKey } | null;
  recent: training.SessionSummary[];
  stats: training.TrainingStats;
  weeks: training.WeekBar[];
}

export interface ActivityView {
  sessions: ActivitySession[];
  durationSec: number;
  distanceM: number;
  calories: number;
}

export interface NutritionView {
  meals: Meal[];
  mealCount: number;
  calories: number;
  /** The five nutrients, with whatever could not be resolved counted. */
  totals: NutritionTotals;
  waterMl: number;
}

export interface UpcomingEvent {
  occurrence: EventOccurrence;
  /** The day it falls on, relative to today, for the "amanhã" label. */
  dayOffset: number;
}

export interface TodayModel {
  date: DayKey;
  greeting: string;
  longDate: string;
  user: User | null;
  preferences: UserPreferences;
  summary: DailyProgress;
  essentials: EssentialItem[];
  habits: HabitView[];
  tasks: Task[];
  workout: WorkoutView | null;
  activity: ActivityView | null;
  /** Live progress on the activity goals — the brief asks for it here. */
  activityGoals: GoalProgress[];
  nutrition: NutritionView | null;
  /** Progress on the food and water goals, alongside the activity ones. */
  nutritionGoals: NutritionProgress[];
  streak: StreakDetail;
  week: DaySummary[];
  upcoming: UpcomingEvent[];
  training: TrainingView;
  goals: Goal[];
}

/** How far ahead the "próximos eventos" card looks. */
const UPCOMING_DAYS = 7;
const UPCOMING_LIMIT = 4;

export function todayModel(
  repos: Repositories,
  preferences: UserPreferences,
  date: DayKey = todayKey(),
): TodayModel {
  const data = progressDataset(repos);
  const user = repos.user.get();
  const accountStart = user ? user.createdAt.slice(0, 10) : null;

  return {
    date,
    greeting: greeting(),
    longDate: longDate(date),
    user,
    preferences,
    summary: progress.dailyProgress(data, date),
    essentials: progress.essentialsForDay(data, date),
    habits: buildHabits(data, date),
    tasks: data.tasks.filter((task) => task.date === date),
    workout: buildWorkout(data, date),
    activity: buildActivity(data, date),
    activityGoals: activityGoalProgress(repos, date),
    nutrition: buildNutrition(repos, data, date),
    nutritionGoals: activeGoalProgress(
      repos.nutritionGoals.all(), data.meals, data.foods, repos.waterEntries.all(), date,
    ),
    streak: streakDetail(data, accountStart, date),
    week: progress.weekOverview(data),
    upcoming: buildUpcoming(repos, date),
    training: buildTraining(repos, date),
    goals: goalsOf(repos),
  };
}

function buildHabits(data: progress.ProgressDataset, date: DayKey): HabitView[] {
  return progress.habitsForDay(data.habits, date).map((habit) => {
    const entry = progress.entryFor(data.habitEntries, habit.id, date);
    return {
      habit,
      entry,
      done: progress.isHabitDone(habit, entry),
      value: entry?.value ?? 0,
      ratio: progress.habitRatio(habit, entry),
    };
  });
}

function buildWorkout(data: progress.ProgressDataset, date: DayKey): WorkoutView | null {
  const session = data.workoutSessions.find((candidate) => candidate.date === date) ?? null;
  // No session yet? The weekday schedule still says what is due.
  const workout = session
    ? (session.workoutId
      ? data.workouts.find((candidate) => candidate.id === session.workoutId) ?? null
      : null)
    : training.workoutsForDay(data.workouts, date)[0] ?? null;

  if (!session && !workout) return null;

  return {
    session,
    workout,
    title: workout?.title ?? 'Treino',
    blockCount: workout?.blocks.length ?? 0,
    estimatedMin: workout?.estimatedMin ?? null,
    completed: session?.completed ?? false,
    essential: session?.essential ?? false,
    running: session != null && session.startedAt !== null && !session.completed,
    progress: session ? training.sessionProgress(session, workout).ratio : 0,
  };
}

/**
 * The next planned session after today, plus the last few completed ones.
 *
 * "Next" looks forward only: a session left unfinished in the past is history,
 * not a plan, and offering to start it would quietly rewrite the day it belongs
 * to.
 */
function buildTraining(repos: Repositories, date: DayKey): TrainingView {
  const sessions = repos.workoutSessions.all();
  const workouts = repos.workouts.all();

  const next = sessions
    .filter((session) => !session.completed && session.date > date)
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;

  return {
    next: next
      ? {
          session: next,
          workout: next.workoutId
            ? workouts.find((workout) => workout.id === next.workoutId) ?? null
            : null,
          date: next.date,
        }
      : null,
    recent: training.history(sessions, workouts, 3),
    stats: training.trainingStats(sessions, workouts, date),
    weeks: training.weeklyFrequency(sessions, 8, date),
  };
}

function buildActivity(data: progress.ProgressDataset, date: DayKey): ActivityView | null {
  const sessions = data.activitySessions.filter((session) => session.date === date);
  if (sessions.length === 0) return null;
  return {
    sessions,
    durationSec: sessions.reduce((sum, s) => sum + (s.durationSec ?? 0), 0),
    distanceM: sessions.reduce((sum, s) => sum + (s.distanceM ?? 0), 0),
    calories: sessions.reduce((sum, s) => sum + (s.calories ?? 0), 0),
  };
}

function buildNutrition(
  repos: Repositories,
  data: progress.ProgressDataset,
  date: DayKey,
): NutritionView | null {
  const meals = data.meals.filter((meal) => meal.date === date);
  const waterMl = waterOn(repos.waterEntries.all(), date);
  // Water alone is worth a card: drinking is logged on days nothing is eaten.
  if (meals.length === 0 && waterMl === 0) return null;

  const totals = dayTotals(data.meals, data.foods, date);
  return {
    meals,
    mealCount: meals.length,
    calories: Math.round(totals.values.kcal ?? 0),
    totals,
    waterMl,
  };
}

/**
 * The next few event occurrences, today included.
 *
 * Today's already-past events are dropped only when they have an end time —
 * an all-day event should stay visible all day.
 */
function buildUpcoming(repos: Repositories, date: DayKey): UpcomingEvent[] {
  const events = repos.events.all();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const out: UpcomingEvent[] = [];

  for (let offset = 0; offset < UPCOMING_DAYS && out.length < UPCOMING_LIMIT; offset += 1) {
    const day = addDaysToKey(date, offset);
    for (const occurrence of eventsOn(events, day)) {
      if (offset === 0 && occurrence.endMinutes != null && occurrence.endMinutes < nowMinutes) {
        continue;
      }
      out.push({ occurrence, dayOffset: offset });
      if (out.length >= UPCOMING_LIMIT) break;
    }
  }
  return out;
}

/* --- Mutations re-exported so screens have one import ---------------------- */

export {
  advanceHabit, completeItem, setHabitDone, toggleTask, toggleWorkoutSession,
} from './agenda';
