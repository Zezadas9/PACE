/**
 * PACE — Domain model.
 *
 * Every entity the app will ever store, typed once. Most are not yet used by a
 * screen: they exist so that a later phase adds behaviour, not architecture.
 *
 * Canonical storage is always metric and always ISO:
 *   - mass in kilograms, length in centimetres, distance in metres
 *   - dates as "YYYY-MM-DD" (local), timestamps as ISO-8601 strings
 * Units in `User.preferences` affect presentation only.
 */

import type { Recurrence, ReminderLead, ReminderWindow } from './scheduling';

export type { Recurrence, ReminderLead, ReminderWindow } from './scheduling';

/** Local calendar day, "YYYY-MM-DD". Never derived from toISOString(). */
export type DayKey = string;
/** ISO-8601 instant. */
export type Timestamp = string;
/** "HH:mm" */
export type ClockTime = string;

/** Fields shared by every stored record. */
export interface Entity {
  id: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/* --- Vocabularies -------------------------------------------------------- */

export type Gender = 'female' | 'male' | 'other' | 'undisclosed';
export type WeightUnit = 'kg' | 'lb';
export type DistanceUnit = 'km' | 'mi';
export type HeightUnit = 'cm' | 'ft_in';
export type ThemePreference = 'system' | 'light' | 'dark';

export type GoalType =
  | 'lose_weight'
  | 'gain_muscle'
  | 'improve_fitness'
  | 'run_more'
  | 'build_habits'
  | 'eat_better'
  | 'consistency'
  | 'maintain_weight'
  | 'other';

export type HabitFrequency = 'daily' | 'weekdays' | 'weekly' | 'custom' | 'interval';
export type HabitKind = 'check' | 'count' | 'duration';

export type TaskPriority = 'low' | 'normal' | 'high';
export type TaskStatus = 'open' | 'done' | 'skipped';

export type WorkoutType =
  | 'strength'      // musculação
  | 'functional'    // treino funcional
  | 'calisthenics'  // calistenia
  | 'hiit'
  | 'mobility'      // mobilidade
  | 'pilates'
  | 'sport'         // treino desportivo
  | 'other';

/** How the session felt, asked once at the end. */
export type SessionDifficulty = 'easy' | 'right' | 'hard';
export type MuscleGroup =
  | 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'core' | 'full_body';

export type ActivityType =
  | 'run'         // corrida
  | 'walk'        // caminhada
  | 'brisk_walk'  // caminhada rápida
  | 'ride'        // bicicleta
  | 'hike'        // hiking
  | 'other';

/** What a session is measured by. Pace suits feet, speed suits wheels. */
export type PaceMode = 'pace' | 'speed' | 'none';

/** One fix from the GPS, relative to the start of the session. */
export interface ActivityTrackPoint {
  lat: number;
  lon: number;
  /** Milliseconds since `startedAt`, so a track is self-contained. */
  t: number;
  altitudeM: number | null;
}

export type ActivityGoalMetric = 'distance' | 'duration' | 'sessions';
export type ActivityGoalPeriod = 'day' | 'week';

/**
 * A measurable target — "correr 20 km esta semana", "caminhar 30 minutos por
 * dia", "bicicleta 3 vezes por semana".
 *
 * Separate from `Goal`, which holds the open-ended aspirations chosen during
 * onboarding. This one has a number, a period and a deadline, so progress can
 * be computed rather than felt.
 */
export interface ActivityGoal extends Entity {
  title: string;
  /** null means any activity counts. */
  activityType: ActivityType | null;
  metric: ActivityGoalMetric;
  /** Metres, seconds or a plain count, matching `metric`. */
  target: number;
  period: ActivityGoalPeriod;
  active: boolean;
}
export type MealType =
  | 'breakfast'  // pequeno-almoço
  | 'lunch'      // almoço
  | 'dinner'     // jantar
  | 'snack'
  | 'supper'     // ceia
  | 'other';

/** How a quantity is expressed. Only grams convert to nutrition on their own. */
export type FoodUnit = 'g' | 'ml' | 'unit' | 'portion';

export type NutritionGoalMetric =
  | 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'water' | 'meals' | 'custom';
export type StreakKind = 'daily_completion' | 'habit';

/** Where a record came from. Prepares wearables and Health sync. */
export type DataSource = 'manual' | 'healthkit' | 'health_connect' | 'device' | 'import';

/* --- User ---------------------------------------------------------------- */

export interface UserPreferences {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  heightUnit: HeightUnit;
  locale: string;
  theme: ThemePreference;
  timezone: string | null;
}

export interface BodyMetrics {
  heightCm: number | null;
  weightKg: number | null;
  measuredAt: Timestamp | null;
}

export interface User extends Entity {
  name: string;
  birthDate: DayKey | null;
  gender: Gender;
  body: BodyMetrics;
  preferences: UserPreferences;
  /** References Goal.id */
  goalIds: string[];
  onboardingCompleted: boolean;
  onboardingCompletedAt: Timestamp | null;
}

/* --- Goals, habits, tasks ------------------------------------------------- */

export interface Goal extends Entity {
  type: GoalType;
  /** Display label; free text when `type` is 'other'. */
  label: string;
  note: string | null;
  targetValue: number | null;
  targetUnit: string | null;
  targetDate: DayKey | null;
  active: boolean;
}

export interface Habit extends Entity {
  title: string;
  description: string | null;
  kind: HabitKind;
  frequency: HabitFrequency;
  /** 0 = Sunday .. 6 = Saturday, for 'weekly' and 'custom'. */
  weekdays: number[];
  /** Reps or minutes for 'count' / 'duration' habits. */
  target: number;
  unit: string | null;
  timeOfDay: ClockTime | null;
  /** How long one repetition takes, for the agenda timeline. */
  durationMin: number | null;
  /** For frequency 'interval': repeat every N days from `startDate`. */
  intervalDays: number;
  /** Anchor for 'interval', and the first day the habit is expected at all. */
  startDate: DayKey | null;
  reminder: ReminderWindow | null;
  /**
   * Counts toward the perfect day. A habit the user did not mark essential is
   * still tracked and still shown — it just cannot break a streak.
   */
  essential: boolean;
  goalId: string | null;
  /** A design-token name, never a hex value. */
  colorToken: string | null;
  archived: boolean;
}

/** One habit on one day. */
export interface HabitEntry {
  id: string;
  habitId: string;
  date: DayKey;
  completed: boolean;
  value: number;
  completedAt: Timestamp | null;
}

export interface Task extends Entity {
  title: string;
  notes: string | null;
  date: DayKey | null;
  time: ClockTime | null;
  durationMin: number | null;
  priority: TaskPriority;
  category: TaskCategory;
  status: TaskStatus;
  reminder: ReminderLead | null;
  /** Counts toward the perfect day. Off by default: most tasks are not vows. */
  essential: boolean;
  goalId: string | null;
  tags: string[];
}

/* --- Training ------------------------------------------------------------- */

/** A movement in the catalogue. */
export interface Exercise extends Entity {
  name: string;
  muscleGroups: MuscleGroup[];
  equipment: string | null;
  isBodyweight: boolean;
  instructions: string | null;
}

/**
 * Where an exercise sits in a session.
 *
 * Only the types that are actually structured this way use it — a mobility
 * routine or a Pilates class is the whole session, not a main set with a
 * warm-up bolted on. See SECTIONED_WORKOUT_TYPES.
 */
export type WorkoutSection = 'warmup' | 'main' | 'cardio';

/** An exercise as planned inside a workout. */
export interface WorkoutBlock {
  id: string;
  section: WorkoutSection;
  exerciseId: string;
  sets: number;
  reps: number | null;
  loadKg: number | null;
  durationSec: number | null;
  restSec: number | null;
  note: string | null;
}

/** A reusable plan, not a performance. */
export interface Workout extends Entity {
  title: string;
  type: WorkoutType;
  /** Days this plan is scheduled on. 0 = Sunday .. 6 = Saturday; empty = unscheduled. */
  weekdays: number[];
  estimatedMin: number | null;
  blocks: WorkoutBlock[];
  goalId: string | null;
  tags: string[];
  archived: boolean;
}

export interface SetLog {
  setIndex: number;
  /** Filled in as the set is logged, so a plan change cannot rewrite history. */
  reps: number | null;
  loadKg: number | null;
  durationSec: number | null;
  /** Rate of perceived exertion, 1..10. */
  rpe: number | null;
  completed: boolean;
}

/** One performance of a Workout. */
export interface WorkoutSession extends Entity {
  workoutId: string | null;
  date: DayKey;
  startedAt: Timestamp | null;
  endedAt: Timestamp | null;
  durationSec: number | null;
  /** SetLog arrays keyed by WorkoutBlock.id */
  logs: Record<string, SetLog[]>;
  /** Borg CR10 rate of perceived exertion, 1..10. */
  perceivedEffort: number | null;
  difficulty: SessionDifficulty | null;
  notes: string | null;
  /** Counts toward the perfect day. */
  essential: boolean;
  completed: boolean;
}

/* --- Activity ------------------------------------------------------------- */

/** Movement logged outside a training plan. */
export interface ActivitySession extends Entity {
  type: ActivityType;
  date: DayKey;
  startedAt: Timestamp | null;
  /** Set when the session finishes; null while it is still running. */
  endedAt: Timestamp | null;
  /** Set while paused, so elapsed time can exclude the gap. */
  pausedAt: Timestamp | null;
  /** Seconds spent paused across the whole session. */
  pausedTotalSec: number;
  /** GPS trace, downsampled. Empty for anything entered by hand. */
  track: ActivityTrackPoint[];
  durationSec: number | null;
  distanceM: number | null;
  elevationGainM: number | null;
  avgHeartRate: number | null;
  calories: number | null;
  avgPaceSecPerKm: number | null;
  source: DataSource;
  /** Set when the record came from HealthKit / Health Connect, for dedup. */
  externalId: string | null;
  notes: string | null;
}

/* --- Nutrition ------------------------------------------------------------ */

/**
 * A catalogue item, expressed per 100 g.
 *
 * Every nutrient is nullable, and that is the point: a food entered by hand
 * without a label in front of you has *unknown* protein, not zero. Zero is a
 * claim, and totals built on invented zeroes are worse than no totals at all.
 * The UI shows "sem dados" wherever a value is missing.
 */
export interface Food extends Entity {
  name: string;
  brand: string | null;
  kcalPer100g: number | null;
  proteinPer100g: number | null;
  carbsPer100g: number | null;
  fatPer100g: number | null;
  fiberPer100g: number | null;
  /** Density, so a millilitre quantity can become grams honestly. */
  gramsPerMl: number | null;
  /** Weight of one unit or portion, where the food has a natural one. */
  gramsPerUnit: number | null;
  barcode: string | null;
  /** Where the record came from; a future food database fills this in. */
  source: 'manual' | 'database' | 'barcode';
}

export interface MealItem {
  id: string;
  foodId: string;
  quantity: number;
  unit: FoodUnit;
}

export interface Meal extends Entity {
  date: DayKey;
  type: MealType;
  time: ClockTime | null;
  items: MealItem[];
  notes: string | null;
  /** Set when this meal came from a plan entry, so it is not offered twice. */
  planEntryId: string | null;
}

/* --- Meal plans ------------------------------------------------------------- */

/** One meal of one weekday inside a plan. */
export interface MealPlanEntry {
  id: string;
  /** 0 = Sunday .. 6 = Saturday. */
  weekday: number;
  type: MealType;
  time: ClockTime | null;
  items: MealItem[];
  notes: string | null;
}

/** A weekly template: day, then meal, then foods and quantities. */
export interface MealPlan extends Entity {
  title: string;
  entries: MealPlanEntry[];
  active: boolean;
}

/* --- Nutrition goals --------------------------------------------------------- */

export interface NutritionGoal extends Entity {
  title: string;
  metric: NutritionGoalMetric;
  /** kcal, grams, millilitres or a plain count, matching the metric. */
  target: number;
  /** Only for 'custom', where the user names their own unit. */
  unit: string | null;
  period: 'day' | 'week';
  active: boolean;
}

/** A drink, logged on its own because water has no food record behind it. */
export interface WaterEntry {
  id: string;
  date: DayKey;
  ml: number;
  at: Timestamp;
}

/* --- Derived -------------------------------------------------------------- */

/** The shape the dashboard reads. Computed, never stored. */
export interface DailyProgress {
  date: DayKey;
  habitsTotal: number;
  habitsCompleted: number;
  tasksTotal: number;
  tasksCompleted: number;
  workoutPlanned: boolean;
  workoutCompleted: boolean;
  activityDurationSec: number;
  activityDistanceM: number;
  caloriesConsumed: number;
  caloriesTarget: number | null;
  /** Items the user marked essential for this day. */
  essentialTotal: number;
  essentialCompleted: number;
  /**
   * Every essential item done, and there was at least one. A day with nothing
   * essential scheduled is not perfect — it is simply not counted.
   */
  isPerfectDay: boolean;
  /** 0..1 overall completion, essential or not. Drives the ring. */
  score: number;
}

export interface Streak extends Entity {
  kind: StreakKind;
  /** Habit id, when `kind` is 'habit'. */
  refId: string | null;
  current: number;
  longest: number;
  lastDate: DayKey | null;
}

/* --- Agenda --------------------------------------------------------------- */

export type EventCategory =
  | 'work' | 'school' | 'appointment' | 'meeting' | 'commitment' | 'personal';

export type TaskCategory =
  | 'general' | 'work' | 'study' | 'home' | 'health' | 'finance' | 'errand';

/**
 * A block of time on the calendar.
 *
 * Named CalendarEvent because `Event` is a DOM global — shadowing it in a
 * codebase full of handlers is a trap worth avoiding.
 *
 * Events never affect the streak. They are things that happen to you; the
 * perfect day is built from things you commit to (see `essential` on Habit,
 * Task and WorkoutSession).
 */
export interface CalendarEvent extends Entity {
  title: string;
  description: string | null;
  category: EventCategory;
  /** The first occurrence; `recurrence` is anchored to it. */
  date: DayKey;
  startTime: ClockTime;
  endTime: ClockTime | null;
  allDay: boolean;
  recurrence: Recurrence;
  reminder: ReminderLead | null;
  location: string | null;
}

/** One materialised occurrence of an event on a given day. */
export interface EventOccurrence {
  event: CalendarEvent;
  date: DayKey;
  startMinutes: number | null;
  endMinutes: number | null;
}

/* --- Settings -------------------------------------------------------------- */

export interface NotificationSettings {
  /** Master switch. Nothing is ever scheduled while this is false. */
  enabled: boolean;
  /** Global quiet-hours window; every habit window is clamped to it. */
  startTime: ClockTime;
  endTime: ClockTime;
  /** The OS permission has been asked for at least once. */
  permissionRequested: boolean;
  /** The user accepted a plan above the per-habit warning threshold. */
  highVolumeAccepted: boolean;
}

/** Sound and haptics. Additive: normalize fills them in, so no migration is needed. */
export interface FeedbackSettings {
  sound: boolean;
  haptics: boolean;
}

export interface AppSettings {
  notifications: NotificationSettings;
  feedback: FeedbackSettings;
  /** Additive, como o feedback: normalize preenche, sem migração. */
  ai: AiSettings;
}

/* --- Assistant ------------------------------------------------------------- */

/**
 * What the assistant is allowed to read.
 *
 * Nothing here is on by default. The brief says "com autorização do
 * utilizador", and the honest reading of that is per-category consent that can
 * be withdrawn — not one switch that quietly means everything.
 */
export type AiDataCategory =
  | 'profile'    // idade, género, altura, peso
  | 'goals'
  | 'training'   // treinos, exercícios, cargas, repetições, RPE
  | 'activity'   // corrida, caminhada, bicicleta
  | 'nutrition'
  | 'habits'
  | 'sleep'      // ainda sem dados; fica declarado para quando existirem
  | 'feedback';  // dificuldade e notas subjetivas

export interface AiSettings {
  /** Master switch. False means the assistant reads nothing at all. */
  enabled: boolean;
  categories: Record<AiDataCategory, boolean>;
  acceptedAt: Timestamp | null;
}

/** One step of a running plan. A rest day is a session too — it is planned. */
export interface RunPlanSession {
  id: string;
  /** 1-based position in the plan. */
  index: number;
  weekIndex: number;
  date: DayKey;
  kind: 'walk_run' | 'easy_run' | 'long_run' | 'rest';
  /** Alternating run/walk minutes, for the early weeks. */
  segments: Array<{ runSec: number; walkSec: number; repeats: number }>;
  targetDistanceM: number | null;
  targetDurationSec: number | null;
  note: string | null;
  status: 'planned' | 'done' | 'skipped';
  /** Filled after the session, and what the next weeks are adapted from. */
  feedback: RunSessionFeedback | null;
  /** The activity this was completed with, when there is one. */
  activityId: string | null;
}

export interface RunSessionFeedback {
  difficulty: SessionDifficulty;
  /** Borg CR10, when the user gives one. */
  rpe: number | null;
  note: string | null;
  at: Timestamp;
}

export interface RunPlan extends Entity {
  title: string;
  goalDistanceM: number;
  startDate: DayKey;
  /** 0 = Sunday .. 6 = Saturday. */
  weekdays: number[];
  sessions: RunPlanSession[];
  active: boolean;
  /** How many times the plan has been eased or pushed, for the history. */
  adjustments: RunPlanAdjustment[];
}

export interface RunPlanAdjustment {
  at: Timestamp;
  direction: 'easier' | 'harder' | 'hold';
  reason: string;
  fromSessionIndex: number;
}

/** A turn in the assistant conversation, kept so the thread survives a reload. */
export interface CoachMessage extends Entity {
  role: 'user' | 'coach';
  text: string;
  /** Structured payload for a coach turn; the user's turns are plain text. */
  turn: unknown | null;
}
