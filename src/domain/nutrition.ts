/**
 * PACE — Nutrition.
 *
 * The rule this whole module exists to enforce: **never invent a value.**
 *
 * A food entered by hand without a label in front of you has unknown protein,
 * not zero. If a meal contains one such food, that meal's protein total is
 * unknown too — not "everything else added up". Totals therefore carry both a
 * number and a count of what could not be resolved, and the UI says so.
 *
 * Getting this wrong is how a food app quietly lies: a day that reads 1 200
 * kcal because half of it was never entered is worse than a day that admits it
 * does not know.
 */

import type {
  DayKey, Food, Meal, MealItem, NutritionGoal, WaterEntry,
} from '../core/types';
import { addDaysToKey, startOfWeekKey, todayKey } from '../core/utils/date';

/** The nutrients tracked, in the order they are shown. */
export const NUTRIENTS = ['kcal', 'protein', 'carbs', 'fat', 'fiber'] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

export type Nutrition = Record<Nutrient, number | null>;

export function emptyNutrition(): Nutrition {
  return { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
}

/* --- Quantities ---------------------------------------------------------------- */

/**
 * The mass of one item in grams, or null when it cannot be known.
 *
 * Millilitres need a density and units need a unit weight. Assuming 1 ml = 1 g
 * is right for water and wrong for oil, so it is not assumed.
 */
export function gramsOf(item: MealItem, food: Food | undefined): number | null {
  if (!food) return null;
  switch (item.unit) {
    case 'g':
      return item.quantity;
    case 'ml':
      return food.gramsPerMl == null ? null : item.quantity * food.gramsPerMl;
    case 'unit':
    case 'portion':
      return food.gramsPerUnit == null ? null : item.quantity * food.gramsPerUnit;
    default:
      return null;
  }
}

const FIELDS: Record<Nutrient, keyof Food> = {
  kcal: 'kcalPer100g',
  protein: 'proteinPer100g',
  carbs: 'carbsPer100g',
  fat: 'fatPer100g',
  fiber: 'fiberPer100g',
};

/** What one item contributes. Any unknown makes that nutrient unknown. */
export function nutritionOf(item: MealItem, food: Food | undefined): Nutrition {
  const grams = gramsOf(item, food);
  const out = {} as Nutrition;

  for (const nutrient of NUTRIENTS) {
    const per100 = food ? (food[FIELDS[nutrient]] as number | null) : null;
    out[nutrient] = grams == null || per100 == null
      ? null
      : Math.round(((per100 * grams) / 100) * 10) / 10;
  }
  return out;
}

export interface NutritionTotals {
  values: Nutrition;
  /** Items whose contribution could not be resolved, per nutrient. */
  unknown: Record<Nutrient, number>;
  itemCount: number;
}

function emptyTotals(): NutritionTotals {
  return {
    values: emptyNutrition(),
    unknown: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    itemCount: 0,
  };
}

/**
 * Adds up a set of items.
 *
 * A nutrient stays a number while every item resolves, and the `unknown` count
 * records how many did not — so the screen can show "1 240 kcal + 2 sem dados"
 * rather than pretending the total is complete.
 */
export function totalsOf(items: MealItem[], foods: Food[]): NutritionTotals {
  const totals = emptyTotals();

  for (const item of items) {
    totals.itemCount += 1;
    const food = foods.find((candidate) => candidate.id === item.foodId);
    const contribution = nutritionOf(item, food);

    for (const nutrient of NUTRIENTS) {
      const value = contribution[nutrient];
      if (value == null) totals.unknown[nutrient] += 1;
      else {
        const current = totals.values[nutrient];
        totals.values[nutrient] = current == null ? value : current + value;
      }
    }
  }

  for (const nutrient of NUTRIENTS) {
    const value = totals.values[nutrient];
    if (value != null) totals.values[nutrient] = Math.round(value * 10) / 10;
    // Nothing resolved and nothing to resolve: the answer is unknown, not zero.
    if (totals.itemCount > 0 && totals.unknown[nutrient] === totals.itemCount) {
      totals.values[nutrient] = null;
    }
  }
  return totals;
}

export function mealTotals(meal: Meal, foods: Food[]): NutritionTotals {
  return totalsOf(meal.items, foods);
}

export function dayTotals(meals: Meal[], foods: Food[], date: DayKey): NutritionTotals {
  const items = meals.filter((meal) => meal.date === date).flatMap((meal) => meal.items);
  return totalsOf(items, foods);
}

/** True when a food carries no nutrition at all — worth flagging in a list. */
export function hasNutrition(food: Food): boolean {
  return NUTRIENTS.some((nutrient) => food[FIELDS[nutrient]] != null);
}

/* --- Water ---------------------------------------------------------------------- */

export function waterOn(entries: WaterEntry[], date: DayKey): number {
  return entries
    .filter((entry) => entry.date === date)
    .reduce((sum, entry) => sum + entry.ml, 0);
}

/* --- Goals ----------------------------------------------------------------------- */

export interface NutritionProgress {
  goal: NutritionGoal;
  from: DayKey;
  to: DayKey;
  /** Null when the underlying data is unknown rather than zero. */
  current: number | null;
  target: number;
  ratio: number;
  complete: boolean;
  /** How many logged items could not be resolved into this metric. */
  unknownItems: number;
}

function windowFor(goal: NutritionGoal, date: DayKey): { from: DayKey; to: DayKey } {
  if (goal.period === 'day') return { from: date, to: date };
  const start = startOfWeekKey(date);
  return { from: start, to: addDaysToKey(start, 6) };
}

const METRIC_TO_NUTRIENT: Partial<Record<NutritionGoal['metric'], Nutrient>> = {
  calories: 'kcal',
  protein: 'protein',
  carbs: 'carbs',
  fat: 'fat',
  fiber: 'fiber',
};

export function goalProgress(
  goal: NutritionGoal,
  meals: Meal[],
  foods: Food[],
  water: WaterEntry[],
  date: DayKey = todayKey(),
): NutritionProgress {
  const { from, to } = windowFor(goal, date);
  const inWindow = meals.filter((meal) => meal.date >= from && meal.date <= to);

  let current: number | null = 0;
  let unknownItems = 0;

  if (goal.metric === 'meals') {
    current = inWindow.length;
  } else if (goal.metric === 'water') {
    current = water
      .filter((entry) => entry.date >= from && entry.date <= to)
      .reduce((sum, entry) => sum + entry.ml, 0);
  } else if (goal.metric === 'custom') {
    // The app cannot measure a metric it does not define; the user tracks it.
    current = null;
  } else {
    const nutrient = METRIC_TO_NUTRIENT[goal.metric];
    const totals = totalsOf(inWindow.flatMap((meal) => meal.items), foods);
    current = nutrient ? totals.values[nutrient] : null;
    unknownItems = nutrient ? totals.unknown[nutrient] : 0;
  }

  const target = Math.max(1, goal.target);
  const value = current ?? 0;
  return {
    goal,
    from,
    to,
    current,
    target,
    ratio: Math.min(1, Math.max(0, value / target)),
    complete: current != null && current >= target,
    unknownItems,
  };
}

export function activeGoalProgress(
  goals: NutritionGoal[],
  meals: Meal[],
  foods: Food[],
  water: WaterEntry[],
  date: DayKey = todayKey(),
): NutritionProgress[] {
  return goals
    .filter((goal) => goal.active)
    .map((goal) => goalProgress(goal, meals, foods, water, date));
}

/* --- Consistency ------------------------------------------------------------------ */

export interface LoggingStreak {
  /** Days in the window that have at least one meal logged. */
  daysLogged: number;
  daysTracked: number;
  /** 0..1. */
  consistency: number;
  /** Consecutive logged days ending today, or yesterday if today is empty. */
  current: number;
}

/**
 * How consistently meals get logged.
 *
 * Deliberately about the *habit of logging*, not about diet quality — the app
 * has no business grading what someone eats, and says nothing about it.
 */
export function loggingConsistency(
  meals: Meal[],
  days = 30,
  today: DayKey = todayKey(),
): LoggingStreak {
  const logged = new Set(meals.map((meal) => meal.date));

  let daysLogged = 0;
  for (let i = 0; i < days; i += 1) {
    if (logged.has(addDaysToKey(today, -i))) daysLogged += 1;
  }

  let cursor = logged.has(today) ? today : addDaysToKey(today, -1);
  let current = 0;
  for (let i = 0; i < 365; i += 1) {
    if (!logged.has(cursor)) break;
    current += 1;
    cursor = addDaysToKey(cursor, -1);
  }

  return {
    daysLogged,
    daysTracked: days,
    consistency: Math.round((daysLogged / days) * 100) / 100,
    current,
  };
}

/** Calories per day over a window, for the chart. Null days stay null. */
export function dailyCalories(
  meals: Meal[],
  foods: Food[],
  days = 14,
  today: DayKey = todayKey(),
): Array<{ date: DayKey; kcal: number | null }> {
  const out: Array<{ date: DayKey; kcal: number | null }> = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = addDaysToKey(today, -i);
    const totals = dayTotals(meals, foods, date);
    out.push({ date, kcal: totals.itemCount === 0 ? null : totals.values.kcal });
  }
  return out;
}
