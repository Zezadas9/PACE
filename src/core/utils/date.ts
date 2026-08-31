/**
 * Dates.
 *
 * Day keys are local "YYYY-MM-DD" strings. Never derive one from
 * toISOString(): that shifts to UTC and silently moves a late-evening entry to
 * tomorrow — a bug that only shows up for users west of Greenwich, at night.
 */

import type { DayKey } from '../types';

export const WEEKDAYS_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const;
export const WEEKDAYS_LONG = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
  'quinta-feira', 'sexta-feira', 'sábado',
] as const;
export const MONTHS_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
] as const;

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

/** Local day key for a Date. */
export function toKey(date: Date = new Date()): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayKey(): DayKey {
  return toKey(new Date());
}

/** Parse "YYYY-MM-DD" as local midnight. */
export function fromKey(key: DayKey | null | undefined): Date | null {
  if (!key || typeof key !== 'string') return null;
  const parts = key.split('-');
  if (parts.length !== 3) return null;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isValidKey(key: string): boolean {
  const date = fromKey(key);
  return !!date && toKey(date) === key;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function addDaysToKey(key: DayKey, days: number): DayKey {
  const date = fromKey(key);
  return date ? toKey(addDays(date, days)) : key;
}

/** Whole years elapsed, calendar-correct (no 365.25 drift). */
export function ageFromBirthDate(
  birthKey: DayKey | null,
  reference: Date = new Date(),
): number | null {
  const birth = fromKey(birthKey);
  if (!birth) return null;
  let age = reference.getFullYear() - birth.getFullYear();
  const monthDelta = reference.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && reference.getDate() < birth.getDate())) {
    age -= 1;
  }
  // 130 is the sanity ceiling the app validates against; anything beyond is
  // a typo, not a person.
  return age >= 0 && age <= 130 ? age : null;
}

/** The seven day keys of the week containing `date`, starting on Monday. */
export function weekKeys(date: Date = new Date()): DayKey[] {
  const dayOfWeek = (date.getDay() + 6) % 7;
  const monday = addDays(date, -dayOfWeek);
  return Array.from({ length: 7 }, (_, i) => toKey(addDays(monday, i)));
}

export function weekdayShort(key: DayKey): string {
  const date = fromKey(key);
  return date ? WEEKDAYS_SHORT[date.getDay()]! : '';
}

/** "sexta-feira, 30 de agosto" */
export function longDate(key: DayKey): string {
  const date = fromKey(key);
  if (!date) return '';
  return `${WEEKDAYS_LONG[date.getDay()]}, ${date.getDate()} de ${MONTHS_LONG[date.getMonth()]}`;
}

export function dayOfMonth(key: DayKey): number | null {
  return fromKey(key)?.getDate() ?? null;
}

export function greeting(date: Date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 20) return 'Boa tarde';
  return 'Boa noite';
}

/* --- Month and year arithmetic -------------------------------------------- */

export const MONTHS_SHORT = [
  'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
  'jul', 'ago', 'set', 'out', 'nov', 'dez',
] as const;

export function startOfMonthKey(key: DayKey): DayKey {
  const date = fromKey(key);
  if (!date) return key;
  return toKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function endOfMonthKey(key: DayKey): DayKey {
  const date = fromKey(key);
  if (!date) return key;
  // Day 0 of the next month is the last day of this one.
  return toKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function daysInMonth(key: DayKey): number {
  const date = fromKey(key);
  if (!date) return 30;
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/**
 * Adds whole months, clamping the day so that adding one month to 31 January
 * lands on 28/29 February rather than skidding into March.
 */
export function addMonthsToKey(key: DayKey, months: number): DayKey {
  const date = fromKey(key);
  if (!date) return key;
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return toKey(target);
}

export function addYearsToKey(key: DayKey, years: number): DayKey {
  return addMonthsToKey(key, years * 12);
}

/** Monday of the week containing `key`. */
export function startOfWeekKey(key: DayKey): DayKey {
  const date = fromKey(key);
  if (!date) return key;
  return toKey(addDays(date, -((date.getDay() + 6) % 7)));
}

/** "agosto de 2026" */
export function monthLabel(key: DayKey): string {
  const date = fromKey(key);
  if (!date) return '';
  return `${MONTHS_LONG[date.getMonth()]} de ${date.getFullYear()}`;
}

/** "24 – 30 de agosto" */
export function weekLabel(key: DayKey): string {
  const start = fromKey(startOfWeekKey(key));
  const end = fromKey(addDaysToKey(startOfWeekKey(key), 6));
  if (!start || !end) return '';
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()} – ${end.getDate()} de ${MONTHS_LONG[start.getMonth()]}`;
  }
  return `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${end.getDate()} ${MONTHS_SHORT[end.getMonth()]}`;
}

/** "sexta, 30 de agosto" — shorter than longDate, for a header. */
export function mediumDate(key: DayKey): string {
  const date = fromKey(key);
  if (!date) return '';
  const weekday = WEEKDAYS_LONG[date.getDay()]!.replace('-feira', '');
  return `${weekday}, ${date.getDate()} de ${MONTHS_LONG[date.getMonth()]}`;
}

export function yearOf(key: DayKey): number {
  return fromKey(key)?.getFullYear() ?? new Date().getFullYear();
}

export function monthOf(key: DayKey): number {
  return fromKey(key)?.getMonth() ?? 0;
}

/**
 * The six-week grid a month view draws, Monday-first, including the leading and
 * trailing days that belong to the neighbouring months.
 */
export function monthGridKeys(key: DayKey): DayKey[] {
  const first = startOfMonthKey(key);
  const gridStart = startOfWeekKey(first);
  return Array.from({ length: 42 }, (_, i) => addDaysToKey(gridStart, i));
}
