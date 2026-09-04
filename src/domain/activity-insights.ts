/**
 * PACE — o que os registos de atividade dizem ao longo do tempo.
 *
 * Tudo aqui é calculado a partir do que está guardado. A regra que atravessa o
 * ficheiro inteiro: **um número que não existe é `null`, não é zero.** Uma
 * caloria estimada diz que é estimada, uma frequência cardíaca que ninguém
 * mediu não aparece, e uma conclusão sobre a evolução só sai quando há sessões
 * que a sustentem.
 */

import type { ActivitySession, ActivityType, DayKey } from '../core/types';
import { addDaysToKey, startOfWeekKey, todayKey } from '../core/utils/date';
import { paceModeFor } from '../core/constants';
import { paceSecPerKm, speedKmh } from './activity';

/* --- Calorias estimadas ----------------------------------------------------------- */

/**
 * Equivalentes metabólicos por atividade.
 *
 * Valores do Compendium of Physical Activities, na faixa de esforço moderado —
 * é uma estimativa grosseira de propósito. Sem peso não há conta, e sem conta
 * não há número: mais vale um traço do que uma caloria inventada.
 */
const MET: Record<ActivityType, number> = {
  run: 9.8,
  brisk_walk: 4.8,
  walk: 3.5,
  ride: 7.5,
  hike: 6.0,
  other: 4.0,
};

export interface CalorieEstimate {
  kcal: number;
  /** O que entrou na conta, para a resposta poder ser honesta. */
  basis: string;
}

/**
 * Calorias a partir do MET, do peso e do tempo.
 *
 * kcal = MET × peso(kg) × horas. É a fórmula de bolso, e é apresentada sempre
 * como estimativa — nunca como medição.
 */
export function estimateCalories(
  session: Pick<ActivitySession, 'type' | 'durationSec' | 'distanceM'>,
  weightKg: number | null,
): CalorieEstimate | null {
  if (!weightKg || !session.durationSec || session.durationSec < 60) return null;

  const hours = session.durationSec / 3600;
  let met = MET[session.type] ?? MET.other;

  // Com distância dá para afinar: correr a 12 km/h custa mais do que a 8.
  const speed = speedKmh(session.distanceM, session.durationSec);
  if (speed != null && speed > 0) {
    if (session.type === 'run') met = Math.max(6, Math.min(16, speed * 1.0));
    else if (session.type === 'ride') met = Math.max(4, Math.min(14, speed * 0.5));
    else if (session.type === 'walk' || session.type === 'brisk_walk') {
      met = Math.max(2.5, Math.min(7, speed * 1.1));
    }
  }

  return {
    kcal: Math.round(met * weightKg * hours),
    basis: speed != null
      ? 'peso, duração e ritmo'
      : 'peso e duração',
  };
}

/* --- Períodos --------------------------------------------------------------------- */

export type PeriodId = '7d' | '30d' | '90d' | '180d' | '365d' | 'all';

export const PERIOD_OPTIONS: ReadonlyArray<{ id: PeriodId; label: string; days: number | null }> = [
  { id: '7d', label: '7 dias', days: 7 },
  { id: '30d', label: '30 dias', days: 30 },
  { id: '90d', label: '3 meses', days: 90 },
  { id: '180d', label: '6 meses', days: 180 },
  { id: '365d', label: '1 ano', days: 365 },
  { id: 'all', label: 'Tudo', days: null },
];

export function sessionsInPeriod(
  sessions: ActivitySession[],
  period: PeriodId,
  today: DayKey = todayKey(),
): ActivitySession[] {
  const days = PERIOD_OPTIONS.find((option) => option.id === period)?.days ?? null;
  const done = sessions.filter((session) => session.endedAt != null);
  if (days == null) return done;
  const from = addDaysToKey(today, -(days - 1));
  return done.filter((session) => session.date >= from);
}

export interface PeriodSummary {
  sessions: number;
  distanceM: number | null;
  durationSec: number | null;
  /** Ritmo médio ponderado pela distância, para corridas e caminhadas. */
  paceSecPerKm: number | null;
  speedKmh: number | null;
  elevationM: number | null;
}

/**
 * O resumo de um período.
 *
 * Ponderado pela distância, e não a média das médias: uma tirada de 10 km e um
 * sprint de 1 km não valem o mesmo na conta do ritmo.
 */
export function summarizePeriod(sessions: ActivitySession[]): PeriodSummary {
  const withDistance = sessions.filter((session) => (session.distanceM ?? 0) > 0);
  const distance = withDistance.reduce((sum, session) => sum + (session.distanceM ?? 0), 0);
  const duration = sessions.reduce((sum, session) => sum + (session.durationSec ?? 0), 0);
  const elevation = sessions
    .map((session) => session.elevationGainM)
    .filter((value): value is number => value != null)
    .reduce((sum, value) => sum + value, 0);

  // Ritmo e velocidade saem cada um das atividades em que significam alguma
  // coisa. Misturar uma hora de bicicleta com uma corrida de meia hora dava um
  // "ritmo médio" que nenhuma das duas teve.
  const paced = withDistance.filter((session) => paceModeFor(session.type) === 'pace');
  const pacedDistance = paced.reduce((sum, session) => sum + (session.distanceM ?? 0), 0);
  const pacedTime = paced.reduce((sum, session) => sum + (session.durationSec ?? 0), 0);

  const wheeled = withDistance.filter((session) => paceModeFor(session.type) === 'speed');
  const wheeledDistance = wheeled.reduce((sum, session) => sum + (session.distanceM ?? 0), 0);
  const wheeledTime = wheeled.reduce((sum, session) => sum + (session.durationSec ?? 0), 0);

  return {
    sessions: sessions.length,
    distanceM: distance > 0 ? Math.round(distance) : null,
    durationSec: duration > 0 ? duration : null,
    paceSecPerKm: pacedDistance > 0 && pacedTime > 0
      ? paceSecPerKm(pacedDistance, pacedTime)
      : null,
    speedKmh: wheeledDistance > 0 && wheeledTime > 0
      ? speedKmh(wheeledDistance, wheeledTime)
      : null,
    elevationM: elevation > 0 ? Math.round(elevation) : null,
  };
}

/* --- Frequência -------------------------------------------------------------------- */

export interface FrequencyStats {
  /** Sessões desde segunda-feira desta semana. */
  thisWeek: number;
  /** Média semanal nas semanas com registo — não conta semanas antes da primeira. */
  weeklyAverage: number | null;
  total: number;
  /** Dias desde a última atividade, ou null se ainda não houve nenhuma. */
  daysSinceLast: number | null;
  /** As últimas oito semanas, da mais antiga para esta. */
  weeks: Array<{ start: DayKey; sessions: number; distanceM: number }>;
}

export function frequencyStats(
  sessions: ActivitySession[],
  today: DayKey = todayKey(),
): FrequencyStats {
  const done = sessions
    .filter((session) => session.endedAt != null)
    .sort((a, b) => b.date.localeCompare(a.date));

  const thisWeekStart = startOfWeekKey(today);
  const weeks: FrequencyStats['weeks'] = [];
  for (let i = 7; i >= 0; i -= 1) {
    const start = addDaysToKey(thisWeekStart, -7 * i);
    const end = addDaysToKey(start, 6);
    const inWeek = done.filter((session) => session.date >= start && session.date <= end);
    weeks.push({
      start,
      sessions: inWeek.length,
      distanceM: Math.round(inWeek.reduce((sum, session) => sum + (session.distanceM ?? 0), 0)),
    });
  }

  const primeira = done[done.length - 1]?.date ?? null;
  // A média só conta as semanas desde a primeira atividade: dividir por semanas
  // em que a aplicação nem existia dava um número sempre a mentir para baixo.
  const semanas = primeira == null
    ? 0
    : Math.max(1, Math.round(
      (new Date(`${today}T12:00:00`).getTime()
        - new Date(`${startOfWeekKey(primeira)}T12:00:00`).getTime())
      / (7 * 24 * 3600 * 1000),
    ) + 1);

  const ultima = done[0]?.date ?? null;
  const daysSinceLast = ultima == null
    ? null
    : Math.round(
      (new Date(`${today}T12:00:00`).getTime() - new Date(`${ultima}T12:00:00`).getTime())
      / (24 * 3600 * 1000),
    );

  return {
    thisWeek: weeks[weeks.length - 1]?.sessions ?? 0,
    weeklyAverage: semanas > 0 ? Math.round((done.length / semanas) * 10) / 10 : null,
    total: done.length,
    daysSinceLast,
    weeks,
  };
}

/* --- Recordes ----------------------------------------------------------------------- */

export interface PersonalRecord {
  id: 'longest' | 'fastest' | 'longest_time' | 'best_week' | 'best_month' | 'streak';
  label: string;
  value: string;
  /** A sessão ou a semana onde aconteceu, quando faz sentido apontar. */
  when: DayKey | null;
}

/**
 * Só recordes que existem mesmo.
 *
 * Um recorde precisa de dados: sem distâncias registadas não há "maior
 * distância", e a lista sai mais curta em vez de sair inventada.
 */
export function personalRecords(
  sessions: ActivitySession[],
  type: ActivityType | null,
  format: { distance: (m: number) => string; duration: (s: number) => string; pace: (s: number) => string },
): PersonalRecord[] {
  const done = sessions.filter(
    (session) => session.endedAt != null && (type == null || session.type === type),
  );
  if (done.length === 0) return [];

  const records: PersonalRecord[] = [];

  const longest = done
    .filter((session) => (session.distanceM ?? 0) > 0)
    .sort((a, b) => (b.distanceM ?? 0) - (a.distanceM ?? 0))[0];
  if (longest?.distanceM) {
    records.push({
      id: 'longest',
      label: 'Maior distância',
      value: format.distance(longest.distanceM),
      when: longest.date,
    });
  }

  // Duas exclusões, ambas necessárias: abaixo de um quilómetro é um sprint de
  // aquecimento a passar por recorde, e uma bicicleta faz "2:30 por km" sem
  // isso querer dizer o que quer dizer numa corrida.
  const fastest = done
    .filter((session) => paceModeFor(session.type) === 'pace')
    .filter((session) => (session.distanceM ?? 0) >= 1000 && session.avgPaceSecPerKm != null)
    .sort((a, b) => (a.avgPaceSecPerKm ?? 0) - (b.avgPaceSecPerKm ?? 0))[0];
  if (fastest?.avgPaceSecPerKm) {
    records.push({
      id: 'fastest',
      label: 'Ritmo mais rápido',
      value: format.pace(fastest.avgPaceSecPerKm),
      when: fastest.date,
    });
  }

  const longestTime = done
    .filter((session) => (session.durationSec ?? 0) > 0)
    .sort((a, b) => (b.durationSec ?? 0) - (a.durationSec ?? 0))[0];
  if (longestTime?.durationSec) {
    records.push({
      id: 'longest_time',
      label: 'Maior duração',
      value: format.duration(longestTime.durationSec),
      when: longestTime.date,
    });
  }

  const byWeek = new Map<DayKey, number>();
  const byMonth = new Map<string, number>();
  for (const session of done) {
    const distance = session.distanceM ?? 0;
    if (distance <= 0) continue;
    const week = startOfWeekKey(session.date);
    byWeek.set(week, (byWeek.get(week) ?? 0) + distance);
    const month = session.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + distance);
  }

  const bestWeek = [...byWeek.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bestWeek) {
    records.push({
      id: 'best_week',
      label: 'Melhor semana',
      value: format.distance(bestWeek[1]),
      when: bestWeek[0],
    });
  }

  const bestMonth = [...byMonth.entries()].sort((a, b) => b[1] - a[1])[0];
  if (bestMonth) {
    records.push({
      id: 'best_month',
      label: 'Melhor mês',
      value: format.distance(bestMonth[1]),
      when: null,
    });
  }

  const streak = longestDayStreak(done.map((session) => session.date));
  if (streak >= 2) {
    records.push({
      id: 'streak',
      label: 'Dias seguidos',
      value: `${streak} dias`,
      when: null,
    });
  }

  return records;
}

function longestDayStreak(dates: DayKey[]): number {
  const unique = [...new Set(dates)].sort();
  let best = 0;
  let run = 0;
  let previous: DayKey | null = null;
  for (const date of unique) {
    run = previous != null && addDaysToKey(previous, 1) === date ? run + 1 : 1;
    previous = date;
    if (run > best) best = run;
  }
  return best;
}

/* --- Insights ----------------------------------------------------------------------- */

export interface ActivityInsight {
  id: string;
  tone: 'good' | 'neutral' | 'caution';
  text: string;
}

/**
 * Observações sobre o que os dados mostram — nunca conselhos médicos.
 *
 * Cada uma exige um mínimo de sessões para não transformar duas corridas numa
 * tendência. Sem dados suficientes a lista sai vazia, e o ecrã diz isso em vez
 * de encher espaço com frases genéricas.
 */
export function insights(
  sessions: ActivitySession[],
  today: DayKey = todayKey(),
): ActivityInsight[] {
  const done = sessions.filter((session) => session.endedAt != null);
  if (done.length < 3) return [];

  const out: ActivityInsight[] = [];
  const stats = frequencyStats(done, today);

  const ultimas4 = stats.weeks.slice(-4).reduce((sum, week) => sum + week.sessions, 0);
  const anteriores4 = stats.weeks.slice(0, 4).reduce((sum, week) => sum + week.sessions, 0);
  if (anteriores4 > 0 && ultimas4 >= anteriores4 * 1.3) {
    out.push({
      id: 'volume-up',
      tone: 'good',
      text: `Nas últimas 4 semanas fizeste ${ultimas4} sessões, contra ${anteriores4} nas 4 anteriores.`,
    });
  } else if (ultimas4 > 0 && anteriores4 >= ultimas4 * 1.5) {
    out.push({
      id: 'volume-down',
      tone: 'caution',
      text: `O ritmo abrandou: ${ultimas4} sessões nas últimas 4 semanas, contra ${anteriores4} antes.`,
    });
  }

  if (stats.daysSinceLast != null && stats.daysSinceLast >= 7) {
    out.push({
      id: 'gap',
      tone: 'caution',
      text: `A última atividade foi há ${stats.daysSinceLast} dias.`,
    });
  }

  const recentes = sessionsInPeriod(done, '30d', today);
  const antigas = done.filter((session) => !recentes.includes(session));
  const ritmoRecente = summarizePeriod(recentes).paceSecPerKm;
  const ritmoAntigo = summarizePeriod(antigas).paceSecPerKm;
  // 3% é a margem abaixo da qual a diferença é ruído de medição, não progresso.
  if (ritmoRecente != null && ritmoAntigo != null && recentes.length >= 3) {
    if (ritmoRecente <= ritmoAntigo * 0.97) {
      out.push({ id: 'pace-better', tone: 'good', text: 'O teu ritmo médio melhorou face ao histórico anterior.' });
    } else if (ritmoRecente >= ritmoAntigo * 1.03) {
      out.push({ id: 'pace-worse', tone: 'neutral', text: 'O ritmo médio está mais lento do que era — pode ser volume, terreno ou cansaço.' });
    }
  }

  const esforcos = recentes
    .map((session) => session.perceivedEffort)
    .filter((value): value is number => value != null);
  if (esforcos.length >= 3) {
    const media = esforcos.reduce((sum, value) => sum + value, 0) / esforcos.length;
    if (media >= 8) {
      out.push({
        id: 'effort-high',
        tone: 'caution',
        text: `Esforço percebido médio de ${media.toFixed(1)}/10 no último mês. Vale a pena incluir sessões mais leves.`,
      });
    }
  }

  const manha = recentes.filter((session) => (session.startedAt ?? '').slice(11, 13) < '12').length;
  if (recentes.length >= 5 && (manha / recentes.length >= 0.8 || manha / recentes.length <= 0.2)) {
    out.push({
      id: 'time-of-day',
      tone: 'neutral',
      text: manha / recentes.length >= 0.8
        ? 'Treinas quase sempre de manhã.'
        : 'Treinas quase sempre à tarde ou à noite.',
    });
  }

  return out.slice(0, 4);
}
