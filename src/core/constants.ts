/**
 * PACE — Constants.
 * Every fixed vocabulary the app speaks, as data rather than scattered strings.
 */

import type {
  DistanceUnit, EventCategory, Gender, GoalType, HabitFrequency, HabitKind,
  ActivityGoalMetric, ActivityGoalPeriod, ActivityType, PaceMode,
  FoodUnit, MealType, NutritionGoalMetric, SessionDifficulty, TaskCategory,
  TaskPriority, WeightUnit, WorkoutSection, WorkoutType,
} from './types';
import type { RecurrenceKind } from './scheduling';

export const APP = {
  name: 'PACE',
  version: '0.3.0',
  /** Bump when a stored shape changes; migrations live in data/snapshot.ts */
  schemaVersion: 7,
  storageNamespace: 'pace',
  locale: 'pt-PT',
} as const;

export interface Option<T extends string> {
  id: T;
  label: string;
}

export const GENDER_OPTIONS: ReadonlyArray<Option<Gender>> = [
  { id: 'female', label: 'Feminino' },
  { id: 'male', label: 'Masculino' },
  { id: 'other', label: 'Outro' },
  { id: 'undisclosed', label: 'Prefiro não dizer' },
];

export const WEIGHT_UNIT_OPTIONS: ReadonlyArray<Option<WeightUnit>> = [
  { id: 'kg', label: 'Quilogramas (kg)' },
  { id: 'lb', label: 'Libras (lb)' },
];

export const DISTANCE_UNIT_OPTIONS: ReadonlyArray<Option<DistanceUnit>> = [
  { id: 'km', label: 'Quilómetros (km)' },
  { id: 'mi', label: 'Milhas (mi)' },
];

export interface GoalCatalogEntry extends Option<GoalType> {
  icon: string;
}

export const GOAL_CATALOG: ReadonlyArray<GoalCatalogEntry> = [
  { id: 'lose_weight', label: 'Perder peso', icon: 'trendDown' },
  { id: 'gain_muscle', label: 'Ganhar massa muscular', icon: 'dumbbell' },
  { id: 'improve_fitness', label: 'Melhorar condição física', icon: 'heart' },
  { id: 'run_more', label: 'Correr mais', icon: 'run' },
  { id: 'build_habits', label: 'Criar hábitos', icon: 'repeat' },
  { id: 'eat_better', label: 'Melhorar alimentação', icon: 'leaf' },
  { id: 'consistency', label: 'Aumentar consistência', icon: 'flame' },
  { id: 'maintain_weight', label: 'Manter peso', icon: 'scale' },
  { id: 'other', label: 'Outro', icon: 'sparkle' },
];

export interface BmiBand {
  id: string;
  label: string;
  min: number;
  max: number;
}

/** WHO adult ranges. Presented as an estimate, never as a diagnosis. */
export const BMI_BANDS: ReadonlyArray<BmiBand> = [
  { id: 'under', label: 'Abaixo do peso', min: 0, max: 18.5 },
  { id: 'normal', label: 'Peso normal', min: 18.5, max: 25 },
  { id: 'over', label: 'Excesso de peso', min: 25, max: 30 },
  { id: 'obese1', label: 'Obesidade grau I', min: 30, max: 35 },
  { id: 'obese2', label: 'Obesidade grau II', min: 35, max: 40 },
  { id: 'obese3', label: 'Obesidade grau III', min: 40, max: Infinity },
];

/* --- Display labels ------------------------------------------------------- */

export interface ActivityTypeEntry extends Option<ActivityType> {
  icon: string;
  /**
   * How the session is read back. Runners think in minutes per kilometre;
   * cyclists think in kilometres per hour. Showing the wrong one is the kind of
   * detail that tells a user the app was not built by someone who trains.
   */
  paceMode: PaceMode;
}

export const ACTIVITY_TYPE_OPTIONS: ReadonlyArray<ActivityTypeEntry> = [
  { id: 'run', label: 'Corrida', icon: 'run', paceMode: 'pace' },
  { id: 'walk', label: 'Caminhada', icon: 'walk', paceMode: 'pace' },
  { id: 'brisk_walk', label: 'Caminhada rápida', icon: 'walk', paceMode: 'pace' },
  { id: 'ride', label: 'Bicicleta', icon: 'bike', paceMode: 'speed' },
  { id: 'hike', label: 'Hiking', icon: 'mountain', paceMode: 'pace' },
  { id: 'other', label: 'Outro', icon: 'activity', paceMode: 'none' },
];

export const ACTIVITY_LABELS: Record<ActivityType, string> =
  Object.fromEntries(ACTIVITY_TYPE_OPTIONS.map((o) => [o.id, o.label])) as
    Record<ActivityType, string>;

export function paceModeFor(type: ActivityType): PaceMode {
  return ACTIVITY_TYPE_OPTIONS.find((o) => o.id === type)?.paceMode ?? 'none';
}

export const ACTIVITY_GOAL_METRIC_OPTIONS: ReadonlyArray<Option<ActivityGoalMetric>> = [
  { id: 'distance', label: 'Distância' },
  { id: 'duration', label: 'Tempo' },
  { id: 'sessions', label: 'Vezes' },
];

export const ACTIVITY_GOAL_PERIOD_OPTIONS: ReadonlyArray<Option<ActivityGoalPeriod>> = [
  { id: 'day', label: 'Por dia' },
  { id: 'week', label: 'Por semana' },
];

/**
 * How far apart two fixes must be before the track records another point.
 * Below this the phone is reporting noise, not movement, and the route turns
 * into a scribble around wherever you are standing.
 */
export const TRACK_MIN_DISTANCE_M = 8;

/** GPS accuracy worse than this is discarded rather than trusted. */
export const TRACK_MAX_ACCURACY_M = 40;

export const MEAL_TYPE_OPTIONS: ReadonlyArray<Option<MealType>> = [
  { id: 'breakfast', label: 'Pequeno-almoço' },
  { id: 'lunch', label: 'Almoço' },
  { id: 'dinner', label: 'Jantar' },
  { id: 'snack', label: 'Snack' },
  { id: 'supper', label: 'Ceia' },
  { id: 'other', label: 'Outra' },
];

export const MEAL_LABELS: Record<MealType, string> =
  Object.fromEntries(MEAL_TYPE_OPTIONS.map((o) => [o.id, o.label])) as
    Record<MealType, string>;

/** The order meals are shown in across a day. */
export const MEAL_ORDER: ReadonlyArray<MealType> = [
  'breakfast', 'snack', 'lunch', 'dinner', 'supper', 'other',
];

export const FOOD_UNIT_OPTIONS: ReadonlyArray<Option<FoodUnit>> = [
  { id: 'g', label: 'g' },
  { id: 'ml', label: 'ml' },
  { id: 'unit', label: 'unidade' },
  { id: 'portion', label: 'porção' },
];

export const FOOD_UNIT_LABELS: Record<FoodUnit, string> =
  Object.fromEntries(FOOD_UNIT_OPTIONS.map((o) => [o.id, o.label])) as
    Record<FoodUnit, string>;

export interface NutritionMetricEntry extends Option<NutritionGoalMetric> {
  /** The unit the target is stored and shown in. */
  unit: string;
}

export const NUTRITION_GOAL_OPTIONS: ReadonlyArray<NutritionMetricEntry> = [
  { id: 'calories', label: 'Calorias', unit: 'kcal' },
  { id: 'protein', label: 'Proteína', unit: 'g' },
  { id: 'carbs', label: 'Hidratos', unit: 'g' },
  { id: 'fat', label: 'Gordura', unit: 'g' },
  { id: 'fiber', label: 'Fibra', unit: 'g' },
  { id: 'water', label: 'Água', unit: 'ml' },
  { id: 'meals', label: 'Refeições', unit: '' },
  { id: 'custom', label: 'Outro', unit: '' },
];

/** Quick-add sizes for water, in millilitres. */
export const WATER_PRESETS = [200, 330, 500] as const;

export const WORKOUT_TYPE_OPTIONS: ReadonlyArray<Option<WorkoutType>> = [
  { id: 'strength', label: 'Musculação' },
  { id: 'functional', label: 'Funcional' },
  { id: 'calisthenics', label: 'Calistenia' },
  { id: 'hiit', label: 'HIIT' },
  { id: 'mobility', label: 'Mobilidade' },
  { id: 'pilates', label: 'Pilates' },
  { id: 'sport', label: 'Desportivo' },
  { id: 'other', label: 'Outro' },
];

export const WORKOUT_TYPE_LABELS: Record<WorkoutType, string> =
  Object.fromEntries(WORKOUT_TYPE_OPTIONS.map((o) => [o.id, o.label])) as
    Record<WorkoutType, string>;

/**
 * Which types are measured by load. Volume (reps x kg) is meaningful for
 * musculação and calistenia with added weight; it is noise for mobility or a
 * football session, so the session summary hides it there.
 */
export const LOAD_BEARING_TYPES: ReadonlyArray<WorkoutType> = [
  'strength', 'calisthenics', 'functional',
];

export const SESSION_DIFFICULTY_OPTIONS: ReadonlyArray<Option<SessionDifficulty>> = [
  { id: 'easy', label: 'Fácil' },
  { id: 'right', label: 'Na medida' },
  { id: 'hard', label: 'Difícil' },
];

/** Borg CR10, labelled where it helps and left blank where it does not. */
export const RPE_SCALE = [
  { value: 1, label: 'Muito leve' },
  { value: 2, label: '' },
  { value: 3, label: 'Leve' },
  { value: 4, label: '' },
  { value: 5, label: 'Moderado' },
  { value: 6, label: '' },
  { value: 7, label: 'Intenso' },
  { value: 8, label: '' },
  { value: 9, label: 'Muito intenso' },
  { value: 10, label: 'Máximo' },
] as const;

/**
 * The workout types built as warm-up, main set and cardio.
 *
 * Weights, functional, calisthenics, HIIT and sport training all follow that
 * shape. Mobility and Pilates do not: the session *is* the practice, and
 * splitting it into three would be inventing a structure the discipline does
 * not have.
 */
export const SECTIONED_WORKOUT_TYPES: ReadonlyArray<WorkoutType> = [
  'strength', 'functional', 'calisthenics', 'hiit', 'sport',
];

export function hasSections(type: WorkoutType): boolean {
  return SECTIONED_WORKOUT_TYPES.includes(type);
}

export const WORKOUT_SECTION_OPTIONS: ReadonlyArray<Option<WorkoutSection>> = [
  { id: 'warmup', label: 'Aquecimento' },
  { id: 'main', label: 'Workout' },
  { id: 'cardio', label: 'Cardio' },
];

export const WORKOUT_SECTION_LABELS: Record<WorkoutSection, string> =
  Object.fromEntries(WORKOUT_SECTION_OPTIONS.map((o) => [o.id, o.label])) as
    Record<WorkoutSection, string>;

/** Rest presets offered in the workout builder, in seconds. */
export const REST_PRESETS = [30, 45, 60, 90, 120, 180] as const;

/** The age range the app accepts, in years. */
export const MIN_AGE = 10;
export const MAX_AGE = 130;

/* --- Navigation ----------------------------------------------------------- */

export type TabId =
  | 'today' | 'agenda' | 'workout' | 'activity' | 'nutrition' | 'assistant' | 'profile';

export interface TabRoute {
  id: TabId;
  path: string;
  label: string;
  icon: string;
  /** O icone ilustrado da folha da marca, pela legenda que tem por baixo. */
  brand: string;
}

/** Bottom navigation. The AI tab is deliberately absent in this phase. */
export const TABS: ReadonlyArray<TabRoute> = [
  { id: 'today', path: '/hoje', label: 'Hoje', icon: 'sun', brand: 'progresso' },
  { id: 'agenda', path: '/agenda', label: 'Agenda', icon: 'calendar', brand: 'agenda' },
  { id: 'workout', path: '/treino', label: 'Treino', icon: 'dumbbell', brand: 'treinos' },
  { id: 'activity', path: '/atividade', label: 'Atividade', icon: 'run', brand: 'corrida' },
  { id: 'nutrition', path: '/alimentacao', label: 'Alimentação', icon: 'leaf', brand: 'alimentacao' },
  { id: 'assistant', path: '/ia', label: 'IA', icon: 'sparkle', brand: 'ia' },
  { id: 'profile', path: '/perfil', label: 'Perfil', icon: 'user', brand: 'perfil' },
];

export const ONBOARDING_PATH = '/onboarding';
export const DEFAULT_PATH = '/hoje';
export const SESSION_PATH = '/treino/sessao';
export const ACTIVITY_SESSION_PATH = '/atividade/sessao';

/* --- Agenda --------------------------------------------------------------- */

export const EVENT_CATEGORY_OPTIONS: ReadonlyArray<Option<EventCategory>> = [
  { id: 'work', label: 'Trabalho' },
  { id: 'school', label: 'Escola' },
  { id: 'appointment', label: 'Consulta' },
  { id: 'meeting', label: 'Reunião' },
  { id: 'commitment', label: 'Compromisso' },
  { id: 'personal', label: 'Pessoal' },
];

export const TASK_CATEGORY_OPTIONS: ReadonlyArray<Option<TaskCategory>> = [
  { id: 'general', label: 'Geral' },
  { id: 'work', label: 'Trabalho' },
  { id: 'study', label: 'Estudo' },
  { id: 'home', label: 'Casa' },
  { id: 'health', label: 'Saúde' },
  { id: 'finance', label: 'Finanças' },
  { id: 'errand', label: 'Recados' },
];

export const TASK_PRIORITY_OPTIONS: ReadonlyArray<Option<TaskPriority>> = [
  { id: 'low', label: 'Baixa' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'Alta' },
];

export const HABIT_KIND_OPTIONS: ReadonlyArray<Option<HabitKind>> = [
  { id: 'check', label: 'Fazer' },
  { id: 'count', label: 'Contar' },
  { id: 'duration', label: 'Durar' },
];

export const HABIT_FREQUENCY_OPTIONS: ReadonlyArray<Option<HabitFrequency>> = [
  { id: 'daily', label: 'Todos os dias' },
  { id: 'weekdays', label: 'Dias úteis' },
  { id: 'custom', label: 'Dias específicos' },
  { id: 'interval', label: 'De X em X dias' },
];

export const RECURRENCE_OPTIONS: ReadonlyArray<Option<RecurrenceKind>> = [
  { id: 'none', label: 'Não repete' },
  { id: 'daily', label: 'Diariamente' },
  { id: 'weekly', label: 'Semanalmente' },
  { id: 'monthly', label: 'Mensalmente' },
  { id: 'yearly', label: 'Anualmente' },
];

/** Minutes before an event that a reminder may fire. */
export const REMINDER_LEAD_OPTIONS: ReadonlyArray<Option<string>> = [
  { id: '0', label: 'À hora' },
  { id: '10', label: '10 min antes' },
  { id: '30', label: '30 min antes' },
  { id: '60', label: '1 h antes' },
  { id: '1440', label: '1 dia antes' },
];

/** Repeat cadences offered for a habit reminder window. */
export const REMINDER_INTERVAL_OPTIONS: ReadonlyArray<Option<string>> = [
  { id: 'once', label: 'Uma vez' },
  { id: '30', label: '30 em 30 min' },
  { id: '60', label: 'De hora a hora' },
  { id: '120', label: 'De 2 em 2 h' },
  { id: '180', label: 'De 3 em 3 h' },
];

/**
 * Above this many reminders per day from a single habit, the app asks before
 * scheduling. "De 30 em 30 minutos das 08:00 às 22:00" is 29 notifications —
 * a reasonable thing to want, and a terrible thing to get by accident.
 */
export const REMINDER_CONFIRM_THRESHOLD = 8;

/** Hard ceiling across everything, so a bad config cannot flood the OS queue. */
export const MAX_SCHEDULED_NOTIFICATIONS = 64;

export type AgendaView = 'day' | 'week' | 'month' | 'year';

export const AGENDA_VIEW_OPTIONS: ReadonlyArray<Option<AgendaView>> = [
  { id: 'day', label: 'Dia' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'year', label: 'Ano' },
];

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> =
  Object.fromEntries(EVENT_CATEGORY_OPTIONS.map((o) => [o.id, o.label])) as
    Record<EventCategory, string>;

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> =
  Object.fromEntries(TASK_CATEGORY_OPTIONS.map((o) => [o.id, o.label])) as
    Record<TaskCategory, string>;
