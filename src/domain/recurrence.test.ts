import { describe, expect, it } from 'vitest';
import { noRecurrence, type Recurrence } from '../core/scheduling';
import {
  daysBetween, describeRecurrence, nextOccurrence, occursOn, occurrencesBetween,
} from './recurrence';

function rule(partial: Partial<Recurrence>): Recurrence {
  return { ...noRecurrence(), ...partial };
}

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-08-30', '2026-09-02')).toBe(3);
    expect(daysBetween('2026-09-02', '2026-08-30')).toBe(-3);
    expect(daysBetween('2026-08-30', '2026-08-30')).toBe(0);
  });

  it('crosses a leap day', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
  });
});

describe('occursOn — none', () => {
  it('fires only on its anchor', () => {
    const r = rule({ kind: 'none' });
    expect(occursOn(r, '2026-08-30', '2026-08-30')).toBe(true);
    expect(occursOn(r, '2026-08-30', '2026-08-31')).toBe(false);
  });
});

describe('occursOn — daily', () => {
  it('honours the interval', () => {
    const every3 = rule({ kind: 'daily', interval: 3 });
    expect(occursOn(every3, '2026-08-30', '2026-08-30')).toBe(true);
    expect(occursOn(every3, '2026-08-30', '2026-09-01')).toBe(false);
    expect(occursOn(every3, '2026-08-30', '2026-09-02')).toBe(true);
  });

  it('never fires before the anchor', () => {
    const daily = rule({ kind: 'daily' });
    expect(occursOn(daily, '2026-08-30', '2026-08-29')).toBe(false);
  });

  it('stops at until', () => {
    const bounded = rule({ kind: 'daily', until: '2026-09-01' });
    expect(occursOn(bounded, '2026-08-30', '2026-09-01')).toBe(true);
    expect(occursOn(bounded, '2026-08-30', '2026-09-02')).toBe(false);
  });
});

describe('occursOn — weekly', () => {
  // 2026-08-24 is a Monday.
  it('fires on the listed weekdays', () => {
    const monFri = rule({ kind: 'weekly', weekdays: [1, 5] });
    expect(occursOn(monFri, '2026-08-24', '2026-08-24')).toBe(true); // Mon
    expect(occursOn(monFri, '2026-08-24', '2026-08-28')).toBe(true); // Fri
    expect(occursOn(monFri, '2026-08-24', '2026-08-26')).toBe(false); // Wed
  });

  it('falls back to the anchor weekday when none are listed', () => {
    const weekly = rule({ kind: 'weekly' });
    expect(occursOn(weekly, '2026-08-26', '2026-09-02')).toBe(true); // both Wed
    expect(occursOn(weekly, '2026-08-26', '2026-09-03')).toBe(false);
  });

  it('counts whole weeks for an interval, not raw day gaps', () => {
    const biweekly = rule({ kind: 'weekly', interval: 2, weekdays: [1, 5] });
    expect(occursOn(biweekly, '2026-08-24', '2026-08-28')).toBe(true);  // same week
    expect(occursOn(biweekly, '2026-08-24', '2026-08-31')).toBe(false); // week +1
    expect(occursOn(biweekly, '2026-08-24', '2026-09-07')).toBe(true);  // week +2
  });
});

describe('occursOn — monthly', () => {
  it('keeps the day of the month', () => {
    const monthly = rule({ kind: 'monthly' });
    expect(occursOn(monthly, '2026-01-15', '2026-02-15')).toBe(true);
    expect(occursOn(monthly, '2026-01-15', '2026-02-16')).toBe(false);
  });

  it('skips months without that day rather than clamping', () => {
    // A rule anchored to the 31st must not invent an occurrence in February.
    const monthly = rule({ kind: 'monthly' });
    expect(occursOn(monthly, '2026-01-31', '2026-02-28')).toBe(false);
    expect(occursOn(monthly, '2026-01-31', '2026-03-31')).toBe(true);
  });

  it('honours the interval', () => {
    const quarterly = rule({ kind: 'monthly', interval: 3 });
    expect(occursOn(quarterly, '2026-01-10', '2026-04-10')).toBe(true);
    expect(occursOn(quarterly, '2026-01-10', '2026-03-10')).toBe(false);
  });
});

describe('occursOn — yearly', () => {
  it('matches the same month and day', () => {
    const yearly = rule({ kind: 'yearly' });
    expect(occursOn(yearly, '2026-03-02', '2027-03-02')).toBe(true);
    expect(occursOn(yearly, '2026-03-02', '2027-03-03')).toBe(false);
  });

  it('skips non-leap years for a 29 February anchor', () => {
    const yearly = rule({ kind: 'yearly' });
    expect(occursOn(yearly, '2028-02-29', '2029-02-28')).toBe(false);
    expect(occursOn(yearly, '2028-02-29', '2032-02-29')).toBe(true);
  });
});

describe('occurrencesBetween', () => {
  it('lists every hit inside the window', () => {
    const monWed = rule({ kind: 'weekly', weekdays: [1, 3] });
    expect(occurrencesBetween(monWed, '2026-08-24', '2026-08-24', '2026-08-30'))
      .toEqual(['2026-08-24', '2026-08-26']);
  });

  it('clips to the anchor when the window starts earlier', () => {
    const daily = rule({ kind: 'daily' });
    expect(occurrencesBetween(daily, '2026-08-29', '2026-08-27', '2026-08-31'))
      .toEqual(['2026-08-29', '2026-08-30', '2026-08-31']);
  });

  it('returns nothing for an inverted window', () => {
    expect(occurrencesBetween(rule({ kind: 'daily' }), '2026-08-01', '2026-08-10', '2026-08-05'))
      .toEqual([]);
  });
});

describe('nextOccurrence', () => {
  it('finds the next hit on or after a date', () => {
    const monthly = rule({ kind: 'monthly' });
    expect(nextOccurrence(monthly, '2026-01-31', '2026-02-01')).toBe('2026-03-31');
  });

  it('returns null past the until bound', () => {
    const bounded = rule({ kind: 'daily', until: '2026-08-31' });
    expect(nextOccurrence(bounded, '2026-08-30', '2026-09-05')).toBeNull();
  });
});

describe('describeRecurrence', () => {
  it('reads back in Portuguese', () => {
    expect(describeRecurrence(rule({ kind: 'none' }), '2026-08-30')).toBe('Não repete');
    expect(describeRecurrence(rule({ kind: 'daily' }), '2026-08-30')).toBe('Todos os dias');
    expect(describeRecurrence(rule({ kind: 'daily', interval: 3 }), '2026-08-30'))
      .toBe('De 3 em 3 dias');
    expect(describeRecurrence(rule({ kind: 'weekly', weekdays: [1, 5] }), '2026-08-24'))
      .toBe('Todas as semanas — seg, sex');
  });
});
