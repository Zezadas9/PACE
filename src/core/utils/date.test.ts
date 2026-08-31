import { describe, expect, it } from 'vitest';
import {
  addDaysToKey, addMonthsToKey, addYearsToKey, ageFromBirthDate, daysInMonth,
  endOfMonthKey, isValidKey, monthGridKeys, monthLabel, startOfMonthKey,
  startOfWeekKey, toKey, weekKeys, weekLabel,
} from './date';

describe('toKey', () => {
  it('uses local time, not UTC', () => {
    // 23:30 local on the 30th must stay the 30th, whatever the offset is.
    expect(toKey(new Date(2026, 7, 30, 23, 30))).toBe('2026-08-30');
    expect(toKey(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });
});

describe('isValidKey', () => {
  it('rejects dates that do not exist', () => {
    expect(isValidKey('2026-08-30')).toBe(true);
    expect(isValidKey('2026-02-30')).toBe(false);
    expect(isValidKey('nonsense')).toBe(false);
  });
});

describe('ageFromBirthDate', () => {
  const reference = new Date(2026, 7, 30);

  it('counts whole calendar years', () => {
    expect(ageFromBirthDate('1990-01-01', reference)).toBe(36);
    expect(ageFromBirthDate('1990-08-30', reference)).toBe(36);
  });

  it('does not round up a birthday that has not happened yet', () => {
    expect(ageFromBirthDate('1990-08-31', reference)).toBe(35);
    expect(ageFromBirthDate('1990-12-31', reference)).toBe(35);
  });

  it('returns null for unusable input', () => {
    expect(ageFromBirthDate(null, reference)).toBeNull();
    expect(ageFromBirthDate('1800-01-01', reference)).toBeNull();
  });
});

describe('weekKeys', () => {
  it('starts on Monday', () => {
    const week = weekKeys(new Date(2026, 7, 30)); // a Sunday
    expect(week).toHaveLength(7);
    expect(week[0]).toBe('2026-08-24');
    expect(week[6]).toBe('2026-08-30');
  });
});

describe('addDaysToKey', () => {
  it('crosses month and year boundaries', () => {
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
  });
});

/* --- Month and year navigation ---------------------------------------------- */


describe('addMonthsToKey', () => {
  it('steps forward and back through a year', () => {
    expect(addMonthsToKey('2026-08-30', 1)).toBe('2026-09-30');
    expect(addMonthsToKey('2026-08-30', -1)).toBe('2026-07-30');
    expect(addMonthsToKey('2026-01-15', 12)).toBe('2027-01-15');
  });

  it('crosses the year boundary in both directions', () => {
    expect(addMonthsToKey('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonthsToKey('2026-01-15', -1)).toBe('2025-12-15');
  });

  it('clamps the day instead of skidding into the next month', () => {
    // 31 January + 1 month must be the end of February, not 3 March.
    expect(addMonthsToKey('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsToKey('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsToKey('2026-03-31', -1)).toBe('2026-02-28');
  });
});

describe('addYearsToKey', () => {
  it('handles a leap day landing on a common year', () => {
    expect(addYearsToKey('2028-02-29', 1)).toBe('2029-02-28');
    expect(addYearsToKey('2028-02-29', 4)).toBe('2032-02-29');
  });
});

describe('month boundaries', () => {
  it('finds the first and last day', () => {
    expect(startOfMonthKey('2026-08-30')).toBe('2026-08-01');
    expect(endOfMonthKey('2026-08-30')).toBe('2026-08-31');
    expect(endOfMonthKey('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonthKey('2028-02-10')).toBe('2028-02-29');
  });

  it('counts the days in a month', () => {
    expect(daysInMonth('2026-02-01')).toBe(28);
    expect(daysInMonth('2028-02-01')).toBe(29);
    expect(daysInMonth('2026-08-01')).toBe(31);
  });
});

describe('startOfWeekKey', () => {
  it('always lands on a Monday', () => {
    expect(startOfWeekKey('2026-08-30')).toBe('2026-08-24'); // Sunday -> that Monday
    expect(startOfWeekKey('2026-08-24')).toBe('2026-08-24'); // Monday -> itself
    expect(startOfWeekKey('2026-08-28')).toBe('2026-08-24'); // Friday
  });
});

describe('monthGridKeys', () => {
  it('returns six Monday-first weeks covering the month', () => {
    const grid = monthGridKeys('2026-08-15');
    expect(grid).toHaveLength(42);
    expect(grid[0]).toBe('2026-07-27');  // Monday before 1 August
    expect(grid).toContain('2026-08-01');
    expect(grid).toContain('2026-08-31');
    expect(grid.at(-1)).toBe('2026-09-06');
  });

  it('handles a month that starts on a Monday without a blank week', () => {
    const grid = monthGridKeys('2026-06-10'); // 1 June 2026 is a Monday
    expect(grid[0]).toBe('2026-06-01');
  });
});

describe('labels', () => {
  it('names the month and the week', () => {
    expect(monthLabel('2026-08-30')).toBe('agosto de 2026');
    expect(weekLabel('2026-08-30')).toBe('24 – 30 de agosto');
    expect(weekLabel('2026-08-31')).toBe('31 ago – 6 set');
  });
});
