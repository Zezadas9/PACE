/**
 * PACE — Notification service.
 *
 * Bridges the pure planner in `domain/notifications.ts` to the platform port.
 * Nothing here knows what a Capacitor plugin is; on the web the port reports
 * itself unavailable and the whole thing becomes a no-op that still computes a
 * correct, inspectable plan.
 *
 * The rule the brief asks for — never flood the user — is enforced in two
 * places: a per-habit threshold that forces an explicit confirmation before a
 * high-volume reminder is saved, and a hard ceiling on what is ever handed to
 * the OS.
 */

import { addDaysToKey, todayKey } from '../core/utils/date';
import type { DayKey, Habit, NotificationSettings } from '../core/types';
import {
  habitReminderCount, isHighVolume, planReminders, reminderId,
  type PlannedReminder,
} from '../domain/notifications';
import type { Repositories } from '../data/repositories';
import type { Platform, PermissionState } from '../platform/types';

/** How far ahead reminders are scheduled. Refreshed whenever data changes. */
export const SCHEDULE_HORIZON_DAYS = 3;

export interface SyncResult {
  scheduled: number;
  requested: number;
  truncated: boolean;
  /** Why nothing was scheduled, when nothing was. */
  skipped: 'disabled' | 'unavailable' | 'denied' | null;
}

function horizonDays(from: DayKey = todayKey()): DayKey[] {
  return Array.from({ length: SCHEDULE_HORIZON_DAYS }, (_, i) => addDaysToKey(from, i));
}

/** The plan the settings screen shows, without touching the OS. */
export function previewPlan(
  repos: Repositories,
  settings: NotificationSettings,
  now: Date = new Date(),
): { reminders: PlannedReminder[]; requested: number; truncated: boolean } {
  return planReminders(
    { habits: repos.habits.all(), events: repos.events.all(), tasks: repos.tasks.all() },
    horizonDays(),
    settings,
    now,
  );
}

/**
 * Replaces the scheduled set with the current plan.
 *
 * Cancel-then-schedule rather than diffing: the horizon is small, the ids are
 * derived from stable keys, and an exact mirror of the plan is far easier to
 * reason about than an incremental reconciliation that can drift.
 */
export async function syncReminders(
  repos: Repositories,
  platform: Platform,
  now: Date = new Date(),
): Promise<SyncResult> {
  const settings = repos.settings.get().notifications;

  if (!settings.enabled) {
    await platform.notifications.cancelAll().catch(() => {});
    return { scheduled: 0, requested: 0, truncated: false, skipped: 'disabled' };
  }

  if (!(await platform.notifications.isAvailable())) {
    return { scheduled: 0, requested: 0, truncated: false, skipped: 'unavailable' };
  }

  const permission = await platform.notifications.checkPermission();
  if (permission !== 'granted') {
    return { scheduled: 0, requested: 0, truncated: false, skipped: 'denied' };
  }

  const plan = previewPlan(repos, settings, now);
  await platform.notifications.cancelAll();

  for (const reminder of plan.reminders) {
    await platform.notifications.schedule({
      id: reminderId(reminder.key),
      title: reminder.title,
      body: reminder.body,
      at: reminder.at,
      repeats: null,
      route: reminder.route,
    });
  }

  return {
    scheduled: plan.reminders.length,
    requested: plan.requested,
    truncated: plan.truncated,
    skipped: null,
  };
}

/**
 * Asks the OS, records that we asked, and reports the outcome.
 *
 * `permissionRequested` is stored so the settings screen can tell "never asked"
 * apart from "asked and refused" — the two need different copy, and on iOS the
 * prompt is one-shot.
 */
export async function requestPermission(
  repos: Repositories,
  platform: Platform,
): Promise<PermissionState> {
  const state = await platform.notifications.requestPermission();
  repos.settings.update({ permissionRequested: true });
  return state;
}

export async function setEnabled(
  repos: Repositories,
  platform: Platform,
  enabled: boolean,
): Promise<PermissionState> {
  if (!enabled) {
    repos.settings.update({ enabled: false });
    await platform.notifications.cancelAll().catch(() => {});
    return 'prompt';
  }

  let state = await platform.notifications.checkPermission();
  if (state === 'prompt') state = await requestPermission(repos, platform);
  repos.settings.update({ enabled: state === 'granted' });
  return state;
}

/* --- The anti-flood guard -------------------------------------------------- */

export interface VolumeCheck {
  count: number;
  high: boolean;
  message: string;
}

/**
 * How many reminders a habit would produce per day, and whether that is enough
 * to warrant asking first. Called by the habit form before saving.
 */
export function checkHabitVolume(
  habit: Habit,
  settings: NotificationSettings,
): VolumeCheck {
  const count = habitReminderCount(habit, settings);
  const high = isHighVolume(count);
  return {
    count,
    high,
    message: high
      ? `Esta configuração gera ${count} notificações por dia para "${habit.title || 'este hábito'}". Queres mesmo?`
      : `${count} notificação${count === 1 ? '' : 's'} por dia.`,
  };
}
