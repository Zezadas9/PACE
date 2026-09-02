/**
 * PACE — "este treino está equilibrado?"
 *
 * A resposta é uma leitura da semana planeada, não uma opinião. Cada achado
 * diz o número que o motivou e a referência que o sustenta, e há um achado
 * possível que vale mais do que todos: **não há dados suficientes**.
 */

import type { MuscleGroup, WorkoutBlock, WorkoutSession, Workout } from '../../core/types';
import { addDaysToKey } from '../../core/utils/date';
import { MUSCLE_LABELS } from './exercises';
import { LIMITS } from './safety';

export type FindingTone = 'good' | 'watch' | 'gap' | 'unknown';

export interface Finding {
  tone: FindingTone;
  title: string;
  detail: string;
  referenceIds: string[];
}

export interface WorkoutEvaluation {
  /** Séries semanais por grupo muscular, contando os dias marcados. */
  weeklySets: Array<{ group: MuscleGroup; sets: number; days: number }>;
  sessionsPerWeek: number;
  restDays: number;
  longestStreakDays: number;
  avgMinutes: number | null;
  avgRpe: number | null;
  findings: Finding[];
}

const PRIMARY_GROUPS: MuscleGroup[] = ['legs', 'back', 'chest', 'shoulders', 'arms', 'core'];

/** Um bloco já com os grupos musculares resolvidos a partir do exercício. */
type ResolvedBlock = WorkoutBlock & { muscleGroups: MuscleGroup[] };

/** Grupos musculares dos blocos principais, com o número de séries. */
function setsOf(blocks: ResolvedBlock[]): Map<MuscleGroup, number> {
  const counts = new Map<MuscleGroup, number>();
  for (const block of blocks) {
    if (block.section !== 'main') continue;
    // Só o grupo primário conta como volume dirigido. Contar os secundários
    // inflacionava tudo e fazia parecer que já se treina o suficiente.
    const group = block.muscleGroups[0];
    if (!group) continue;
    counts.set(group, (counts.get(group) ?? 0) + block.sets);
  }
  return counts;
}

export function evaluateWeek(
  workouts: Workout[],
  exerciseGroups: Map<string, MuscleGroup[]>,
  sessions: WorkoutSession[],
  today: string,
): WorkoutEvaluation {
  const active = workouts.filter((workout) => !workout.archived);

  // Os blocos guardam o id do exercício; os grupos vêm do catálogo do
  // utilizador, e um exercício sem grupos declarados não conta para lado nenhum.
  const resolved = active.map((workout) => ({
    workout,
    blocks: workout.blocks.map((block) => ({
      ...block,
      muscleGroups: exerciseGroups.get(block.exerciseId) ?? [],
    })),
  }));

  const weekly = new Map<MuscleGroup, { sets: number; days: Set<number> }>();
  for (const { workout, blocks } of resolved) {
    const counts = setsOf(blocks);
    const days = workout.weekdays.length > 0 ? workout.weekdays : [];
    for (const [group, sets] of counts) {
      const entry = weekly.get(group) ?? { sets: 0, days: new Set<number>() };
      entry.sets += sets * Math.max(1, days.length);
      for (const day of days) entry.days.add(day);
      weekly.set(group, entry);
    }
  }

  const weeklySets = [...weekly.entries()]
    .map(([group, entry]) => ({ group, sets: entry.sets, days: entry.days.size }))
    .sort((a, b) => b.sets - a.sets);

  const trainingDays = new Set<number>();
  for (const workout of active) for (const day of workout.weekdays) trainingDays.add(day);

  const recent = sessions.filter(
    (session) => session.completed && session.date >= addDaysToKey(today, -28),
  );
  const rpes = recent
    .map((session) => session.perceivedEffort)
    .filter((value): value is number => value != null);
  const minutes = recent
    .map((session) => session.durationSec)
    .filter((value): value is number => value != null)
    .map((value) => value / 60);

  return {
    weeklySets,
    sessionsPerWeek: trainingDays.size,
    restDays: 7 - trainingDays.size,
    longestStreakDays: longestRun([...trainingDays]),
    avgMinutes: minutes.length ? Math.round(mean(minutes)) : null,
    avgRpe: rpes.length ? Math.round(mean(rpes) * 10) / 10 : null,
    findings: [],
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** O maior número de dias de treino seguidos numa semana que dá a volta. */
function longestRun(days: number[]): number {
  if (days.length === 0) return 0;
  if (days.length === 7) return 7;
  const set = new Set(days);
  let best = 0;
  for (const start of days) {
    // Só conta a partir de um dia que comece uma sequência.
    if (set.has((start + 6) % 7)) continue;
    let length = 0;
    let cursor = start;
    while (set.has(cursor) && length < 7) {
      length += 1;
      cursor = (cursor + 1) % 7;
    }
    best = Math.max(best, length);
  }
  return best;
}

/**
 * Os achados: o que está bem, o que merece atenção, o que falta, e o que não
 * se sabe. A ordem é essa de propósito — começar pelo problema fecha as
 * pessoas, e o objetivo é que leiam até ao fim.
 */
export function findingsFor(evaluation: WorkoutEvaluation): Finding[] {
  const findings: Finding[] = [];
  const { weeklySets, sessionsPerWeek, restDays, longestStreakDays, avgRpe } = evaluation;

  if (weeklySets.length === 0) {
    return [{
      tone: 'unknown',
      title: 'Ainda não dá para avaliar',
      detail:
        'Não há planos de treino com exercícios e dias marcados. Marca os dias da semana '
        + 'em cada plano e eu consigo ler volume, frequência e distribuição.',
      referenceIds: [],
    }];
  }

  // Frequência por grupo: duas vezes por semana bate uma, com o mesmo volume.
  const oncePerWeek = weeklySets.filter((entry) => entry.days === 1 && entry.sets >= 4);
  if (oncePerWeek.length > 0) {
    findings.push({
      tone: 'watch',
      title: 'Grupos treinados uma vez por semana',
      detail:
        `${oncePerWeek.map((entry) => MUSCLE_LABELS[entry.group]).join(', ')} — dividir o `
        + 'mesmo volume por dois dias tende a render mais do que concentrá-lo num.',
      referenceIds: ['schoenfeld-2016-frequencia'],
    });
  }

  // Volume por grupo, nos dois sentidos.
  const low = weeklySets.filter((entry) => entry.sets > 0 && entry.sets < 6);
  const high = weeklySets.filter((entry) => entry.sets > LIMITS.weeklySetsCaution);
  const solid = weeklySets.filter((entry) => entry.sets >= 10 && entry.sets <= LIMITS.weeklySetsCaution);

  if (solid.length > 0) {
    findings.push({
      tone: 'good',
      title: 'Volume no intervalo em que se veem ganhos',
      detail:
        `${solid.map((entry) => `${MUSCLE_LABELS[entry.group]} (${entry.sets} séries)`).join(', ')}`
        + ' — dez ou mais séries semanais por grupo é onde a literatura mostra resposta clara.',
      referenceIds: ['schoenfeld-2017-volume'],
    });
  }
  if (low.length > 0) {
    findings.push({
      tone: 'gap',
      title: 'Volume baixo em alguns grupos',
      detail: `${low.map((entry) => `${MUSCLE_LABELS[entry.group]} (${entry.sets})`).join(', ')}`
        + ' — abaixo de seis séries por semana é manutenção, não progresso.',
      referenceIds: ['schoenfeld-2017-volume'],
    });
  }
  if (high.length > 0) {
    findings.push({
      tone: 'watch',
      title: 'Volume alto',
      detail: `${high.map((entry) => `${MUSCLE_LABELS[entry.group]} (${entry.sets})`).join(', ')}`
        + ' — acima deste ponto o retorno é pequeno e a recuperação passa a ser o limite.',
      referenceIds: ['schoenfeld-2017-volume', 'acsm-2009'],
    });
  }

  // Grupos ausentes por completo.
  const missing = PRIMARY_GROUPS.filter(
    (group) => !weeklySets.some((entry) => entry.group === group),
  );
  if (missing.length > 0) {
    findings.push({
      tone: 'gap',
      title: 'Sem trabalho dirigido',
      detail: `${missing.map((group) => MUSCLE_LABELS[group]).join(', ')}. `
        + 'Pode ser deliberado; se não for, é o mais fácil de corrigir.',
      referenceIds: ['acsm-2009'],
    });
  }

  // Descanso.
  if (restDays === 0 || longestStreakDays >= LIMITS.maxConsecutiveTrainingDays) {
    findings.push({
      tone: 'watch',
      title: 'Pouco descanso na semana',
      detail: longestStreakDays >= LIMITS.maxConsecutiveTrainingDays
        ? `${longestStreakDays} dias de treino seguidos. O treino é o estímulo; a adaptação `
          + 'acontece no descanso.'
        : 'Sete dias marcados, zero de folga.',
      referenceIds: ['garber-2011'],
    });
  } else if (sessionsPerWeek >= 2) {
    findings.push({
      tone: 'good',
      title: `${sessionsPerWeek} dias de treino, ${restDays} de folga`,
      detail: 'Reforço muscular em dois ou mais dias por semana é o que a OMS recomenda.',
      referenceIds: ['who-2020'],
    });
  }

  // Intensidade: só se houver RPE registado.
  if (avgRpe == null) {
    findings.push({
      tone: 'unknown',
      title: 'Sem RPE registado',
      detail:
        'Sem o esforço percebido no fim das sessões não consigo dizer nada sobre '
        + 'intensidade — e prefiro dizer isso a inventar uma leitura.',
      referenceIds: ['foster-2001'],
    });
  } else if (avgRpe >= 9) {
    findings.push({
      tone: 'watch',
      title: `RPE médio de ${avgRpe}`,
      detail:
        'Quase todas as sessões perto do limite. Alternar semanas mais leves costuma '
        + 'sustentar melhor o progresso do que manter tudo no máximo.',
      referenceIds: ['foster-2001', 'acsm-2009'],
    });
  } else if (avgRpe <= 4) {
    findings.push({
      tone: 'gap',
      title: `RPE médio de ${avgRpe}`,
      detail: 'Margem para subir carga ou repetições, se o objetivo for progredir.',
      referenceIds: ['acsm-2009'],
    });
  }

  return findings;
}
