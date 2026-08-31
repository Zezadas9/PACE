import { describe, expect, it } from 'vitest';
import { REMINDER_CONFIRM_THRESHOLD } from '../core/constants';
import { createCalendarEvent, createHabit, createSettings, createTask } from '../core/factories';
import type { NotificationSettings } from '../core/types';
import {
  habitReminderCount, isHighVolume, planEventReminders, planHabitReminders,
  planReminders, planTaskReminders, reminderId, windowTimes,
} from './notifications';

const DAY = '2026-08-30';

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return { ...createSettings().notifications, enabled: true, ...overrides };
}

describe('windowTimes', () => {
  it('fires once when there is no interval', () => {
    expect(windowTimes('09:00', '21:00', null)).toEqual(['09:00']);
  });

  it('repeats across the window, inclusive of both ends', () => {
    expect(windowTimes('08:00', '10:00', 60)).toEqual(['08:00', '09:00', '10:00']);
  });

  it('produces the brief example — every 30 minutes, 08:00 to 22:00', () => {
    const times = windowTimes('08:00', '22:00', 30);
    expect(times).toHaveLength(29);
    expect(times[0]).toBe('08:00');
    expect(times.at(-1)).toBe('22:00');
  });

  it('clamps to the global quiet-hours window', () => {
    const times = windowTimes('06:00', '23:00', 60, { startTime: '09:00', endTime: '11:00' });
    expect(times).toEqual(['09:00', '10:00', '11:00']);
  });

  it('yields nothing rather than wrapping past midnight', () => {
    expect(windowTimes('22:00', '06:00', 60)).toEqual([]);
  });

  it('refuses an interval below five minutes rather than flooding', () => {
    const times = windowTimes('08:00', '09:00', 1);
    expect(times).toHaveLength(13);
    expect(times[1]).toBe('08:05');
  });
});

describe('habitReminderCount and the confirmation threshold', () => {
  it('counts what a configuration would actually produce', () => {
    const habit = createHabit({
      title: 'Beber água',
      reminder: { enabled: true, startTime: '08:00', endTime: '22:00', intervalMinutes: 30 },
    });
    expect(habitReminderCount(habit, settings())).toBe(29);
    expect(isHighVolume(29)).toBe(true);
  });

  it('leaves a modest configuration alone', () => {
    const habit = createHabit({
      reminder: { enabled: true, startTime: '09:00', endTime: '12:00', intervalMinutes: 60 },
    });
    const count = habitReminderCount(habit, settings());
    expect(count).toBe(4);
    expect(isHighVolume(count)).toBe(false);
    expect(count).toBeLessThanOrEqual(REMINDER_CONFIRM_THRESHOLD);
  });

  it('is zero when the reminder is off', () => {
    expect(habitReminderCount(createHabit({ reminder: null }), settings())).toBe(0);
    expect(habitReminderCount(
      createHabit({
        reminder: { enabled: false, startTime: '08:00', endTime: '22:00', intervalMinutes: 30 },
      }),
      settings(),
    )).toBe(0);
  });
});

describe('planHabitReminders', () => {
  it('skips days the habit does not apply to', () => {
    const habit = createHabit({
      frequency: 'custom',
      weekdays: [1],
      startDate: '2026-08-01',
      reminder: { enabled: true, startTime: '09:00', endTime: '09:00', intervalMinutes: null },
    });
    expect(planHabitReminders(habit, DAY, settings())).toHaveLength(0);
    expect(planHabitReminders(habit, '2026-08-31', settings())).toHaveLength(1);
  });

  it('produces a stable key per habit, day and time', () => {
    const habit = createHabit({
      id: 'h1',
      startDate: null,
      reminder: { enabled: true, startTime: '09:00', endTime: '09:00', intervalMinutes: null },
    });
    const [reminder] = planHabitReminders(habit, DAY, settings());
    expect(reminder?.key).toBe('habit:h1:2026-08-30:09:00');
  });
});

describe('planEventReminders', () => {
  it('fires the configured lead time before the start', () => {
    const event = createCalendarEvent({
      date: DAY, startTime: '15:00', reminder: { enabled: true, minutesBefore: 30 },
    });
    const [reminder] = planEventReminders(event, DAY);
    expect(reminder?.at.getHours()).toBe(14);
    expect(reminder?.at.getMinutes()).toBe(30);
  });

  it('follows the recurrence rather than only the anchor day', () => {
    const event = createCalendarEvent({
      date: '2026-08-24',
      startTime: '10:00',
      recurrence: { kind: 'weekly', interval: 1, weekdays: [1], until: null },
      reminder: { enabled: true, minutesBefore: 10 },
    });
    expect(planEventReminders(event, '2026-08-31')).toHaveLength(1);
    expect(planEventReminders(event, '2026-09-01')).toHaveLength(0);
  });
});

describe('planTaskReminders', () => {
  it('says nothing about a task already done', () => {
    const base = {
      date: DAY,
      time: '18:00',
      reminder: { enabled: true, minutesBefore: 0 },
    };
    expect(planTaskReminders(createTask(base), DAY)).toHaveLength(1);
    expect(planTaskReminders(createTask({ ...base, status: 'done' as const }), DAY)).toHaveLength(0);
  });
});

describe('planReminders', () => {
  const habit = createHabit({
    id: 'h1',
    startDate: null,
    reminder: { enabled: true, startTime: '08:00', endTime: '20:00', intervalMinutes: 240 },
  });

  it('schedules nothing at all while notifications are disabled', () => {
    const plan = planReminders(
      { habits: [habit], events: [], tasks: [] },
      [DAY],
      settings({ enabled: false }),
      new Date(2026, 7, 30, 7, 0),
    );
    expect(plan.reminders).toHaveLength(0);
  });

  it('drops instants already in the past, so opening the app is quiet', () => {
    const plan = planReminders(
      { habits: [habit], events: [], tasks: [] },
      [DAY],
      settings(),
      new Date(2026, 7, 30, 13, 0),
    );
    expect(plan.reminders.map((r) => r.at.getHours())).toEqual([16, 20]);
  });

  it('sorts by time across sources', () => {
    const event = createCalendarEvent({
      date: DAY, startTime: '09:00', reminder: { enabled: true, minutesBefore: 0 },
    });
    const plan = planReminders(
      { habits: [habit], events: [event], tasks: [] },
      [DAY],
      settings(),
      new Date(2026, 7, 30, 7, 0),
    );
    const times = plan.reminders.map((r) => r.at.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });

  it('caps the total handed to the OS', () => {
    const noisy = createHabit({
      id: 'noisy',
      startDate: null,
      reminder: { enabled: true, startTime: '00:00', endTime: '23:55', intervalMinutes: 5 },
    });
    const plan = planReminders(
      { habits: [noisy], events: [], tasks: [] },
      [DAY, '2026-08-31', '2026-09-01'],
      settings({ startTime: '00:00', endTime: '23:55' }),
      new Date(2026, 7, 30, 0, 0),
    );
    expect(plan.truncated).toBe(true);
    expect(plan.reminders.length).toBeLessThanOrEqual(64);
    expect(plan.requested).toBeGreaterThan(plan.reminders.length);
  });
});

describe('reminderId', () => {
  it('is stable and non-negative', () => {
    const key = 'habit:h1:2026-08-30:09:00';
    expect(reminderId(key)).toBe(reminderId(key));
    expect(reminderId(key)).toBeGreaterThanOrEqual(0);
    expect(reminderId('a')).not.toBe(reminderId('b'));
  });
});
