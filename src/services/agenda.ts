/**
 * PACE — Agenda service.
 *
 * Builds the view-model for each agenda scale (day, week, month, year) and owns
 * the mutations the agenda screens perform. Screens read what comes out of here
 * and never touch a collection.
 */

import { EVENT_CATEGORY_LABELS } from '../core/constants';
import { toMinutes } from '../core/scheduling';
import type {
  CalendarEvent, DailyProgress, DayKey, EventOccurrence, Habit, Task,
} from '../core/types';
import {
  addDaysToKey, endOfMonthKey, monthGridKeys, monthOf, startOfMonthKey,
  startOfWeekKey, todayKey, yearOf,
} from '../core/utils/date';
import { occursOn } from '../domain/recurrence';
import {
  dailyProgress, entryFor, essentialsForDay, habitRatio, habitsForDay,
  isHabitDone, rangeOverview, type DaySummary, type EssentialItem,
  type ProgressDataset,
} from '../domain/progress';
import { createDayEvaluator } from '../domain/streak';
import type { Repositories } from '../data/repositories';

export function progressDataset(repos: Repositories): ProgressDataset {
  return {
    habits: repos.habits.all(),
    habitEntries: repos.habitEntries.all(),
    tasks: repos.tasks.all(),
    workouts: repos.workouts.all(),
    workoutSessions: repos.workoutSessions.all(),
    activitySessions: repos.activitySessions.all(),
    meals: repos.meals.all(),
    foods: repos.foods.all(),
  };
}

/* --- Occurrences ----------------------------------------------------------- */

/** Every event instance falling on `date`, including recurring ones. */
export function eventsOn(events: CalendarEvent[], date: DayKey): EventOccurrence[] {
  return events
    .filter((event) => occursOn(event.recurrence, event.date, date))
    .map((event) => ({
      event,
      date,
      startMinutes: event.allDay ? null : toMinutes(event.startTime),
      endMinutes: event.allDay ? null : toMinutes(event.endTime),
    }))
    .sort((a, b) => (a.startMinutes ?? -1) - (b.startMinutes ?? -1));
}

const ACTIVITY_TITLES: Record<string, string> = {
  run: 'Corrida',
  brisk_walk: 'Caminhada rápida',
  walk: 'Caminhada',
  ride: 'Bicicleta',
  hike: 'Caminhada na natureza',
  other: 'Atividade',
};

/* --- Day ------------------------------------------------------------------- */

export type AgendaItemKind = 'event' | 'task' | 'habit' | 'workout' | 'activity';

export interface AgendaItem {
  /** Unique within the day, so React keys stay stable across a re-render. */
  key: string;
  kind: AgendaItemKind;
  sourceId: string;
  title: string;
  subtitle: string | null;
  startMinutes: number | null;
  /** null when the item is not something you tick off — an event. */
  done: boolean | null;
  essential: boolean;
  /** 0..1 for counted habits, so a row can show partial progress. */
  ratio: number;
  /** Repetitions logged and required. 1/1 for anything that is just a tick. */
  value: number;
  target: number;
  /** Drives the row colour; see styles/hues.css for what each name means. */
  hue: string;
}

export interface DayAgenda {
  date: DayKey;
  progress: DailyProgress;
  essentials: EssentialItem[];
  timed: AgendaItem[];
  untimed: AgendaItem[];
  events: EventOccurrence[];
  tasks: Task[];
  habits: Habit[];
}

export function dayAgenda(repos: Repositories, date: DayKey): DayAgenda {
  const data = progressDataset(repos);
  const occurrences = eventsOn(repos.events.all(), date);
  const tasks = data.tasks.filter((task) => task.date === date);
  const habits = habitsForDay(data.habits, date);

  const items: AgendaItem[] = [];

  for (const occurrence of occurrences) {
    items.push({
      key: `event-${occurrence.event.id}`,
      kind: 'event',
      sourceId: occurrence.event.id,
      title: occurrence.event.title,
      subtitle: EVENT_CATEGORY_LABELS[occurrence.event.category] ?? null,
      startMinutes: occurrence.startMinutes,
      done: null,
      essential: false,
      ratio: 0,
      value: 0,
      target: 1,
      hue: occurrence.event.category,
    });
  }

  for (const task of tasks) {
    items.push({
      key: `task-${task.id}`,
      kind: 'task',
      sourceId: task.id,
      title: task.title,
      subtitle: task.time,
      startMinutes: toMinutes(task.time),
      done: task.status === 'done',
      essential: task.essential,
      ratio: task.status === 'done' ? 1 : 0,
      value: task.status === 'done' ? 1 : 0,
      target: 1,
      hue: 'task',
    });
  }

  for (const habit of habits) {
    const entry = entryFor(data.habitEntries, habit.id, date);
    items.push({
      key: `habit-${habit.id}`,
      kind: 'habit',
      sourceId: habit.id,
      title: habit.title,
      subtitle: habitSubtitle(habit, entry?.value ?? 0),
      startMinutes: toMinutes(habit.timeOfDay),
      done: isHabitDone(habit, entry),
      essential: habit.essential,
      ratio: habitRatio(habit, entry),
      value: entry?.value ?? 0,
      target: Math.max(1, habit.target),
      hue: 'habit',
    });
  }

  for (const session of data.workoutSessions.filter((s) => s.date === date)) {
    const plan = data.workouts.find((workout) => workout.id === session.workoutId);
    items.push({
      key: `workout-${session.id}`,
      kind: 'workout',
      sourceId: session.id,
      title: plan?.title ?? 'Treino',
      subtitle: plan?.estimatedMin ? `${plan.estimatedMin} min` : null,
      startMinutes: null,
      done: session.completed,
      essential: session.essential,
      ratio: session.completed ? 1 : 0,
      value: session.completed ? 1 : 0,
      target: 1,
      hue: 'workout',
    });
  }

  // Atividades entram na agenda pela hora a que começaram, quando houve uma.
  // Uma entrada manual sem hora fica na lista sem horário, como um hábito.
  for (const session of data.activitySessions.filter((s) => s.date === date)) {
    const started = session.startedAt ? new Date(session.startedAt) : null;
    const done = session.endedAt !== null;
    items.push({
      key: `activity-${session.id}`,
      kind: 'activity',
      sourceId: session.id,
      title: ACTIVITY_TITLES[session.type] ?? 'Atividade',
      subtitle: session.durationSec
        ? `${Math.round(session.durationSec / 60)} min`
        : null,
      startMinutes: started && session.source !== 'manual'
        ? started.getHours() * 60 + started.getMinutes()
        : null,
      done,
      essential: session.essential,
      ratio: done ? 1 : 0,
      value: done ? 1 : 0,
      target: 1,
      hue: 'activity',
    });
  }

  const timed = items
    .filter((item) => item.startMinutes != null)
    .sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0));
  const untimed = items.filter((item) => item.startMinutes == null);

  return {
    date,
    progress: dailyProgress(data, date),
    essentials: essentialsForDay(data, date),
    timed,
    untimed,
    events: occurrences,
    tasks,
    habits,
  };
}

function habitSubtitle(habit: Habit, value: number): string | null {
  if (habit.kind === 'check') return habit.timeOfDay;
  const unit = habit.unit ? ` ${habit.unit}` : '';
  return `${value} / ${habit.target}${unit}`;
}

/* --- Week ------------------------------------------------------------------ */

export interface WeekDayCell extends DaySummary {
  eventCount: number;
  taskCount: number;
  habitCount: number;
}

export interface WeekAgenda {
  anchor: DayKey;
  start: DayKey;
  days: WeekDayCell[];
}

export function weekAgenda(repos: Repositories, anchor: DayKey): WeekAgenda {
  const data = progressDataset(repos);
  const events = repos.events.all();
  const start = startOfWeekKey(anchor);
  // Built by day arithmetic rather than by parsing a string back into a Date,
  // which is where local-vs-UTC bugs come from.
  const summaries = rangeOverview(data, start, addDaysToKey(start, 6));

  return {
    anchor,
    start,
    days: summaries.map((summary) => ({
      ...summary,
      eventCount: eventsOn(events, summary.date).length,
      taskCount: data.tasks.filter((task) => task.date === summary.date).length,
      habitCount: habitsForDay(data.habits, summary.date).length,
    })),
  };
}

/* --- Month ----------------------------------------------------------------- */

export interface MonthCell extends DaySummary {
  inMonth: boolean;
  hasEvents: boolean;
  hasTasks: boolean;
  hasHabits: boolean;
}

export interface MonthAgenda {
  anchor: DayKey;
  month: number;
  year: number;
  /** Six rows of seven, Monday-first, including neighbouring-month days. */
  weeks: MonthCell[][];
  perfectDays: number;
}

export function monthAgenda(repos: Repositories, anchor: DayKey): MonthAgenda {
  const data = progressDataset(repos);
  const events = repos.events.all();
  const keys = monthGridKeys(anchor);
  const month = monthOf(anchor);

  const summaries = rangeOverview(data, keys[0]!, keys[keys.length - 1]!);
  const byDate = new Map(summaries.map((summary) => [summary.date, summary]));

  const cells: MonthCell[] = keys.map((date) => {
    const summary = byDate.get(date)!;
    return {
      ...summary,
      inMonth: monthOf(date) === month,
      hasEvents: eventsOn(events, date).length > 0,
      hasTasks: data.tasks.some((task) => task.date === date),
      hasHabits: habitsForDay(data.habits, date).length > 0,
    };
  });

  const weeks: MonthCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return {
    anchor,
    month,
    year: yearOf(anchor),
    weeks,
    perfectDays: cells.filter((cell) => cell.inMonth && cell.isPerfectDay).length,
  };
}

/* --- Year ------------------------------------------------------------------ */

export interface YearMonth {
  index: number;
  anchor: DayKey;
  perfectDays: number;
  activeDays: number;
  /** One entry per day of the month: 0 none, 1 partial, 2 perfect. */
  intensity: number[];
}

export interface YearAgenda {
  year: number;
  months: YearMonth[];
  perfectDays: number;
  activeDays: number;
}

/**
 * A whole year is 365 day evaluations. Using the indexed evaluator instead of
 * `dailyProgress` per day keeps this a few thousand operations rather than a
 * few hundred thousand.
 */
export function yearAgenda(repos: Repositories, year: number): YearAgenda {
  const data = progressDataset(repos);
  const verdict = createDayEvaluator(data);
  const today = todayKey();

  const months: YearMonth[] = [];
  let perfectDays = 0;
  let activeDays = 0;

  for (let month = 0; month < 12; month += 1) {
    const anchor = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const last = endOfMonthKey(anchor);
    const intensity: number[] = [];
    let monthPerfect = 0;
    let monthActive = 0;

    let cursor = startOfMonthKey(anchor);
    while (cursor <= last) {
      if (cursor > today) {
        intensity.push(0);
      } else {
        const day = verdict(cursor);
        if (day.neutral) {
          intensity.push(0);
        } else if (day.perfect) {
          intensity.push(2);
          monthPerfect += 1;
          monthActive += 1;
        } else {
          intensity.push(1);
          monthActive += 1;
        }
      }
      cursor = addDaysToKey(cursor, 1);
    }

    perfectDays += monthPerfect;
    activeDays += monthActive;
    months.push({
      index: month,
      anchor,
      perfectDays: monthPerfect,
      activeDays: monthActive,
      intensity,
    });
  }

  return { year, months, perfectDays, activeDays };
}

/* --- Mutations -------------------------------------------------------------
   The agenda screens call these; none of them touches a collection directly. */

export function toggleTask(repos: Repositories, taskId: string): void {
  const task = repos.tasks.byId(taskId);
  if (!task) return;
  repos.tasks.update(taskId, { status: task.status === 'done' ? 'open' : 'done' });
}

/**
 * One tap on a habit row.
 *
 * A check habit flips. A counted habit advances by one and only flips to done
 * on the last repetition — tapping "beber água" seven times should register
 * seven glasses, not toggle a boolean. Tapping a finished habit clears it.
 */
export function advanceHabit(repos: Repositories, habitId: string, date: DayKey): void {
  const habit = repos.habits.byId(habitId);
  if (!habit) return;

  const existing = repos.habitEntries.where(
    (entry) => entry.habitId === habitId && entry.date === date,
  )[0];

  const step = habit.kind === 'check' ? 1 : 1;
  const target = Math.max(1, habit.target);

  if (!existing) {
    const value = Math.min(step, target);
    repos.habitEntries.create({
      habitId,
      date,
      value,
      completed: value >= target,
      completedAt: value >= target ? new Date().toISOString() : null,
    });
    return;
  }

  const wasDone = isHabitDone(habit, existing);
  if (wasDone) {
    repos.habitEntries.update(existing.id, { value: 0, completed: false, completedAt: null });
    return;
  }

  const value = Math.min(existing.value + step, target);
  const done = value >= target;
  repos.habitEntries.update(existing.id, {
    value,
    completed: done,
    completedAt: done ? new Date().toISOString() : null,
  });
}

/** Long-press equivalent: jump straight to done, or straight back to zero. */
export function setHabitDone(
  repos: Repositories,
  habitId: string,
  date: DayKey,
  done: boolean,
): void {
  const habit = repos.habits.byId(habitId);
  if (!habit) return;
  const target = Math.max(1, habit.target);
  const existing = repos.habitEntries.where(
    (entry) => entry.habitId === habitId && entry.date === date,
  )[0];
  const patch = {
    value: done ? target : 0,
    completed: done,
    completedAt: done ? new Date().toISOString() : null,
  };
  if (existing) repos.habitEntries.update(existing.id, patch);
  else repos.habitEntries.create({ habitId, date, ...patch });
}

export function toggleWorkoutSession(repos: Repositories, sessionId: string): void {
  const session = repos.workoutSessions.byId(sessionId);
  if (!session) return;
  repos.workoutSessions.update(sessionId, {
    completed: !session.completed,
    endedAt: session.completed ? null : new Date().toISOString(),
  });
}

/** Marks an agenda item done from a single tap, whatever kind it is. */
export function completeItem(repos: Repositories, item: AgendaItem, date: DayKey): void {
  switch (item.kind) {
    case 'task':
      toggleTask(repos, item.sourceId);
      break;
    case 'habit':
      advanceHabit(repos, item.sourceId, date);
      break;
    case 'workout':
      toggleWorkoutSession(repos, item.sourceId);
      break;
    default:
      break; // events are not completable
  }
}

export function deleteEvent(repos: Repositories, eventId: string): void {
  repos.events.remove(eventId);
}

export function deleteTask(repos: Repositories, taskId: string): void {
  repos.tasks.remove(taskId);
}

/**
 * Archives rather than deletes: a habit's history is the streak's evidence, and
 * removing the habit would silently rewrite past days.
 */
export function archiveHabit(repos: Repositories, habitId: string): void {
  repos.habits.update(habitId, { archived: true });
}
