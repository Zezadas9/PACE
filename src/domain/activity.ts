/**
 * PACE — Activity.
 *
 * Distance from GPS, pace and speed from distance and time, and progress
 * against a goal. Pure: the live tracker feeds it points and reads numbers
 * back, and every awkward case is testable without a phone moving.
 */

import { paceModeFor, TRACK_MIN_DISTANCE_M } from '../core/constants';
import type {
  ActivityGoal, ActivitySession, ActivityTrackPoint, ActivityType, DayKey,
} from '../core/types';
import { startOfWeekKey, todayKey } from '../core/utils/date';
import { addDaysToKey } from '../core/utils/date';

const EARTH_RADIUS_M = 6_371_008.8;

/**
 * Great-circle distance between two fixes.
 *
 * Haversine rather than the flat-earth shortcut: over a few metres they agree,
 * but the error grows with latitude and a long ride would drift noticeably.
 */
export function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Total distance along a track, in metres. */
export function trackDistanceM(track: ActivityTrackPoint[]): number {
  let total = 0;
  for (let i = 1; i < track.length; i += 1) {
    total += haversineM(track[i - 1]!, track[i]!);
  }
  return Math.round(total);
}

/**
 * Cumulative climb, counting only rises above a threshold.
 *
 * Consumer GPS altitude wobbles by several metres while standing still; without
 * a floor, a flat walk reports hundreds of metres of ascent.
 */
export function trackElevationGainM(track: ActivityTrackPoint[], thresholdM = 3): number {
  let gain = 0;
  let reference: number | null = null;

  for (const point of track) {
    if (point.altitudeM == null) continue;
    if (reference == null) { reference = point.altitudeM; continue; }
    const delta = point.altitudeM - reference;
    if (delta >= thresholdM) { gain += delta; reference = point.altitudeM; }
    else if (delta <= -thresholdM) { reference = point.altitudeM; }
  }
  return Math.round(gain);
}

/** True when a new fix is far enough from the last to be movement, not noise. */
export function shouldRecordPoint(
  track: ActivityTrackPoint[],
  candidate: { lat: number; lon: number },
  minDistanceM = TRACK_MIN_DISTANCE_M,
): boolean {
  const last = track[track.length - 1];
  if (!last) return true;
  return haversineM(last, candidate) >= minDistanceM;
}

/* --- Derived metrics -------------------------------------------------------- */

/** Seconds per kilometre. Null when there is nothing to divide. */
export function paceSecPerKm(distanceM: number | null, durationSec: number | null): number | null {
  if (!distanceM || !durationSec || distanceM <= 0 || durationSec <= 0) return null;
  return Math.round((durationSec / distanceM) * 1000);
}

/** Metres per second. */
export function speedMs(distanceM: number | null, durationSec: number | null): number | null {
  if (!distanceM || !durationSec || durationSec <= 0) return null;
  return distanceM / durationSec;
}

/** Kilometres per hour, to one decimal. */
export function speedKmh(distanceM: number | null, durationSec: number | null): number | null {
  const ms = speedMs(distanceM, durationSec);
  return ms == null ? null : Math.round(ms * 3.6 * 10) / 10;
}

/**
 * Elapsed seconds, excluding time spent paused.
 *
 * Finished sessions report what was stored; a running one is measured from the
 * clock, because the phone may have been asleep and no timer was ticking.
 */
export function elapsedSec(session: ActivitySession, now: Date = new Date()): number {
  if (session.durationSec != null) return session.durationSec;
  if (!session.startedAt) return 0;

  const started = new Date(session.startedAt).getTime();
  const paused = session.pausedAt ? new Date(session.pausedAt).getTime() : null;
  const end = paused ?? now.getTime();
  const gross = Math.max(0, Math.round((end - started) / 1000));
  return Math.max(0, gross - Math.round(session.pausedTotalSec));
}

export function isRunning(session: ActivitySession): boolean {
  return session.startedAt !== null && session.endedAt === null;
}

export interface ActivityMetrics {
  durationSec: number;
  distanceM: number | null;
  paceSecPerKm: number | null;
  speedKmh: number | null;
  elevationGainM: number | null;
  calories: number | null;
  avgHeartRate: number | null;
  /** Which of pace or speed this activity should be read by. */
  paceMode: ReturnType<typeof paceModeFor>;
}

export function metricsOf(session: ActivitySession, now?: Date): ActivityMetrics {
  const duration = elapsedSec(session, now);
  const distance = session.distanceM ?? (session.track.length > 1
    ? trackDistanceM(session.track)
    : null);

  return {
    durationSec: duration,
    distanceM: distance,
    // A stored average wins: a device that reported one knows better than we do.
    paceSecPerKm: session.avgPaceSecPerKm ?? paceSecPerKm(distance, duration),
    speedKmh: speedKmh(distance, duration),
    elevationGainM: session.elevationGainM
      ?? (session.track.length > 1 ? trackElevationGainM(session.track) : null),
    calories: session.calories,
    avgHeartRate: session.avgHeartRate,
    paceMode: paceModeFor(session.type),
  };
}

/* --- Goals ------------------------------------------------------------------- */

export interface GoalWindow {
  from: DayKey;
  to: DayKey;
}

/**
 * The window a goal is measured over, containing `date`.
 *
 * "Total" não tem janela: é um objetivo acumulado desde sempre, por isso abre
 * numa data anterior a qualquer registo possível.
 */
export function goalWindow(goal: ActivityGoal, date: DayKey = todayKey()): GoalWindow {
  if (goal.period === 'day') return { from: date, to: date };
  if (goal.period === 'total') return { from: '0000-01-01' as DayKey, to: date };
  if (goal.period === 'month') {
    const month = date.slice(0, 7);
    return { from: `${month}-01` as DayKey, to: `${month}-31` as DayKey };
  }
  const start = startOfWeekKey(date);
  return { from: start, to: addDaysToKey(start, 6) };
}

export interface GoalProgress {
  goal: ActivityGoal;
  window: GoalWindow;
  /**
   * Metros, segundos, uma contagem, um ritmo (s/km) ou uma velocidade (km/h ×
   * 10), conforme a métrica. Null quando ainda não há nada medido — um ritmo
   * médio sem sessões não é zero, é inexistente.
   */
  current: number | null;
  target: number;
  /** 0..1, clamped. */
  ratio: number;
  complete: boolean;
  /** How much is still missing, never negative. */
  remaining: number;
  /** No ritmo, menor é melhor; em tudo o resto, maior. */
  lowerIsBetter: boolean;
  /** Quantas sessões entraram na conta, para a UI poder explicar o número. */
  sessions: number;
}

/** Only finished sessions count; a run in progress is not yet a run done. */
function countsToward(goal: ActivityGoal, session: ActivitySession, window: GoalWindow): boolean {
  if (session.endedAt === null) return false;
  if (session.date < window.from || session.date > window.to) return false;
  if (goal.activityType && session.type !== goal.activityType) return false;
  return true;
}

export function goalProgress(
  goal: ActivityGoal,
  sessions: ActivitySession[],
  date: DayKey = todayKey(),
): GoalProgress {
  const window = goalWindow(goal, date);
  const matching = sessions.filter((session) => countsToward(goal, session, window));
  const target = Math.max(1, goal.target);
  const lowerIsBetter = goal.metric === 'pace';

  const distance = matching.reduce((sum, session) => sum + (session.distanceM ?? 0), 0);
  const duration = matching.reduce((sum, session) => sum + (session.durationSec ?? 0), 0);

  let current: number | null;
  if (goal.metric === 'sessions') current = matching.length;
  else if (goal.metric === 'distance') current = Math.round(distance);
  else if (goal.metric === 'duration') current = duration;
  else if (goal.metric === 'pace') current = paceSecPerKm(distance, duration);
  // A velocidade guarda-se em décimas de km/h para o objetivo continuar a ser
  // um inteiro, como todas as outras métricas.
  else current = speedKmh(distance, duration) == null
    ? null
    : Math.round((speedKmh(distance, duration) ?? 0) * 10);

  if (current == null) {
    return {
      goal, window, current: null, target, ratio: 0, complete: false,
      remaining: target, lowerIsBetter, sessions: matching.length,
    };
  }

  const ratio = lowerIsBetter
    ? Math.min(1, Math.max(0, target / Math.max(1, current)))
    : Math.min(1, Math.max(0, current / target));

  return {
    goal,
    window,
    current,
    target,
    ratio,
    complete: lowerIsBetter ? current <= target : current >= target,
    remaining: lowerIsBetter
      ? Math.max(0, Math.round(current - target))
      : Math.max(0, Math.round(target - current)),
    lowerIsBetter,
    sessions: matching.length,
  };
}

export function activeGoalProgress(
  goals: ActivityGoal[],
  sessions: ActivitySession[],
  date: DayKey = todayKey(),
): GoalProgress[] {
  return goals
    .filter((goal) => goal.active)
    .map((goal) => goalProgress(goal, sessions, date));
}

/* --- History ------------------------------------------------------------------ */

export interface PeriodBucket {
  /** Monday of the week the bucket covers. */
  start: DayKey;
  sessions: number;
  distanceM: number;
  durationSec: number;
  /** Weighted by distance, so a long steady run outweighs a short sprint. */
  paceSecPerKm: number | null;
}

/** Weekly totals, oldest first. The shape every chart on the screen reads. */
export function weeklyBuckets(
  sessions: ActivitySession[],
  weeks = 8,
  today: DayKey = todayKey(),
  type: ActivityType | null = null,
): PeriodBucket[] {
  const thisWeek = startOfWeekKey(today);
  const buckets: PeriodBucket[] = [];

  for (let i = weeks - 1; i >= 0; i -= 1) {
    const start = addDaysToKey(thisWeek, -7 * i);
    const end = addDaysToKey(start, 6);
    const inWeek = sessions.filter(
      (session) =>
        session.endedAt !== null &&
        session.date >= start &&
        session.date <= end &&
        (type === null || session.type === type),
    );

    const distanceM = inWeek.reduce((sum, s) => sum + (s.distanceM ?? 0), 0);
    const durationSec = inWeek.reduce((sum, s) => sum + (s.durationSec ?? 0), 0);

    buckets.push({
      start,
      sessions: inWeek.length,
      distanceM: Math.round(distanceM),
      durationSec: Math.round(durationSec),
      paceSecPerKm: paceSecPerKm(distanceM, durationSec),
    });
  }
  return buckets;
}

export interface ActivityTotals {
  sessions: number;
  distanceM: number;
  durationSec: number;
  elevationGainM: number;
  /** Best (lowest) pace across sessions long enough to be meaningful. */
  bestPaceSecPerKm: number | null;
  longestDistanceM: number | null;
}

/** Sessions shorter than this are excluded from a personal best. */
const MIN_PACE_DISTANCE_M = 1000;

export function totals(sessions: ActivitySession[]): ActivityTotals {
  const done = sessions.filter((session) => session.endedAt !== null);

  // Uma bicicleta a 24 km/h faz 2:30 "por km" e arrasaria qualquer recorde de
  // corrida. Ritmo só se compara entre atividades que se medem por ritmo.
  const paces = done
    .filter((session) => (session.distanceM ?? 0) >= MIN_PACE_DISTANCE_M)
    .filter((session) => paceModeFor(session.type) === 'pace')
    .map((session) => metricsOf(session).paceSecPerKm)
    .filter((pace): pace is number => pace != null);

  const distances = done.map((session) => session.distanceM ?? 0);

  return {
    sessions: done.length,
    distanceM: Math.round(distances.reduce((sum, d) => sum + d, 0)),
    durationSec: done.reduce((sum, s) => sum + (s.durationSec ?? 0), 0),
    elevationGainM: done.reduce((sum, s) => sum + (s.elevationGainM ?? 0), 0),
    bestPaceSecPerKm: paces.length ? Math.min(...paces) : null,
    longestDistanceM: distances.length ? Math.max(...distances) : null,
  };
}

/** Finished sessions, newest first. */
export function history(sessions: ActivitySession[], limit?: number): ActivitySession[] {
  const done = sessions
    .filter((session) => session.endedAt !== null)
    .sort((a, b) => (a.date === b.date
      ? (b.endedAt ?? '').localeCompare(a.endedAt ?? '')
      : b.date.localeCompare(a.date)));
  return limit == null ? done : done.slice(0, limit);
}
