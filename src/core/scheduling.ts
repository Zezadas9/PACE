/**
 * PACE — Scheduling primitives.
 *
 * Recurrence and reminders are shared by events and habits, so they live apart
 * from either. Kept in `core` because they are vocabulary, not behaviour: the
 * rules that interpret them are in `domain/recurrence.ts`.
 */

import type { ClockTime, DayKey } from './types';

export type RecurrenceKind = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * A rule anchored to a start date.
 *
 * Deliberately not iCalendar RRULE: this covers what the app offers, stores as
 * plain JSON, and can be widened later without a parser.
 */
export interface Recurrence {
  kind: RecurrenceKind;
  /** Every N days / weeks / months / years. 1 means every one. */
  interval: number;
  /** For 'weekly': 0 = Sunday .. 6 = Saturday. Empty means "the start day". */
  weekdays: number[];
  /** Last day the rule may produce an occurrence, inclusive. */
  until: DayKey | null;
}

export function noRecurrence(): Recurrence {
  return { kind: 'none', interval: 1, weekdays: [], until: null };
}

/**
 * A repeating reminder inside a daily window — "de 30 em 30 minutos, das 08:00
 * às 22:00". Used by habits.
 */
export interface ReminderWindow {
  enabled: boolean;
  startTime: ClockTime;
  endTime: ClockTime;
  /** Repeat every N minutes inside the window; null fires once at startTime. */
  intervalMinutes: number | null;
}

/** A single reminder relative to a scheduled time. Used by events and tasks. */
export interface ReminderLead {
  enabled: boolean;
  minutesBefore: number;
}

export function defaultReminderWindow(): ReminderWindow {
  return { enabled: false, startTime: '09:00', endTime: '21:00', intervalMinutes: null };
}

export function defaultReminderLead(): ReminderLead {
  return { enabled: false, minutesBefore: 15 };
}

/* --- Clock helpers -------------------------------------------------------- */

/** "08:30" -> 510. Returns null for anything unparseable. */
export function toMinutes(time: ClockTime | null | undefined): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 510 -> "08:30". Wraps within the day. */
export function fromMinutes(total: number): ClockTime {
  const clamped = ((Math.round(total) % 1440) + 1440) % 1440;
  const hours = Math.floor(clamped / 60);
  const minutes = clamped % 60;
  return `${hours < 10 ? '0' : ''}${hours}:${minutes < 10 ? '0' : ''}${minutes}`;
}

/** Combines a day key and a clock time into a local Date. */
export function atTime(date: DayKey, time: ClockTime): Date | null {
  const minutes = toMinutes(time);
  if (minutes == null) return null;
  const parts = date.split('-');
  if (parts.length !== 3) return null;
  const result = new Date(
    Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]),
    Math.floor(minutes / 60), minutes % 60, 0, 0,
  );
  return Number.isNaN(result.getTime()) ? null : result;
}
