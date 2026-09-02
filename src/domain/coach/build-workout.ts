/**
 * PACE — construir um treino que caiba no tempo pedido.
 *
 * O tempo é a restrição real: "45 minutos" não é uma sugestão, é o que a pessoa
 * tem. Por isso o construtor trabalha ao contrário — orçamento de segundos,
 * aquecimento primeiro, multiarticulares antes do acessório, e para quando o
 * tempo acaba em vez de escrever uma lista que não cabe.
 *
 * As séries e repetições seguem os intervalos da posição da ACSM por objetivo
 * (acsm-2009); o volume por grupo muscular olha para a meta-análise de volume
 * semanal (schoenfeld-2017-volume). Nada aqui é personalizado ao nível de um
 * treinador que te vê levantar — e a resposta diz isso.
 */

import type { MuscleGroup, WorkoutType } from '../../core/types';
import {
  CARDIO_LIBRARY, CIRCUIT_LIBRARY, FULL_BODY_ORDER, MOBILITY_LIBRARY, MUSCLE_LABELS,
  PILATES_LIBRARY, STRENGTH_LIBRARY, WARMUP_LIBRARY, type CoachExercise,
} from './exercises';
import type { WorkoutDraft } from './types';

export interface BuildRequest {
  minutes: number;
  muscles: MuscleGroup[];
  /** Grupos a deixar de fora, mesmo que caibam no tempo. */
  excluded?: MuscleGroup[];
  type: WorkoutType;
  /** Objetivo dominante do utilizador, quando autorizado. */
  goal: 'gain_muscle' | 'lose_weight' | 'improve_fitness' | 'general';
  /** Sem ginásio, só entram exercícios que não precisam de máquinas. */
  equipment?: 'gym' | 'home' | 'bodyweight' | null;
  weekdays: number[];
}

interface Prescription {
  sets: number;
  reps: number;
  restSec: number;
}

/** Séries, repetições e descanso por objetivo. Intervalos, não certezas. */
function prescribe(goal: BuildRequest['goal'], tier: 1 | 2 | 3): Prescription {
  if (goal === 'gain_muscle') {
    return tier === 1
      ? { sets: 4, reps: 8, restSec: 120 }
      : { sets: 3, reps: 10, restSec: 90 };
  }
  if (goal === 'lose_weight' || goal === 'improve_fitness') {
    return tier === 1
      ? { sets: 3, reps: 12, restSec: 75 }
      : { sets: 3, reps: 12, restSec: 60 };
  }
  return tier === 1
    ? { sets: 3, reps: 10, restSec: 90 }
    : { sets: 3, reps: 12, restSec: 60 };
}

function blockSeconds(exercise: CoachExercise, sets: number, restSec: number): number {
  return sets * (exercise.workSec + restSec);
}

/** Quais os grupos a treinar: o que foi pedido, ou o corpo inteiro. */
function targetGroups(muscles: MuscleGroup[], excluded: MuscleGroup[] = []): MuscleGroup[] {
  const asked = muscles.filter((group) => group !== 'full_body' && !excluded.includes(group));
  if (asked.length > 0) return asked;
  return FULL_BODY_ORDER.filter((group) => !excluded.includes(group));
}

/**
 * A ordem por que os exercícios entram: multiarticulares primeiro, e a rodar
 * entre os grupos pedidos.
 *
 * Rodar importa. Um treino de pernas só tem um grupo, e uma passagem por grupo
 * dava três exercícios e sobravam quinze minutos; num treino de corpo inteiro,
 * ir buscar tudo de um grupo antes de passar ao seguinte deixava metade do
 * corpo de fora quando o tempo acabasse.
 */
function pickExercises(groups: MuscleGroup[], bodyweightOnly: boolean): CoachExercise[] {
  const out: CoachExercise[] = [];
  const library = bodyweightOnly
    ? STRENGTH_LIBRARY.filter((exercise) => exercise.isBodyweight)
    : STRENGTH_LIBRARY;

  for (const tier of [1, 2, 3] as const) {
    const byGroup = groups.map((group) => library.filter(
      (exercise) => exercise.tier === tier && exercise.muscleGroups[0] === group,
    ));
    const deepest = Math.max(0, ...byGroup.map((list) => list.length));
    for (let round = 0; round < deepest; round += 1) {
      for (const list of byGroup) {
        const pick = list[round];
        if (pick && !out.includes(pick)) out.push(pick);
      }
    }
  }
  return out;
}

export function buildWorkout(request: BuildRequest): WorkoutDraft {
  const groups = targetGroups(request.muscles, request.excluded);
  const budgetSec = request.minutes * 60;
  const bodyweightOnly = request.equipment === 'bodyweight' || request.equipment === 'home'
    || request.type === 'calisthenics';

  if (request.type === 'mobility') return buildFromLibrary(request, budgetSec, MOBILITY_LIBRARY, 2);
  if (request.type === 'pilates') return buildFromLibrary(request, budgetSec, PILATES_LIBRARY, 2);
  if (request.type === 'hiit' || request.type === 'functional') {
    return buildCircuit(request, budgetSec);
  }

  const blocks: WorkoutDraft['blocks'] = [];

  /* Aquecimento: cerca de um sexto da sessão, nunca menos de cinco minutos.
     É a parte que se corta primeiro quando há pressa e a que menos convém
     cortar. */
  const warmupBudget = Math.max(300, Math.round(budgetSec / 6));
  let warmupUsed = 0;
  for (const item of WARMUP_LIBRARY) {
    if (!groups.some((group) => item.forGroups.includes(group))) continue;
    const isGeneral = item.workSec >= 200;
    const sets = isGeneral ? 1 : 2;
    const seconds = isGeneral
      ? Math.min(item.workSec, warmupBudget)
      : sets * (item.workSec + 15);
    if (warmupUsed + seconds > warmupBudget && warmupUsed > 0) break;
    warmupUsed += seconds;
    blocks.push({
      section: 'warmup',
      exerciseName: item.name,
      muscleGroups: item.muscleGroups,
      isBodyweight: item.isBodyweight,
      sets,
      reps: null,
      durationSec: isGeneral ? seconds : item.workSec,
      restSec: isGeneral ? null : 15,
      note: null,
    });
  }

  /* Parte principal: entra exercício a exercício enquanto houver tempo. */
  let used = warmupUsed;
  for (const exercise of pickExercises(groups, bodyweightOnly)) {
    const prescription = prescribe(request.goal, exercise.tier);
    const cost = blockSeconds(exercise, prescription.sets, prescription.restSec);
    if (used + cost > budgetSec) continue;
    used += cost;
    blocks.push({
      section: 'main',
      exerciseName: exercise.name,
      muscleGroups: exercise.muscleGroups,
      isBodyweight: exercise.isBodyweight,
      sets: prescription.sets,
      reps: prescription.reps,
      durationSec: null,
      restSec: prescription.restSec,
      note: null,
    });
  }

  /* Cardio no fim, só se sobrarem oito minutos e o objetivo o justificar.
     Encher o tempo por encher não é treino. */
  const left = budgetSec - used;
  const wantsCardio = request.goal === 'lose_weight' || request.goal === 'improve_fitness';
  const cardio = CARDIO_LIBRARY[0];
  if (wantsCardio && left >= 480 && cardio) {
    const seconds = Math.min(left, 900);
    blocks.push({
      section: 'cardio',
      exerciseName: cardio.name,
      muscleGroups: cardio.muscleGroups,
      isBodyweight: false,
      sets: 1,
      reps: null,
      durationSec: seconds,
      restSec: null,
      note: 'Ritmo em que ainda consegues falar.',
    });
    used += seconds;
  }

  /* O título vem do que ficou dentro, não do que foi pedido. Se o tempo não
     chegou para os braços, o treino não se chama "de braços". */
  const trained = blocks
    .filter((block) => block.section === 'main')
    .map((block) => block.muscleGroups[0])
    .filter((group): group is MuscleGroup => group != null);

  return {
    title: workoutTitle([...new Set(trained.length > 0 ? trained : groups)], request.minutes),
    type: request.type,
    estimatedMin: Math.round(used / 60),
    weekdays: request.weekdays,
    blocks,
  };
}

/**
 * Sessões de solo — mobilidade, pilates: sem cargas, tempo por posição, e uma
 * lista curta feita para caber no tempo em vez de o encher.
 */
function buildFromLibrary(
  request: BuildRequest,
  budgetSec: number,
  library: ReadonlyArray<CoachExercise>,
  sets: number,
): WorkoutDraft {
  const blocks: WorkoutDraft['blocks'] = [];
  let used = 0;
  for (const item of library) {
    const cost = sets * (item.workSec + 20);
    if (used + cost > budgetSec && blocks.length > 0) break;
    used += cost;
    blocks.push({
      section: 'main',
      exerciseName: item.name,
      muscleGroups: item.muscleGroups,
      isBodyweight: true,
      sets,
      reps: null,
      durationSec: item.workSec,
      restSec: 20,
      note: null,
    });
  }
  // O título leva os minutos que a sessão tem, não os que foram pedidos: uma
  // rotina de mobilidade honesta são dez minutos, e chamar-lhe 45 é mentir.
  const realMinutes = Math.round(used / 60);
  return {
    title: request.type === 'pilates'
      ? `Pilates de ${realMinutes} min`
      : `Mobilidade de ${realMinutes} min`,
    type: request.type,
    estimatedMin: realMinutes,
    weekdays: request.weekdays,
    blocks,
  };
}

/**
 * Circuito para HIIT e funcional.
 *
 * Trabalho curto, descanso curto, várias voltas. O aquecimento não desaparece
 * por ser um treino curto — é precisamente quando mais falta faz.
 */
function buildCircuit(request: BuildRequest, budgetSec: number): WorkoutDraft {
  const hiit = request.type === 'hiit';
  const workSec = hiit ? 30 : 40;
  const restSec = hiit ? 30 : 20;
  const blocks: WorkoutDraft['blocks'] = [];

  const warmup = WARMUP_LIBRARY[0];
  let used = 0;
  if (warmup) {
    used += 300;
    blocks.push({
      section: 'warmup',
      exerciseName: warmup.name,
      muscleGroups: warmup.muscleGroups,
      isBodyweight: warmup.isBodyweight,
      sets: 1,
      reps: null,
      durationSec: 300,
      restSec: null,
      note: 'Sobe o ritmo aos poucos.',
    });
  }

  // Quantas voltas cabem no que sobra, com um minuto entre elas.
  const perExercise = workSec + restSec;
  const exercises = CIRCUIT_LIBRARY.slice(0, request.minutes >= 30 ? 6 : 4);
  const roundSec = exercises.length * perExercise + 60;
  const rounds = Math.max(2, Math.min(6, Math.floor((budgetSec - used) / roundSec)));

  for (const exercise of exercises) {
    used += rounds * perExercise;
    blocks.push({
      section: 'main',
      exerciseName: exercise.name,
      muscleGroups: exercise.muscleGroups,
      isBodyweight: true,
      sets: rounds,
      reps: null,
      durationSec: workSec,
      restSec,
      note: null,
    });
  }
  used += rounds * 60;

  const realMinutes = Math.min(request.minutes, Math.round(used / 60));
  return {
    title: hiit ? `HIIT de ${realMinutes} min` : `Funcional de ${realMinutes} min`,
    type: request.type,
    estimatedMin: realMinutes,
    weekdays: request.weekdays,
    blocks,
  };
}

function workoutTitle(groups: MuscleGroup[], minutes: number): string {
  void minutes;
  if (groups.length >= 5) return 'Corpo inteiro';
  const names = groups.map((group) => MUSCLE_LABELS[group]);
  const label = names.length === 1
    ? names[0]
    : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  return `Treino de ${label}`;
}

/** Séries por grupo muscular num rascunho, para o texto que acompanha. */
export function setsByGroup(draft: WorkoutDraft): Array<{ group: MuscleGroup; sets: number }> {
  const counts = new Map<MuscleGroup, number>();
  for (const block of draft.blocks) {
    if (block.section !== 'main') continue;
    const primary = block.muscleGroups[0];
    if (!primary) continue;
    counts.set(primary, (counts.get(primary) ?? 0) + block.sets);
  }
  return [...counts.entries()].map(([group, sets]) => ({ group, sets }));
}
