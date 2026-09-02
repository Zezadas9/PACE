/**
 * PACE — o vocabulário do assistente.
 *
 * Duas ideias sustentam tudo o que vem a seguir:
 *
 * 1. O assistente **propõe**, não escreve. Uma resposta traz blocos de texto e
 *    ações; cada ação é uma carga útil completa que o utilizador confirma. Nada
 *    entra na agenda, nos treinos ou nos planos sem esse toque.
 * 2. O contexto é **o que o utilizador autorizou**, e cada campo pode estar
 *    ausente. Um campo em falta faz a resposta dizer que não sabe, nunca
 *    inventar um valor plausível.
 */

import type {
  ActivitySession, AiSettings, DayKey, Exercise, Food, Goal, Habit, HabitEntry, Meal,
  RunPlan, SessionDifficulty, UserPreferences, WaterEntry, Workout, WorkoutSession,
} from '../../core/types';
import type { Reference } from './references';

/** O retrato que o assistente pode ler. Tudo é opcional por desenho. */
export interface CoachContext {
  today: DayKey;
  settings: AiSettings;
  preferences: UserPreferences;

  profile: {
    name: string | null;
    ageYears: number | null;
    gender: string | null;
    heightCm: number | null;
    weightKg: number | null;
  } | null;

  goals: Goal[];
  workouts: Workout[];
  exercises: Exercise[];
  sessions: WorkoutSession[];
  activities: ActivitySession[];
  habits: Habit[];
  habitEntries: HabitEntry[];
  meals: Meal[];
  foods: Food[];
  water: WaterEntry[];
  runPlan: RunPlan | null;
  /** Reservado: ainda não há dados de sono na aplicação. */
  sleep: null;
}

/* --- O que uma resposta contém ------------------------------------------------- */

export type CoachBlock =
  | { kind: 'text'; text: string }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | { kind: 'metrics'; items: Array<{ label: string; value: string; note?: string }> }
  /** Um aviso: falta de dados, limite de segurança, encaminhamento clínico. */
  | { kind: 'notice'; tone: 'info' | 'caution' | 'medical'; text: string }
  /** As fontes por trás do que foi dito. */
  | { kind: 'references'; ids: string[] }
  /** Uma afirmação assumidamente sem evidência forte por trás. */
  | { kind: 'caveat'; text: string };

/* --- O que uma resposta propõe -------------------------------------------------- */

export interface WorkoutDraft {
  title: string;
  type: Workout['type'];
  estimatedMin: number;
  weekdays: number[];
  blocks: Array<{
    section: 'warmup' | 'main' | 'cardio';
    exerciseName: string;
    muscleGroups: Array<Exercise['muscleGroups'][number]>;
    isBodyweight: boolean;
    sets: number;
    reps: number | null;
    durationSec: number | null;
    restSec: number | null;
    note: string | null;
  }>;
}

export interface HabitDraft {
  title: string;
  kind: Habit['kind'];
  frequency: Habit['frequency'];
  weekdays: number[];
  target: number;
  unit: string | null;
  timeOfDay: string | null;
  durationMin: number | null;
  essential: boolean;
  /** Porque é sugerido, com fonte quando existe. */
  rationale: string;
  referenceIds: string[];
}

export interface RunPlanDraft {
  title: string;
  goalDistanceM: number;
  weeks: number;
  weekdays: number[];
  startDate: DayKey;
  sessions: Array<{
    weekIndex: number;
    date: DayKey;
    kind: RunPlan['sessions'][number]['kind'];
    segments: Array<{ runSec: number; walkSec: number; repeats: number }>;
    targetDistanceM: number | null;
    targetDurationSec: number | null;
    note: string | null;
  }>;
}

export interface WeekPlanDraft {
  /** Uma linha por dia da semana, 0 = domingo. */
  days: Array<{
    weekday: number;
    items: Array<{ kind: 'workout' | 'run' | 'walk' | 'rest'; label: string; existing: boolean }>;
  }>;
  /** Planos de treino a que a proposta atribui dias, e quais. */
  workoutAssignments: Array<{ workoutId: string; title: string; weekdays: number[] }>;
  /** Hábitos a criar para as corridas e caminhadas. */
  habitDrafts: HabitDraft[];
  /** O que já estava marcado e fica exatamente como está. */
  untouched: string[];
}

export type CoachAction =
  | { kind: 'create_workout'; label: string; draft: WorkoutDraft }
  | { kind: 'create_habits'; label: string; drafts: HabitDraft[] }
  | { kind: 'create_run_plan'; label: string; draft: RunPlanDraft }
  | { kind: 'apply_week_plan'; label: string; draft: WeekPlanDraft }
  | { kind: 'open'; label: string; path: string };

export interface CoachTurn {
  blocks: CoachBlock[];
  actions: CoachAction[];
  /** Perguntas de seguimento, oferecidas como atalhos. */
  followUps: string[];
  /**
   * O que foi entendido nesta vez.
   *
   * Fica guardado com a resposta para a mensagem seguinte poder corrigi-la —
   * "mas só de superiores" precisa de saber que antes disto houve um pedido de
   * treino de 45 minutos.
   */
  intent?: unknown;
}

/* --- Ajudas partilhadas ---------------------------------------------------------- */

export function text(value: string): CoachBlock {
  return { kind: 'text', text: value };
}

export function notice(tone: 'info' | 'caution' | 'medical', value: string): CoachBlock {
  return { kind: 'notice', tone, text: value };
}

export function sources(...ids: string[]): CoachBlock {
  return { kind: 'references', ids };
}

export function caveat(value: string): CoachBlock {
  return { kind: 'caveat', text: value };
}

export type { Reference, SessionDifficulty };
