/**
 * PACE — Streaks.
 *
 * A day is *perfect* when every item the user marked essential for that day is
 * done. Three rules make this humane rather than punishing:
 *
 *   1. A day with no essentials scheduled is **neutral** — it neither extends
 *      nor breaks a run. Sundays should not cost you your streak because your
 *      habits are weekday-only.
 *   2. Today never breaks a run while it is still unfinished.
 *   3. Non-essential work is invisible here. An unanswered email is not a
 *      broken promise.
 *
 * Evaluating a day through `dailyProgress` is O(records); doing that for two
 * years of history on every render is not acceptable, so this module indexes
 * the data once and then answers each day in near-constant time.
 */

import type { DayKey, Habit, WorkoutSession } from '../core/types';
import { addDaysToKey, todayKey } from '../core/utils/date';
import { habitAppliesOn, type ProgressDataset } from './progress';
import { daysBetween } from './recurrence';

/** How far back the statistics look. Two years of history is plenty. */
export const MAX_HISTORY_DAYS = 730;

export interface StreakStats {
  /** 🔥 consecutive perfect days ending today (or yesterday, if today is open). */
  current: number;
  /** 🏆 the longest run inside the window. */
  best: number;
  /** 📅 how many perfect days there have been. */
  perfectDays: number;
  /** 📊 perfect days over days that actually had essentials, 0..1. */
  consistency: number;
  /** Days that had at least one essential item — the denominator above. */
  qualifyingDays: number;
}

interface DayVerdict {
  /** No essentials scheduled: the day does not count either way. */
  neutral: boolean;
  perfect: boolean;
  /** Essenciais do dia, e quantos já estão feitos. */
  total: number;
  done: number;
}

/**
 * Pre-indexes the dataset so a day can be judged without re-scanning arrays.
 * Returns a function, which keeps the index private and the call site clean.
 */
export function createDayEvaluator(data: ProgressDataset): (date: DayKey) => DayVerdict {
  const essentialHabits = data.habits.filter((habit) => habit.essential && !habit.archived);

  const entriesByKey = new Map<string, { completed: boolean; value: number }>();
  for (const entry of data.habitEntries) {
    entriesByKey.set(`${entry.habitId}|${entry.date}`, entry);
  }

  const tasksByDate = new Map<DayKey, { total: number; done: number }>();
  for (const task of data.tasks) {
    if (!task.essential || !task.date) continue;
    const bucket = tasksByDate.get(task.date) ?? { total: 0, done: 0 };
    bucket.total += 1;
    if (task.status === 'done') bucket.done += 1;
    tasksByDate.set(task.date, bucket);
  }

  const sessionsByDate = new Map<DayKey, WorkoutSession[]>();
  for (const session of data.workoutSessions) {
    if (!session.essential) continue;
    const bucket = sessionsByDate.get(session.date) ?? [];
    bucket.push(session);
    sessionsByDate.set(session.date, bucket);
  }

  // Atividades essenciais contam-se do mesmo modo, e dão-se por feitas quando
  // a sessão termina — o utilizador já a fez, não tem de a marcar outra vez.
  const activityByDate = new Map<DayKey, Array<{ done: boolean }>>();
  for (const session of data.activitySessions) {
    if (!session.essential) continue;
    const bucket = activityByDate.get(session.date) ?? [];
    bucket.push({ done: session.endedAt !== null });
    activityByDate.set(session.date, bucket);
  }

  // Same rule as isHabitDone, inlined against the index rather than a record.
  const habitDone = (habit: Habit, date: DayKey): boolean => {
    const entry = entriesByKey.get(`${habit.id}|${date}`);
    if (!entry) return false;
    if (habit.kind === 'check') return entry.completed;
    return entry.completed || entry.value >= habit.target;
  };

  return (date: DayKey): DayVerdict => {
    let total = 0;
    let done = 0;

    for (const habit of essentialHabits) {
      if (!habitAppliesOn(habit, date)) continue;
      total += 1;
      if (habitDone(habit, date)) done += 1;
    }

    const tasks = tasksByDate.get(date);
    if (tasks) {
      total += tasks.total;
      done += tasks.done;
    }

    for (const session of sessionsByDate.get(date) ?? []) {
      total += 1;
      if (session.completed) done += 1;
    }

    for (const session of activityByDate.get(date) ?? []) {
      total += 1;
      if (session.done) done += 1;
    }

    if (total === 0) return { neutral: true, perfect: false, total, done };
    return { neutral: false, perfect: done === total, total, done };
  };
}

/**
 * The first day worth looking at: whichever is later, the account's start or
 * the history cap.
 */
export function historyStart(accountStart: DayKey | null, today: DayKey = todayKey()): DayKey {
  const cap = addDaysToKey(today, -MAX_HISTORY_DAYS);
  if (!accountStart) return cap;
  return accountStart > cap ? accountStart : cap;
}

export function streakStats(
  data: ProgressDataset,
  accountStart: DayKey | null,
  today: DayKey = todayKey(),
): StreakStats {
  const verdict = createDayEvaluator(data);
  const from = historyStart(accountStart, today);
  const span = daysBetween(from, today);
  if (span == null || span < 0) {
    return { current: 0, best: 0, perfectDays: 0, consistency: 0, qualifyingDays: 0 };
  }

  let perfectDays = 0;
  let qualifyingDays = 0;
  let best = 0;
  let run = 0;

  let cursor = from;
  for (let i = 0; i <= span; i += 1) {
    const day = verdict(cursor);
    if (!day.neutral) {
      qualifyingDays += 1;
      if (day.perfect) {
        perfectDays += 1;
        run += 1;
        if (run > best) best = run;
      } else if (cursor !== today) {
        // Today being unfinished is not a failure yet.
        run = 0;
      }
    }
    cursor = addDaysToKey(cursor, 1);
  }

  return {
    current: currentStreak(verdict, from, today),
    best,
    perfectDays,
    consistency: qualifyingDays === 0 ? 0 : Math.round((perfectDays / qualifyingDays) * 100) / 100,
    qualifyingDays,
  };
}

function currentStreak(
  verdict: (date: DayKey) => DayVerdict,
  from: DayKey,
  today: DayKey,
): number {
  let cursor = today;
  // An unfinished today does not break the run; it just does not extend it yet.
  if (!verdict(today).perfect) cursor = addDaysToKey(today, -1);

  let count = 0;
  let guard = 0;
  while (cursor >= from && guard <= MAX_HISTORY_DAYS + 1) {
    guard += 1;
    const day = verdict(cursor);
    if (day.neutral) {
      cursor = addDaysToKey(cursor, -1);
      continue;
    }
    if (!day.perfect) break;
    count += 1;
    cursor = addDaysToKey(cursor, -1);
  }
  return count;
}

/* --- A sequência, vista de perto -------------------------------------------- */

/** Os marcos que valem uma celebração. Nem tantos que percam graça. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365] as const;

export interface StreakDay {
  date: DayKey;
  /** 0 = domingo .. 6 = sábado. */
  weekday: number;
  perfect: boolean;
  /** Dia sem essenciais: não conta nem para bem nem para mal. */
  neutral: boolean;
  isToday: boolean;
}

export interface StreakDetail extends StreakStats {
  /** Os últimos sete dias, do mais antigo para hoje. */
  recent: StreakDay[];
  /** Essenciais que faltam hoje para o dia ficar fechado. */
  remainingToday: number;
  /** O próximo marco, quando existe um à frente. */
  nextMilestone: number | null;
  /** Dias que faltam para bater o recorde, ou null se já é o recorde. */
  toRecord: number | null;
}

export function streakDetail(
  data: ProgressDataset,
  accountStart: DayKey | null,
  today: DayKey = todayKey(),
): StreakDetail {
  const stats = streakStats(data, accountStart, today);
  const verdict = createDayEvaluator(data);

  const recent: StreakDay[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const date = addDaysToKey(today, -i);
    const day = verdict(date);
    recent.push({
      date,
      weekday: new Date(`${date}T12:00:00`).getDay(),
      perfect: day.perfect,
      neutral: day.neutral,
      isToday: date === today,
    });
  }

  const todayVerdict = verdict(today);
  const nextMilestone = STREAK_MILESTONES.find((milestone) => milestone > stats.current) ?? null;
  // Só é "bater o recorde" quando há um recorde para bater e ainda não se lá
  // chegou. Empatar com o próprio recorde não é notícia.
  const toRecord = stats.best > stats.current && stats.best > 0
    ? stats.best - stats.current + 1
    : null;

  return {
    ...stats,
    recent,
    remainingToday: Math.max(0, todayVerdict.total - todayVerdict.done),
    nextMilestone,
    toRecord,
  };
}
