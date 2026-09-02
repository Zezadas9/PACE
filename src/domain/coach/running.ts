/**
 * PACE — do sítio onde estás até à distância que queres.
 *
 * Duas regras mandam aqui:
 *
 * - **Começa onde a pessoa está.** Se houver histórico, o plano parte da corrida
 *   mais longa recente. Se não houver, parte de caminhada com corrida à mistura,
 *   que é o princípio de qualquer plano de iniciação sério.
 * - **Nunca sobe de forma irresponsável.** O aumento semanal é travado em 10% e
 *   há uma semana mais leve a cada quatro. Convém dizer o que isto é: a regra
 *   dos 10% é prudência convencional, e o ensaio de Buist (2008) não encontrou
 *   menos lesões com ela. Serve de travão, não de garantia.
 */

import type { ActivitySession, DayKey } from '../../core/types';
import { addDaysToKey } from '../../core/utils/date';
import { LIMITS } from './safety';
import type { RunPlanDraft } from './types';

export interface RunBaseline {
  hasHistory: boolean;
  longestRunM: number | null;
  weeklyVolumeM: number | null;
  sessionsPerWeek: number | null;
}

/** O ponto de partida, lido das últimas seis semanas de atividade. */
export function baselineFrom(
  activities: ActivitySession[],
  today: DayKey,
): RunBaseline {
  const since = addDaysToKey(today, -42);
  const runs = activities.filter(
    (activity) => (activity.type === 'run' || activity.type === 'brisk_walk')
      && activity.date >= since
      && (activity.distanceM ?? 0) > 0,
  );
  if (runs.length === 0) {
    return { hasHistory: false, longestRunM: null, weeklyVolumeM: null, sessionsPerWeek: null };
  }

  const longest = Math.max(...runs.map((run) => run.distanceM ?? 0));
  const total = runs.reduce((sum, run) => sum + (run.distanceM ?? 0), 0);
  return {
    hasHistory: true,
    longestRunM: Math.round(longest),
    weeklyVolumeM: Math.round(total / 6),
    sessionsPerWeek: Math.round((runs.length / 6) * 10) / 10,
  };
}

/** O travão: nunca mais do que 10% por semana, venha o pedido de onde vier. */
export function cappedIncrease(currentM: number, wantedM: number): number {
  const ceiling = currentM * (1 + LIMITS.weeklyVolumeIncrease);
  return Math.min(wantedM, Math.max(ceiling, currentM + 400));
}

const DEFAULT_WEEKDAYS = [2, 4, 0]; // terça, quinta, domingo

interface WeekPlan {
  longestM: number;
  easyM: number;
  deload: boolean;
  intervals: boolean;
}

/** A progressão semana a semana, antes de virar sessões com datas. */
export function progression(goalDistanceM: number, baseline: RunBaseline): WeekPlan[] {
  const start = baseline.longestRunM && baseline.longestRunM >= 1500
    ? baseline.longestRunM
    : 0;

  const weeks: WeekPlan[] = [];
  let longest = start;

  // Sem base: quatro semanas de corrida e caminhada alternadas antes de medir
  // distância. É onde as lesões de quem começa costumam nascer.
  if (start === 0) {
    for (let i = 0; i < 4; i += 1) {
      weeks.push({ longestM: 0, easyM: 0, deload: false, intervals: true });
    }
    longest = 2500;
  }

  let guard = 0;
  while (longest < goalDistanceM && guard < 24) {
    guard += 1;
    const deload = weeks.length > 0 && (weeks.length + 1) % 4 === 0;
    if (deload) {
      weeks.push({
        longestM: Math.round(longest * 0.7),
        easyM: Math.round(longest * 0.5),
        deload: true,
        intervals: false,
      });
      continue;
    }
    longest = Math.round(cappedIncrease(longest, goalDistanceM));
    weeks.push({
      longestM: longest,
      easyM: Math.max(2000, Math.round(longest * 0.6)),
      deload: false,
      intervals: false,
    });
  }

  // A semana final é a da distância: chega-se lá com o corpo fresco.
  weeks.push({
    longestM: goalDistanceM,
    easyM: Math.max(2000, Math.round(goalDistanceM * 0.4)),
    deload: false,
    intervals: false,
  });
  return weeks;
}

/** Os intervalos das primeiras semanas: corre um pouco, caminha, repete. */
function intervalsFor(weekIndex: number): Array<{ runSec: number; walkSec: number; repeats: number }> {
  const ladder = [
    { runSec: 60, walkSec: 90, repeats: 8 },
    { runSec: 90, walkSec: 90, repeats: 8 },
    { runSec: 180, walkSec: 90, repeats: 5 },
    { runSec: 300, walkSec: 90, repeats: 4 },
  ];
  return [ladder[Math.min(weekIndex, ladder.length - 1)]!];
}

export function buildRunPlan(
  goalDistanceM: number,
  startDate: DayKey,
  baseline: RunBaseline,
  weekdays: number[] = DEFAULT_WEEKDAYS,
): RunPlanDraft {
  const days = (weekdays.length > 0 ? weekdays : DEFAULT_WEEKDAYS)
    .slice(0, LIMITS.maxRunSessionsPerWeek);
  const weeks = progression(goalDistanceM, baseline);
  const sessions: RunPlanDraft['sessions'] = [];

  const startWeekday = new Date(`${startDate}T12:00:00`).getDay();

  weeks.forEach((week, weekIndex) => {
    days.forEach((weekday, dayIndex) => {
      // O primeiro dia do plano é o primeiro dia marcado a partir de hoje.
      const offsetToDay = (weekday - startWeekday + 7) % 7;
      const date = addDaysToKey(startDate, weekIndex * 7 + offsetToDay);
      const isLong = dayIndex === days.length - 1;

      if (week.intervals) {
        const segments = intervalsFor(weekIndex);
        const first = segments[0]!;
        sessions.push({
          weekIndex,
          date,
          kind: 'walk_run',
          segments,
          targetDistanceM: null,
          targetDurationSec: (first.runSec + first.walkSec) * first.repeats + 600,
          note: `Aquece 5 min a caminhar. Depois ${first.repeats}× (${Math.round(first.runSec / 60)} min a correr, ${Math.round(first.walkSec / 60)} min a caminhar).`,
        });
        return;
      }

      sessions.push({
        weekIndex,
        date,
        kind: isLong ? 'long_run' : 'easy_run',
        segments: [],
        targetDistanceM: isLong ? week.longestM : week.easyM,
        targetDurationSec: null,
        note: week.deload
          ? 'Semana mais leve, de propósito: é onde a adaptação assenta.'
          : 'Ritmo em que conseguirias falar. Se não consegues, abranda.',
      });
    });
  });

  /* Por data, e não pela ordem em que os dias da semana foram escolhidos.
     Um plano que comece a uma quinta tem a primeira sessão nessa quinta — e
     não na terça seguinte só porque a terça vem primeiro na lista. */
  const ordered = sessions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((session) => ({
      ...session,
      weekIndex: Math.floor(daysBetween(startDate, session.date) / 7),
    }));

  return {
    title: `Chegar aos ${Math.round(goalDistanceM / 1000)} km`,
    goalDistanceM,
    weeks: weeks.length,
    weekdays: days,
    startDate,
    sessions: ordered,
  };
}

function daysBetween(from: DayKey, to: DayKey): number {
  const start = new Date(`${from}T12:00:00`).getTime();
  const end = new Date(`${to}T12:00:00`).getTime();
  return Math.round((end - start) / 86400000);
}

/* --- Adaptação ------------------------------------------------------------------- */

export interface Adaptation {
  direction: 'easier' | 'harder' | 'hold';
  reason: string;
  /** Fator aplicado às sessões seguintes. */
  factor: number;
}

/**
 * O que fazer a seguir, lido do que as últimas sessões disseram.
 *
 * Duas sessões seguidas difíceis mandam baixar; duas fáceis deixam subir — mas
 * só até ao mesmo travão dos 10%. Uma sessão isolada não muda nada: um dia mau
 * é um dia mau, não uma tendência.
 */
export function adapt(
  recent: Array<{ difficulty: 'easy' | 'right' | 'hard'; rpe: number | null }>,
): Adaptation {
  const last = recent.slice(-3);
  if (last.length < 2) {
    return { direction: 'hold', reason: 'Ainda sem sessões suficientes para ajustar.', factor: 1 };
  }

  const hard = last.filter((s) => s.difficulty === 'hard' || (s.rpe ?? 0) >= 9).length;
  const easy = last.filter((s) => s.difficulty === 'easy' || ((s.rpe ?? 10) <= 3)).length;

  if (hard >= 2) {
    return {
      direction: 'easier',
      reason: 'Marcaste as últimas sessões como difíceis. Baixo 15% e repito o patamar.',
      factor: 0.85,
    };
  }
  if (easy >= 2) {
    return {
      direction: 'harder',
      reason: 'As últimas sessões correram fáceis. Subo, dentro do limite dos 10%.',
      factor: 1 + LIMITS.weeklyVolumeIncrease,
    };
  }
  return { direction: 'hold', reason: 'Está no ponto: mantenho a progressão.', factor: 1 };
}

/**
 * Aplica a adaptação às sessões que ainda não aconteceram.
 *
 * Tem de mexer nos dois formatos. As primeiras semanas são intervalos de
 * corrida e caminhada, e dizer "baixei 15%" sem tocar nas repetições seria
 * dizer uma coisa e fazer outra — que é a única forma garantida de um plano
 * perder a confiança de quem o segue.
 */
export interface AdaptableSession {
  targetDistanceM: number | null;
  segments: Array<{ runSec: number; walkSec: number; repeats: number }>;
}

export function applyAdaptation<T extends AdaptableSession>(
  sessions: T[],
  adaptation: Adaptation,
  fromIndex: number,
): T[] {
  if (adaptation.direction === 'hold') return sessions;

  return sessions.map((session, index) => {
    if (index < fromIndex) return session;

    if (session.segments.length > 0) {
      return {
        ...session,
        segments: session.segments.map((segment) => ({
          ...segment,
          // Nunca abaixo de três repetições: menos do que isso deixa de ser
          // uma sessão e passa a ser um aquecimento.
          repeats: Math.max(3, Math.round(segment.repeats * adaptation.factor)),
        })),
      };
    }

    if (session.targetDistanceM == null) return session;
    return {
      ...session,
      targetDistanceM: Math.max(
        1000,
        Math.round((session.targetDistanceM * adaptation.factor) / 100) * 100,
      ),
    };
  });
}
