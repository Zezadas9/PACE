/**
 * PACE — Activity service.
 *
 * Owns the session lifecycle (start, pause, resume, finish), manual entry, and
 * activity goals.
 *
 * Location comes through `GeolocationPort`, never through `navigator` directly:
 * on the web that is the browser API, and on device it becomes the native one
 * with background permissions, without a line changing here. The same seam is
 * where HealthKit and Health Connect will hand us imported sessions.
 */

import { TRACK_MAX_ACCURACY_M } from '../core/constants';
import type {
  ActivityGoal, ActivitySession, ActivityTrackPoint, ActivityType, DayKey,
} from '../core/types';
import { todayKey } from '../core/utils/date';
import * as activity from '../domain/activity';
import type { Repositories } from '../data/repositories';
import type { Platform, Position } from '../platform/types';

/* --- The live session --------------------------------------------------------- */

/** The one session currently being tracked, if any. */
export function activeSession(repos: Repositories): ActivitySession | null {
  return repos.activitySessions
    .where((session) => session.startedAt !== null && session.endedAt === null)
    .sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))[0] ?? null;
}

export function startSession(
  repos: Repositories,
  type: ActivityType,
  date: DayKey = todayKey(),
): ActivitySession {
  return repos.activitySessions.create({
    type,
    date,
    startedAt: new Date().toISOString(),
    endedAt: null,
    pausedAt: null,
    pausedTotalSec: 0,
    track: [],
    distanceM: 0,
    source: 'manual',
  });
}

export function pauseSession(repos: Repositories, sessionId: string): void {
  const session = repos.activitySessions.byId(sessionId);
  if (!session || session.pausedAt) return;
  repos.activitySessions.update(sessionId, { pausedAt: new Date().toISOString() });
}

export function resumeSession(repos: Repositories, sessionId: string): void {
  const session = repos.activitySessions.byId(sessionId);
  if (!session?.pausedAt) return;
  const pausedFor = Math.max(0, (Date.now() - new Date(session.pausedAt).getTime()) / 1000);
  repos.activitySessions.update(sessionId, {
    pausedAt: null,
    pausedTotalSec: session.pausedTotalSec + Math.round(pausedFor),
  });
}

/**
 * Appends a fix to the track.
 *
 * Two filters, both necessary: a fix the phone admits is inaccurate is thrown
 * away, and one too close to the last is ignored — otherwise standing at a
 * traffic light adds a hundred metres of scribble to the route.
 */
export function recordPosition(
  repos: Repositories,
  sessionId: string,
  position: Position,
): void {
  const session = repos.activitySessions.byId(sessionId);
  if (!session || !activity.isRunning(session) || session.pausedAt) return;
  if (position.accuracyM != null && position.accuracyM > TRACK_MAX_ACCURACY_M) return;

  const candidate = { lat: position.latitude, lon: position.longitude };
  if (!activity.shouldRecordPoint(session.track, candidate)) return;

  const started = session.startedAt ? new Date(session.startedAt).getTime() : Date.now();
  const point: ActivityTrackPoint = {
    ...candidate,
    t: Math.max(0, position.timestamp - started),
    altitudeM: position.altitudeM,
  };

  const track = [...session.track, point];
  repos.activitySessions.update(sessionId, {
    track,
    distanceM: activity.trackDistanceM(track),
    elevationGainM: activity.trackElevationGainM(track),
  });
}

export interface FinishInput {
  notes?: string | null;
  calories?: number | null;
  avgHeartRate?: number | null;
}

export function finishSession(
  repos: Repositories,
  sessionId: string,
  input: FinishInput = {},
): ActivitySession | null {
  const session = repos.activitySessions.byId(sessionId);
  if (!session) return null;

  // Resolve any open pause first, so the duration below is honest.
  if (session.pausedAt) resumeSession(repos, sessionId);
  const current = repos.activitySessions.byId(sessionId)!;

  const now = new Date();
  const durationSec = activity.elapsedSec(current, now);
  const distanceM = current.track.length > 1
    ? activity.trackDistanceM(current.track)
    : current.distanceM;

  return repos.activitySessions.update(sessionId, {
    endedAt: now.toISOString(),
    durationSec,
    distanceM,
    avgPaceSecPerKm: activity.paceSecPerKm(distanceM, durationSec),
    notes: input.notes ?? current.notes,
    calories: input.calories ?? current.calories,
    avgHeartRate: input.avgHeartRate ?? current.avgHeartRate,
  });
}

/** Abandons a session outright. Used when the user discards a false start. */
export function discardSession(repos: Repositories, sessionId: string): void {
  repos.activitySessions.remove(sessionId);
}

/**
 * Subscribes to the GPS and feeds the session.
 *
 * Returns the unsubscribe function. The caller owns the lifetime; nothing here
 * keeps watching after the screen goes away.
 */
export function trackSession(
  repos: Repositories,
  platform: Platform,
  sessionId: string,
): () => void {
  return platform.geolocation.watch((position) => {
    recordPosition(repos, sessionId, position);
  });
}

/* --- Manual entry --------------------------------------------------------------- */

export interface ManualEntry {
  type: ActivityType;
  date: DayKey;
  durationSec: number | null;
  distanceM: number | null;
  avgHeartRate: number | null;
  calories: number | null;
  elevationGainM: number | null;
  notes: string | null;
}

export function emptyManualEntry(date: DayKey = todayKey()): ManualEntry {
  return {
    type: 'run',
    date,
    durationSec: null,
    distanceM: null,
    avgHeartRate: null,
    calories: null,
    elevationGainM: null,
    notes: null,
  };
}

export function entryFromSession(session: ActivitySession): ManualEntry {
  return {
    type: session.type,
    date: session.date,
    durationSec: session.durationSec,
    distanceM: session.distanceM,
    avgHeartRate: session.avgHeartRate,
    calories: session.calories,
    elevationGainM: session.elevationGainM,
    notes: session.notes,
  };
}

/**
 * Saves a hand-entered session.
 *
 * Marked finished on the spot — something typed in after the fact is history,
 * not a session in progress. Pace is derived rather than asked for: a user who
 * knows their distance and time should not also have to do the division.
 */
export function saveManual(
  repos: Repositories,
  entry: ManualEntry,
  existingId?: string,
): ActivitySession {
  const timestamp = new Date().toISOString();
  const payload = {
    type: entry.type,
    date: entry.date,
    durationSec: entry.durationSec,
    distanceM: entry.distanceM,
    avgHeartRate: entry.avgHeartRate,
    calories: entry.calories,
    elevationGainM: entry.elevationGainM,
    notes: entry.notes,
    avgPaceSecPerKm: activity.paceSecPerKm(entry.distanceM, entry.durationSec),
    endedAt: timestamp,
    source: 'manual' as const,
  };

  if (existingId) {
    const updated = repos.activitySessions.update(existingId, payload);
    if (updated) return updated;
  }
  return repos.activitySessions.create({ ...payload, startedAt: timestamp });
}

export function deleteSession(repos: Repositories, sessionId: string): void {
  repos.activitySessions.remove(sessionId);
}

/* --- Goals ------------------------------------------------------------------------ */

export function saveGoal(
  repos: Repositories,
  goal: ActivityGoal,
  existingId?: string,
): ActivityGoal {
  if (existingId) {
    const updated = repos.activityGoals.update(existingId, goal);
    if (updated) return updated;
  }
  return repos.activityGoals.insert(goal);
}

export function deleteGoal(repos: Repositories, goalId: string): void {
  repos.activityGoals.remove(goalId);
}

/** Progress on every active goal — read by the activity screen and the dashboard. */
export function goalProgress(
  repos: Repositories,
  date: DayKey = todayKey(),
): activity.GoalProgress[] {
  return activity.activeGoalProgress(
    repos.activityGoals.all(),
    repos.activitySessions.all(),
    date,
  );
}

/* --- Screen models ----------------------------------------------------------------- */

export interface ActivityOverview {
  today: ActivitySession[];
  running: ActivitySession | null;
  recent: ActivitySession[];
  totals: activity.ActivityTotals;
  weeks: activity.PeriodBucket[];
  goals: activity.GoalProgress[];
}

export function overview(
  repos: Repositories,
  date: DayKey = todayKey(),
): ActivityOverview {
  const sessions = repos.activitySessions.all();
  return {
    today: sessions.filter((session) => session.date === date && session.endedAt !== null),
    running: activeSession(repos),
    recent: activity.history(sessions, 12),
    totals: activity.totals(sessions),
    weeks: activity.weeklyBuckets(sessions, 8, date),
    goals: goalProgress(repos, date),
  };
}
