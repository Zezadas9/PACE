/**
 * PACE — Recurrence.
 *
 * Answers one question — does this rule produce an occurrence on this day? —
 * and a range version of it. Pure, so every awkward case (interval arithmetic,
 * short months, leap days, an `until` bound) is testable without a calendar
 * on screen.
 *
 * Monthly and yearly rules deliberately *skip* rather than clamp: a rule
 * anchored to the 31st produces nothing in February. Clamping to the 28th
 * would silently invent an occurrence the user never asked for, and would make
 * "every 31st" drift into "the end of every month".
 */

import type { Recurrence } from '../core/scheduling';
import type { DayKey } from '../core/types';
import { addDaysToKey, fromKey, toKey } from '../core/utils/date';

const MS_PER_DAY = 86_400_000;

/** Whole days between two day keys, using local midnights. */
export function daysBetween(from: DayKey, to: DayKey): number | null {
  const start = fromKey(from);
  const end = fromKey(to);
  if (!start || !end) return null;
  // Round rather than floor: a DST transition shifts the difference by an hour.
  return Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
}

function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

/**
 * @param rule       the recurrence
 * @param anchor     the day the rule is anchored to (the first occurrence)
 * @param target     the day being tested
 */
export function occursOn(rule: Recurrence, anchor: DayKey, target: DayKey): boolean {
  const start = fromKey(anchor);
  const day = fromKey(target);
  if (!start || !day) return false;

  // Nothing ever occurs before its anchor, or after `until`.
  if (target < anchor) return false;
  if (rule.until && target > rule.until) return false;

  const interval = Math.max(1, Math.floor(rule.interval) || 1);

  switch (rule.kind) {
    case 'none':
      return target === anchor;

    case 'daily': {
      const delta = daysBetween(anchor, target);
      return delta != null && delta % interval === 0;
    }

    case 'weekly': {
      const weekdays = rule.weekdays.length > 0 ? rule.weekdays : [start.getDay()];
      if (!weekdays.includes(day.getDay())) return false;
      // Compare the Mondays of each week so an interval counts whole weeks,
      // not the raw day gap — otherwise "every 2 weeks on Mon+Fri" breaks.
      const startWeek = startOfWeek(start);
      const targetWeek = startOfWeek(day);
      const weeks = Math.round((targetWeek.getTime() - startWeek.getTime()) / (MS_PER_DAY * 7));
      return weeks >= 0 && weeks % interval === 0;
    }

    case 'monthly': {
      if (day.getDate() !== start.getDate()) return false;
      const months = monthsBetween(start, day);
      return months >= 0 && months % interval === 0;
    }

    case 'yearly': {
      if (day.getDate() !== start.getDate() || day.getMonth() !== start.getMonth()) {
        return false;
      }
      const years = day.getFullYear() - start.getFullYear();
      return years >= 0 && years % interval === 0;
    }

    default:
      return false;
  }
}

function startOfWeek(date: Date): Date {
  const offset = (date.getDay() + 6) % 7; // Monday-based
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
  return result;
}

/**
 * Every occurrence between `from` and `to`, inclusive.
 *
 * Walks day by day. The window is always a screenful — a day, a week, a month,
 * at most a year — so this stays cheap and cannot produce a runaway sequence
 * the way an open-ended generator can.
 */
export function occurrencesBetween(
  rule: Recurrence,
  anchor: DayKey,
  from: DayKey,
  to: DayKey,
): DayKey[] {
  const span = daysBetween(from, to);
  if (span == null || span < 0) return [];

  const out: DayKey[] = [];
  let cursor = from < anchor ? anchor : from;
  const total = daysBetween(cursor, to);
  if (total == null || total < 0) return [];

  for (let i = 0; i <= total; i += 1) {
    if (occursOn(rule, anchor, cursor)) out.push(cursor);
    cursor = addDaysToKey(cursor, 1);
  }
  return out;
}

/** The next occurrence on or after `from`, or null within the lookahead. */
export function nextOccurrence(
  rule: Recurrence,
  anchor: DayKey,
  from: DayKey,
  lookaheadDays = 366,
): DayKey | null {
  let cursor = from < anchor ? anchor : from;
  for (let i = 0; i <= lookaheadDays; i += 1) {
    if (occursOn(rule, anchor, cursor)) return cursor;
    if (rule.until && cursor > rule.until) return null;
    cursor = addDaysToKey(cursor, 1);
  }
  return null;
}

/** Human summary for a form and for a list row. */
export function describeRecurrence(rule: Recurrence, anchor: DayKey): string {
  const interval = Math.max(1, Math.floor(rule.interval) || 1);
  const start = fromKey(anchor);
  const NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  switch (rule.kind) {
    case 'none':
      return 'Não repete';
    case 'daily':
      return interval === 1 ? 'Todos os dias' : `De ${interval} em ${interval} dias`;
    case 'weekly': {
      const days = rule.weekdays.length > 0 ? rule.weekdays : start ? [start.getDay()] : [];
      const list = days
        .slice()
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((d) => NAMES[d])
        .join(', ');
      const cadence = interval === 1 ? 'Todas as semanas' : `De ${interval} em ${interval} semanas`;
      return list ? `${cadence} — ${list}` : cadence;
    }
    case 'monthly':
      return interval === 1
        ? `Todos os meses, dia ${start?.getDate() ?? ''}`
        : `De ${interval} em ${interval} meses`;
    case 'yearly':
      return interval === 1 ? 'Todos os anos' : `De ${interval} em ${interval} anos`;
    default:
      return 'Não repete';
  }
}

/** Re-exported so callers building a range do not also import date utils. */
export { toKey };
