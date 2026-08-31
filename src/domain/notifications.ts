/**
 * PACE — Notification planning.
 *
 * Turns habits, events and tasks into a concrete list of reminders for a given
 * day. Pure and platform-free: this module decides *what* should fire and
 * *when*, and `services/notifications.ts` hands the result to the platform port.
 *
 * Splitting it this way means the schedule is fully testable on a machine with
 * no notification support at all — which is exactly the machine this is being
 * built on.
 */

import {
  MAX_SCHEDULED_NOTIFICATIONS, REMINDER_CONFIRM_THRESHOLD,
} from '../core/constants';
import { atTime, fromMinutes, toMinutes } from '../core/scheduling';
import type {
  CalendarEvent, DayKey, Habit, NotificationSettings, Task,
} from '../core/types';
import { habitAppliesOn } from './progress';
import { occursOn } from './recurrence';

export interface PlannedReminder {
  /** Stable across replans, so rescheduling does not duplicate. */
  key: string;
  sourceKind: 'habit' | 'event' | 'task';
  sourceId: string;
  title: string;
  body: string;
  /** Local instant the reminder should fire. */
  at: Date;
  /** Route to open when tapped. */
  route: string;
}

/**
 * The clock times a repeating window produces.
 *
 * An interval of null gives a single reminder at `startTime`. An end before the
 * start yields nothing rather than wrapping past midnight — a window that
 * crosses midnight is not something the UI can express, so accepting one here
 * would only hide a bad config.
 */
export function windowTimes(
  startTime: string,
  endTime: string,
  intervalMinutes: number | null,
  clampTo?: { startTime: string; endTime: string },
): string[] {
  let start = toMinutes(startTime);
  let end = toMinutes(endTime);
  if (start == null || end == null) return [];

  if (clampTo) {
    const globalStart = toMinutes(clampTo.startTime);
    const globalEnd = toMinutes(clampTo.endTime);
    if (globalStart != null) start = Math.max(start, globalStart);
    if (globalEnd != null) end = Math.min(end, globalEnd);
  }

  if (end < start) return [];
  if (intervalMinutes == null) return [fromMinutes(start)];

  const step = Math.max(5, Math.floor(intervalMinutes));
  const out: string[] = [];
  for (let minute = start; minute <= end; minute += step) {
    out.push(fromMinutes(minute));
    if (out.length >= MAX_SCHEDULED_NOTIFICATIONS) break;
  }
  return out;
}

/** How many reminders this habit would produce in one day. */
export function habitReminderCount(
  habit: Habit,
  settings: NotificationSettings,
): number {
  const reminder = habit.reminder;
  if (!reminder?.enabled) return 0;
  return windowTimes(
    reminder.startTime, reminder.endTime, reminder.intervalMinutes,
    { startTime: settings.startTime, endTime: settings.endTime },
  ).length;
}

/** True when this configuration deserves an explicit confirmation. */
export function isHighVolume(count: number): boolean {
  return count > REMINDER_CONFIRM_THRESHOLD;
}

export function planHabitReminders(
  habit: Habit,
  date: DayKey,
  settings: NotificationSettings,
): PlannedReminder[] {
  const reminder = habit.reminder;
  if (!reminder?.enabled) return [];
  if (!habitAppliesOn(habit, date)) return [];

  return windowTimes(
    reminder.startTime, reminder.endTime, reminder.intervalMinutes,
    { startTime: settings.startTime, endTime: settings.endTime },
  )
    .map((time): PlannedReminder | null => {
      const at = atTime(date, time);
      if (!at) return null;
      return {
        key: `habit:${habit.id}:${date}:${time}`,
        sourceKind: 'habit',
        sourceId: habit.id,
        title: habit.title,
        body: habitBody(habit),
        at,
        route: '/hoje',
      };
    })
    .filter((item): item is PlannedReminder => item !== null);
}

function habitBody(habit: Habit): string {
  if (habit.kind === 'count') {
    return `Faltam registos hoje — meta de ${habit.target}${habit.unit ? ` ${habit.unit}` : ''}.`;
  }
  if (habit.kind === 'duration') {
    return `${habit.target} minutos hoje.`;
  }
  return 'Está na hora.';
}

export function planEventReminders(
  event: CalendarEvent,
  date: DayKey,
): PlannedReminder[] {
  const reminder = event.reminder;
  if (!reminder?.enabled) return [];
  if (!occursOn(event.recurrence, event.date, date)) return [];

  const startsAt = atTime(date, event.allDay ? '09:00' : event.startTime);
  if (!startsAt) return [];

  const at = new Date(startsAt.getTime() - reminder.minutesBefore * 60_000);
  return [{
    key: `event:${event.id}:${date}`,
    sourceKind: 'event',
    sourceId: event.id,
    title: event.title,
    body: reminder.minutesBefore === 0
      ? 'Começa agora.'
      : `Começa daqui a ${describeLead(reminder.minutesBefore)}.`,
    at,
    route: '/agenda',
  }];
}

export function planTaskReminders(task: Task, date: DayKey): PlannedReminder[] {
  const reminder = task.reminder;
  if (!reminder?.enabled || task.date !== date || task.status === 'done') return [];

  const dueAt = atTime(date, task.time ?? '09:00');
  if (!dueAt) return [];

  const at = new Date(dueAt.getTime() - reminder.minutesBefore * 60_000);
  return [{
    key: `task:${task.id}:${date}`,
    sourceKind: 'task',
    sourceId: task.id,
    title: task.title,
    body: 'Tarefa por concluir.',
    at,
    route: '/agenda',
  }];
}

function describeLead(minutes: number): string {
  if (minutes >= 1440) return `${Math.round(minutes / 1440)} dia(s)`;
  if (minutes >= 60) return `${Math.round(minutes / 60)} h`;
  return `${minutes} min`;
}

export interface ReminderPlan {
  reminders: PlannedReminder[];
  /** Everything that was planned before the ceiling trimmed it. */
  requested: number;
  truncated: boolean;
}

/**
 * The reminders for a window of days, already sorted and trimmed.
 *
 * `now` exists so past instants are dropped: both platforms fire a
 * notification scheduled in the past immediately, which would greet the user
 * with a burst of stale reminders every time the app opens.
 */
export function planReminders(
  data: { habits: Habit[]; events: CalendarEvent[]; tasks: Task[] },
  dates: DayKey[],
  settings: NotificationSettings,
  now: Date = new Date(),
): ReminderPlan {
  if (!settings.enabled) return { reminders: [], requested: 0, truncated: false };

  const all: PlannedReminder[] = [];
  for (const date of dates) {
    for (const habit of data.habits) all.push(...planHabitReminders(habit, date, settings));
    for (const event of data.events) all.push(...planEventReminders(event, date));
    for (const task of data.tasks) all.push(...planTaskReminders(task, date));
  }

  const upcoming = all
    .filter((reminder) => reminder.at.getTime() > now.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  return {
    reminders: upcoming.slice(0, MAX_SCHEDULED_NOTIFICATIONS),
    requested: upcoming.length,
    truncated: upcoming.length > MAX_SCHEDULED_NOTIFICATIONS,
  };
}

/** A stable 31-bit id, because the native APIs key notifications by number. */
export function reminderId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
