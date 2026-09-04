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
import { addDaysToKey, todayKey } from '../core/utils/date';
import * as activity from '../domain/activity';
import {
  estimateCalories, frequencyStats, insights, personalRecords, sessionsInPeriod, PERIOD_OPTIONS,
  summarizePeriod, type ActivityInsight, type FrequencyStats, type PeriodId,
  type PeriodSummary, type PersonalRecord,
} from '../domain/activity-insights';
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
  /** Borg CR10: 1 muito leve, 10 esforço máximo. */
  perceivedEffort?: number | null;
  difficulty?: 'easy' | 'right' | 'hard' | null;
  /** Desconforto descrito pelo utilizador. Nunca é interpretado como diagnóstico. */
  discomfort?: string | null;
  /** Distância escrita à mão quando o GPS não a mediu. */
  distanceM?: number | null;
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
  // O percurso medido manda sempre. Só quando não houve nenhum é que a
  // distância escrita à mão entra — e nunca por cima de uma medição.
  const measured = current.track.length > 1 ? activity.trackDistanceM(current.track) : null;
  const distanceM = measured ?? input.distanceM ?? current.distanceM;

  // Calorias: se o utilizador escreveu um número, é dele e fica como manual.
  // Se não, tenta-se estimar a partir do peso — e a estimativa vai marcada
  // como tal, para o ecrã nunca a apresentar como se tivesse sido medida.
  const manualCalories = input.calories ?? null;
  const estimate = manualCalories == null
    ? estimateCalories(
      { type: current.type, durationSec, distanceM },
      repos.user.get()?.body.weightKg ?? null,
    )
    : null;

  return repos.activitySessions.update(sessionId, {
    endedAt: now.toISOString(),
    durationSec,
    distanceM,
    avgPaceSecPerKm: activity.paceSecPerKm(distanceM, durationSec),
    notes: input.notes ?? current.notes,
    calories: manualCalories ?? estimate?.kcal ?? current.calories,
    caloriesSource: manualCalories != null
      ? 'manual'
      : estimate != null ? 'estimated' : current.caloriesSource,
    avgHeartRate: input.avgHeartRate ?? current.avgHeartRate,
    perceivedEffort: input.perceivedEffort ?? current.perceivedEffort,
    difficulty: input.difficulty ?? current.difficulty,
    discomfort: input.discomfort ?? current.discomfort,
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
  steps: number | null;
  perceivedEffort: number | null;
  notes: string | null;
  essential: boolean;
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
    steps: null,
    perceivedEffort: null,
    notes: null,
    essential: false,
  };
}

export function entryFromSession(session: ActivitySession): ManualEntry {
  return {
    type: session.type,
    date: session.date,
    durationSec: session.durationSec,
    distanceM: session.distanceM,
    avgHeartRate: session.avgHeartRate,
    // Uma estimativa não volta para o formulário como se fosse um número que o
    // utilizador escreveu: só aparece o que ele próprio introduziu.
    calories: session.caloriesSource === 'manual' ? session.calories : null,
    elevationGainM: session.elevationGainM,
    steps: session.steps,
    perceivedEffort: session.perceivedEffort,
    notes: session.notes,
    essential: session.essential,
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
  const estimate = entry.calories == null
    ? estimateCalories(
      { type: entry.type, durationSec: entry.durationSec, distanceM: entry.distanceM },
      repos.user.get()?.body.weightKg ?? null,
    )
    : null;

  const payload = {
    type: entry.type,
    date: entry.date,
    durationSec: entry.durationSec,
    distanceM: entry.distanceM,
    avgHeartRate: entry.avgHeartRate,
    calories: entry.calories ?? estimate?.kcal ?? null,
    caloriesSource: entry.calories != null
      ? ('manual' as const)
      : estimate != null ? ('estimated' as const) : null,
    elevationGainM: entry.elevationGainM,
    steps: entry.steps,
    perceivedEffort: entry.perceivedEffort,
    notes: entry.notes,
    essential: entry.essential,
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
  frequency: FrequencyStats;
  records: PersonalRecord[];
  insights: ActivityInsight[];
}

/**
 * O modelo do ecrã de Atividade.
 *
 * Os formatadores entram de fora porque a distância pode ser lida em km ou em
 * milhas: a camada de serviço guarda metros e não decide como se escrevem.
 */
export interface RecordFormatters {
  distance: (m: number) => string;
  duration: (s: number) => string;
  pace: (s: number) => string;
}

const PLAIN: RecordFormatters = {
  distance: (m) => `${(m / 1000).toFixed(1)} km`,
  duration: (s) => `${Math.round(s / 60)} min`,
  pace: (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}/km`,
};

export function overview(
  repos: Repositories,
  date: DayKey = todayKey(),
  format: RecordFormatters = PLAIN,
): ActivityOverview {
  const sessions = repos.activitySessions.all();
  return {
    today: sessions.filter((session) => session.date === date && session.endedAt !== null),
    running: activeSession(repos),
    recent: activity.history(sessions, 12),
    totals: activity.totals(sessions),
    weeks: activity.weeklyBuckets(sessions, 8, date),
    goals: goalProgress(repos, date),
    frequency: frequencyStats(sessions, date),
    records: personalRecords(sessions, null, format),
    insights: insights(sessions, date),
  };
}

/** O que a evolução mostra para o período escolhido. */
export interface EvolutionModel {
  period: PeriodId;
  summary: PeriodSummary;
  /** O mesmo período imediatamente anterior, para a comparação. */
  previous: PeriodSummary;
  buckets: activity.PeriodBucket[];
  sessions: ActivitySession[];
}

/**
 * Evolução por período.
 *
 * A comparação é sempre com a janela anterior do mesmo tamanho — comparar 30
 * dias com 7 diria pouco, e diria mal.
 */
export function evolution(
  repos: Repositories,
  period: PeriodId,
  type: ActivityType | null = null,
  date: DayKey = todayKey(),
): EvolutionModel {
  const all = repos.activitySessions.all()
    .filter((session) => type === null || session.type === type);

  const current = sessionsInPeriod(all, period, date);

  // A janela anterior é a de igual tamanho imediatamente antes desta — e não
  // "tudo o resto", que faria um mês comparar-se com dois anos.
  const days = PERIOD_OPTIONS.find((option) => option.id === period)?.days ?? null;
  const from = days == null ? null : addDaysToKey(date, -(days - 1));
  const previous = from == null
    ? []
    : sessionsInPeriod(all, period, addDaysToKey(from, -1)).filter((session) => session.date < from);

  // O gráfico segue a escala do período: semanas para janelas curtas, mais
  // semanas para janelas longas, sempre com barras que cabem no ecrã.
  const weeks = period === '7d' ? 4 : period === '30d' ? 8 : period === '90d' ? 13 : 26;

  return {
    period,
    summary: summarizePeriod(current),
    previous: summarizePeriod(previous),
    buckets: activity.weeklyBuckets(all, weeks, date, type),
    sessions: current,
  };
}

/** Uma sessão com tudo o que a página de detalhe precisa de mostrar. */
export interface SessionDetail {
  session: ActivitySession;
  metrics: ReturnType<typeof activity.metricsOf>;
  /** A média das sessões do mesmo tipo, para a comparação honesta. */
  typicalPaceSecPerKm: number | null;
  typicalDistanceM: number | null;
  /** Quantas sessões do mesmo tipo sustentam essa média. */
  comparedWith: number;
}

export function sessionDetail(repos: Repositories, sessionId: string): SessionDetail | null {
  const session = repos.activitySessions.byId(sessionId);
  if (!session) return null;

  const peers = repos.activitySessions
    .where((other) => other.id !== sessionId
      && other.type === session.type
      && other.endedAt !== null);

  const summary = summarizePeriod(peers);
  return {
    session,
    metrics: activity.metricsOf(session),
    // Menos de três sessões não é uma média, é uma coincidência.
    typicalPaceSecPerKm: peers.length >= 3 ? summary.paceSecPerKm : null,
    typicalDistanceM: peers.length >= 3 && summary.distanceM != null
      ? Math.round(summary.distanceM / peers.length)
      : null,
    comparedWith: peers.length,
  };
}
