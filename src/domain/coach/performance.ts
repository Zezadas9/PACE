/**
 * PACE — tendências, com a humildade que os dados permitem.
 *
 * Quatro perguntas: está a melhorar, está parado, está a carregar demais, está
 * a aparecer o suficiente. Cada uma só é respondida quando há dados que a
 * sustentem — caso contrário a resposta é "não sei", que é uma resposta.
 */

import type { ActivitySession, WorkoutSession, Workout } from '../../core/types';
import type { DayKey } from '../../core/types';
import { addDaysToKey, startOfWeekKey } from '../../core/utils/date';
import { sessionVolumeKg } from '../training';
import type { Finding } from './evaluate-workout';

export interface PerformanceReading {
  weeks: Array<{ start: DayKey; sessions: number; loadAu: number | null }>;
  sessionsPerWeek: number;
  /** Carga interna: RPE × minutos, somada por semana (foster-2001). */
  loadTrend: 'up' | 'flat' | 'down' | 'unknown';
  volumeTrend: 'up' | 'flat' | 'down' | 'unknown';
  paceTrend: 'faster' | 'flat' | 'slower' | 'unknown';
  restDaysLastWeek: number | null;
  findings: Finding[];
}

const WINDOW_WEEKS = 6;

function weekStarts(today: DayKey, weeks: number): DayKey[] {
  const thisWeek = startOfWeekKey(today);
  const out: DayKey[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) out.push(addDaysToKey(thisWeek, -7 * i));
  return out;
}

/** Carga interna de uma sessão: RPE × minutos. Sem RPE, não há carga. */
function sessionLoad(session: WorkoutSession): number | null {
  if (session.perceivedEffort == null || session.durationSec == null) return null;
  return Math.round(session.perceivedEffort * (session.durationSec / 60));
}

function direction(first: number, last: number, tolerance = 0.08): 'up' | 'flat' | 'down' {
  if (first <= 0) return last > 0 ? 'up' : 'flat';
  const change = (last - first) / first;
  if (change > tolerance) return 'up';
  if (change < -tolerance) return 'down';
  return 'flat';
}

export function readPerformance(
  sessions: WorkoutSession[],
  workouts: Workout[],
  activities: ActivitySession[],
  today: DayKey,
): PerformanceReading {
  const starts = weekStarts(today, WINDOW_WEEKS);
  const done = sessions.filter((session) => session.completed);

  const weeks = starts.map((start) => {
    const end = addDaysToKey(start, 6);
    const inWeek = done.filter((session) => session.date >= start && session.date <= end);
    const loads = inWeek.map(sessionLoad).filter((value): value is number => value != null);
    return {
      start,
      sessions: inWeek.length,
      loadAu: loads.length ? loads.reduce((sum, value) => sum + value, 0) : null,
    };
  });

  const counted = weeks.reduce((sum, week) => sum + week.sessions, 0);
  const withLoad = weeks.filter((week) => week.loadAu != null);
  const loadTrend = withLoad.length >= 4
    ? direction(withLoad[0]!.loadAu!, withLoad[withLoad.length - 1]!.loadAu!, 0.2)
    : 'unknown';

  // Volume levantado: só conta em treinos de carga, e só com séries registadas.
  const volumes = done
    .map((session) => ({
      date: session.date,
      kg: sessionVolumeKg(session, workouts.find((w) => w.id === session.workoutId) ?? null),
    }))
    .filter((point) => point.kg > 0);
  const half = Math.floor(volumes.length / 2);
  const volumeTrend = volumes.length >= 4
    ? direction(
      mean(volumes.slice(0, half).map((point) => point.kg)),
      mean(volumes.slice(half).map((point) => point.kg)),
    )
    : 'unknown';

  const paceTrend = readPace(activities, today);
  const lastWeekStart = starts[starts.length - 1]!;
  const trainedDays = new Set(
    done.filter((session) => session.date >= lastWeekStart).map((session) => session.date),
  );
  const activeDays = new Set([
    ...trainedDays,
    ...activities
      .filter((activity) => activity.date >= lastWeekStart && activity.endedAt != null)
      .map((activity) => activity.date),
  ]);

  const reading: PerformanceReading = {
    weeks,
    sessionsPerWeek: Math.round((counted / WINDOW_WEEKS) * 10) / 10,
    loadTrend,
    volumeTrend,
    paceTrend,
    restDaysLastWeek: activeDays.size > 0 ? 7 - activeDays.size : null,
    findings: [],
  };
  reading.findings = findingsFor(reading);
  return reading;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

/**
 * Ritmo, comparado só entre corridas de distância parecida.
 *
 * Comparar um sprint de 2 km com uma tirada de 10 km diria que se ficou mais
 * lento quando na verdade se correu mais.
 */
function readPace(activities: ActivitySession[], today: DayKey): PerformanceReading['paceTrend'] {
  const runs = activities
    .filter((activity) => activity.type === 'run'
      && activity.date >= addDaysToKey(today, -84)
      && (activity.distanceM ?? 0) >= 1500
      && activity.avgPaceSecPerKm != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (runs.length < 4) return 'unknown';

  const median = [...runs].sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))[
    Math.floor(runs.length / 2)
  ]!.distanceM ?? 0;
  const comparable = runs.filter(
    (run) => Math.abs((run.distanceM ?? 0) - median) <= median * 0.35,
  );
  if (comparable.length < 4) return 'unknown';

  const half = Math.floor(comparable.length / 2);
  const before = mean(comparable.slice(0, half).map((run) => run.avgPaceSecPerKm ?? 0));
  const after = mean(comparable.slice(half).map((run) => run.avgPaceSecPerKm ?? 0));
  const trend = direction(before, after, 0.04);
  // Ritmo é tempo por km: descer é melhorar.
  return trend === 'down' ? 'faster' : trend === 'up' ? 'slower' : 'flat';
}

function findingsFor(reading: PerformanceReading): Finding[] {
  const findings: Finding[] = [];
  const { weeks, sessionsPerWeek, loadTrend, volumeTrend, paceTrend, restDaysLastWeek } = reading;
  const trained = weeks.filter((week) => week.sessions > 0).length;

  if (trained === 0) {
    return [{
      tone: 'unknown',
      title: 'Sem sessões registadas',
      detail: `Nas últimas ${weeks.length} semanas não há treinos concluídos, por isso não `
        + 'há tendência nenhuma para ler. Regista duas ou três sessões e volta aqui.',
      referenceIds: [],
    }];
  }

  // Consistência antes de tudo: sem ela, nenhuma outra leitura significa nada.
  if (sessionsPerWeek < 1) {
    findings.push({
      tone: 'gap',
      title: `Menos de uma sessão por semana (${sessionsPerWeek})`,
      detail:
        'A consistência é o que faz a diferença antes de qualquer detalhe de programa. '
        + 'A OMS aponta para reforço muscular em dois dias por semana e 150 min de '
        + 'atividade moderada.',
      referenceIds: ['who-2020'],
    });
  } else if (sessionsPerWeek >= 2) {
    findings.push({
      tone: 'good',
      title: `${sessionsPerWeek} sessões por semana, em média`,
      detail: `Apareceste em ${trained} das últimas ${weeks.length} semanas.`,
      referenceIds: ['who-2020'],
    });
  }

  if (volumeTrend === 'up') {
    findings.push({
      tone: 'good',
      title: 'Volume levantado a subir',
      detail: 'O total de peso × repetições cresceu na segunda metade do período. '
        + 'É o sinal mais direto de progressão que os teus registos dão.',
      referenceIds: ['acsm-2009'],
    });
  } else if (volumeTrend === 'flat') {
    findings.push({
      tone: 'watch',
      title: 'Volume estagnado',
      detail:
        'O volume levantado está praticamente igual. Se o objetivo é progredir, subir '
        + 'carga, repetições ou séries — uma coisa de cada vez — é o caminho habitual.',
      referenceIds: ['acsm-2009', 'schoenfeld-2017-volume'],
    });
  }

  // Salto de carga: o número é meu, não de uma diretriz. Fica dito.
  const withLoad = weeks.filter((week) => week.loadAu != null);
  if (withLoad.length >= 3) {
    const last = withLoad[withLoad.length - 1]!.loadAu!;
    const previous = withLoad.slice(0, -1).map((week) => week.loadAu!);
    const average = previous.reduce((sum, value) => sum + value, 0) / previous.length;
    if (average > 0 && last > average * 1.5) {
      findings.push({
        tone: 'watch',
        title: 'Salto grande de carga esta semana',
        detail:
          `Carga interna de ${last} unidades contra uma média de ${Math.round(average)}. `
          + 'Subir muito de uma vez costuma cobrar-se depois; se te sentires bem, não há '
          + 'drama — repara é se se repetir.',
        referenceIds: ['foster-2001'],
      });
    }
  } else if (loadTrend === 'unknown') {
    findings.push({
      tone: 'unknown',
      title: 'Sem carga interna para ler',
      detail:
        'A carga interna é o RPE multiplicado pelos minutos da sessão. Sem RPE no fim '
        + 'dos treinos, não a consigo calcular.',
      referenceIds: ['foster-2001'],
    });
  }

  if (paceTrend === 'faster') {
    findings.push({
      tone: 'good',
      title: 'Ritmo a melhorar',
      detail: 'Em corridas de distância parecida, o teu ritmo médio desceu.',
      referenceIds: [],
    });
  } else if (paceTrend === 'slower') {
    findings.push({
      tone: 'watch',
      title: 'Ritmo mais lento',
      detail:
        'Pode ser fadiga, calor, sono ou simplesmente corridas mais longas. Não dá para '
        + 'distinguir com o que está registado.',
      referenceIds: [],
    });
  }

  if (restDaysLastWeek != null && restDaysLastWeek <= 1) {
    findings.push({
      tone: 'watch',
      title: 'Quase sem dias de folga na última semana',
      detail:
        'Sem dados de sono nem de frequência cardíaca em repouso, isto é o único sinal de '
        + 'recuperação que tenho — e é fraco. Se andas a dormir mal, conta mais do que isto.',
      referenceIds: ['watson-2015'],
    });
  }

  return findings;
}
