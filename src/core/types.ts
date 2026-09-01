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
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
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

/** A catalogue item, expressed per 100 g. */
export interface Food extends Entity {
  name: string;
  brand: string | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number | null;
  barcode: string | null;
}

export interface MealItem {
  id: string;
  foodId: string;
  quantityG: number;
}

export interface Meal extends Entity {
  date: DayKey;
  type: MealType;
  time: ClockTime | null;
  items: MealItem[];
  notes: string | null;
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
}
