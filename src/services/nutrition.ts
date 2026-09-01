/**
 * PACE — Nutrition service.
 *
 * Meals, the weekly plan, water and food-related goals.
 *
 * The food catalogue is deliberately behind one function, `resolveFood`. Today
 * it finds or creates a record from a typed name; when a real food database
 * arrives it becomes a lookup with a `source` of 'database', and nothing above
 * changes. The same seam is where a barcode scan would land.
 */

import { MEAL_ORDER } from '../core/constants';
import { createId } from '../core/utils/id';
import { todayKey } from '../core/utils/date';
import type {
  DayKey, Food, FoodUnit, Meal, MealItem, MealPlan, MealPlanEntry, MealType,
  NutritionGoal, WaterEntry,
} from '../core/types';
import * as nutrition from '../domain/nutrition';
import type { Repositories } from '../data/repositories';

/* --- Foods ---------------------------------------------------------------------- */

/**
 * Finds a food by name or creates it.
 *
 * Matching case-insensitively keeps "Aveia" and "aveia" as one record, so the
 * nutrition entered once is reused rather than split across near-duplicates.
 */
export function resolveFood(repos: Repositories, name: string): Food {
  const trimmed = name.trim();
  const existing = repos.foods
    .all()
    .find((candidate) => candidate.name.toLowerCase() === trimmed.toLowerCase());
  return existing ?? repos.foods.create({ name: trimmed });
}

export function saveFood(repos: Repositories, food: Food): Food {
  return repos.foods.update(food.id, food) ?? repos.foods.insert(food);
}

/* --- Meals ------------------------------------------------------------------------ */

export interface MealItemDraft {
  id: string;
  foodName: string;
  quantity: number;
  unit: FoodUnit;
}

export interface MealDraft {
  id: string | null;
  date: DayKey;
  type: MealType;
  time: string | null;
  notes: string | null;
  items: MealItemDraft[];
  planEntryId: string | null;
}

export function emptyItemDraft(): MealItemDraft {
  return { id: createId(), foodName: '', quantity: 100, unit: 'g' };
}

export function emptyMealDraft(date: DayKey = todayKey(), type: MealType = 'snack'): MealDraft {
  return {
    id: null,
    date,
    type,
    time: null,
    notes: null,
    items: [emptyItemDraft()],
    planEntryId: null,
  };
}

export function draftFromMeal(meal: Meal, foods: Food[]): MealDraft {
  return {
    id: meal.id,
    date: meal.date,
    type: meal.type,
    time: meal.time,
    notes: meal.notes,
    planEntryId: meal.planEntryId,
    items: draftItems(meal.items, foods),
  };
}

/** Draft rows become real items, creating any food the catalogue lacks. */
export function toMealItems(repos: Repositories, items: MealItemDraft[]): MealItem[] {
  return items
    .filter((item) => item.foodName.trim().length > 0)
    .map((item) => ({
      id: item.id,
      foodId: resolveFood(repos, item.foodName).id,
      quantity: item.quantity,
      unit: item.unit,
    }));
}

export function draftItems(items: MealItem[], foods: Food[]): MealItemDraft[] {
  return items.map((item) => ({
    id: item.id,
    foodName: foods.find((food) => food.id === item.foodId)?.name ?? '',
    quantity: item.quantity,
    unit: item.unit,
  }));
}

export function saveMeal(repos: Repositories, draft: MealDraft): Meal {
  const payload = {
    date: draft.date,
    type: draft.type,
    time: draft.time,
    notes: draft.notes,
    planEntryId: draft.planEntryId,
    items: toMealItems(repos, draft.items),
  };
  if (draft.id) {
    const updated = repos.meals.update(draft.id, payload);
    if (updated) return updated;
  }
  return repos.meals.create(payload);
}

export function deleteMeal(repos: Repositories, mealId: string): void {
  repos.meals.remove(mealId);
}

/* --- Water -------------------------------------------------------------------------- */

export function addWater(repos: Repositories, ml: number, date: DayKey = todayKey()): void {
  repos.waterEntries.create({ date, ml, at: new Date().toISOString() });
}

/** Removes the most recent entry of the day — the undo for a mis-tap. */
export function undoWater(repos: Repositories, date: DayKey = todayKey()): void {
  const latest = repos.waterEntries
    .where((entry: WaterEntry) => entry.date === date)
    .sort((a, b) => b.at.localeCompare(a.at))[0];
  if (latest) repos.waterEntries.remove(latest.id);
}

/* --- The plan ------------------------------------------------------------------------ */

export function activePlan(repos: Repositories): MealPlan | null {
  return repos.mealPlans.where((plan) => plan.active)[0] ?? null;
}

export function savePlan(repos: Repositories, plan: MealPlan): MealPlan {
  return repos.mealPlans.update(plan.id, plan) ?? repos.mealPlans.insert(plan);
}

export function savePlanEntry(
  repos: Repositories,
  planId: string,
  entry: MealPlanEntry,
): MealPlan | null {
  const plan = repos.mealPlans.byId(planId);
  if (!plan) return null;
  const exists = plan.entries.some((candidate) => candidate.id === entry.id);
  const entries = exists
    ? plan.entries.map((candidate) => (candidate.id === entry.id ? entry : candidate))
    : [...plan.entries, entry];
  return repos.mealPlans.update(planId, { entries });
}

export function deletePlanEntry(repos: Repositories, planId: string, entryId: string): void {
  const plan = repos.mealPlans.byId(planId);
  if (!plan) return;
  repos.mealPlans.update(planId, {
    entries: plan.entries.filter((entry) => entry.id !== entryId),
  });
}

/** Turns a plan entry into a real logged meal — "marcar como concluída". */
export function completePlanEntry(
  repos: Repositories,
  entry: MealPlanEntry,
  date: DayKey = todayKey(),
): Meal {
  return repos.meals.create({
    date,
    type: entry.type,
    time: entry.time,
    notes: entry.notes,
    // The items are copied, so editing the plan later never rewrites history.
    items: entry.items.map((item) => ({ ...item, id: createId() })),
    planEntryId: entry.id,
  });
}

/* --- Goals ---------------------------------------------------------------------------- */

export function saveGoal(
  repos: Repositories,
  goal: NutritionGoal,
  existingId?: string,
): NutritionGoal {
  if (existingId) {
    const updated = repos.nutritionGoals.update(existingId, goal);
    if (updated) return updated;
  }
  return repos.nutritionGoals.insert(goal);
}

export function deleteGoal(repos: Repositories, goalId: string): void {
  repos.nutritionGoals.remove(goalId);
}

/* --- Screen model ----------------------------------------------------------------------- */

/** One row in the day: either a logged meal or a plan entry still to do. */
export interface DayMeal {
  key: string;
  type: MealType;
  time: string | null;
  meal: Meal | null;
  planEntry: MealPlanEntry | null;
  totals: nutrition.NutritionTotals;
  itemNames: string[];
}

export interface NutritionDay {
  date: DayKey;
  meals: DayMeal[];
  totals: nutrition.NutritionTotals;
  waterMl: number;
  goals: nutrition.NutritionProgress[];
  consistency: nutrition.LoggingStreak;
  calories: Array<{ date: DayKey; kcal: number | null }>;
  /** True when at least one logged food has no nutrition entered. */
  hasUnknowns: boolean;
}

export function nutritionDay(
  repos: Repositories,
  date: DayKey = todayKey(),
): NutritionDay {
  const foods = repos.foods.all();
  const allMeals = repos.meals.all();
  const logged = allMeals.filter((meal) => meal.date === date);
  const plan = activePlan(repos);

  const weekday = new Date(`${date}T12:00:00`).getDay();
  const planned = (plan?.entries ?? []).filter(
    (entry) => entry.weekday === weekday
      && !logged.some((meal) => meal.planEntryId === entry.id),
  );

  const rows: DayMeal[] = [
    ...logged.map((meal) => ({
      key: `meal-${meal.id}`,
      type: meal.type,
      time: meal.time,
      meal,
      planEntry: null,
      totals: nutrition.mealTotals(meal, foods),
      itemNames: namesOf(meal.items, foods),
    })),
    ...planned.map((entry) => ({
      key: `plan-${entry.id}`,
      type: entry.type,
      time: entry.time,
      meal: null,
      planEntry: entry,
      totals: nutrition.totalsOf(entry.items, foods),
      itemNames: namesOf(entry.items, foods),
    })),
  ].sort(byMealOrder);

  const totals = nutrition.dayTotals(allMeals, foods, date);

  return {
    date,
    meals: rows,
    totals,
    waterMl: nutrition.waterOn(repos.waterEntries.all(), date),
    goals: nutrition.activeGoalProgress(
      repos.nutritionGoals.all(), allMeals, foods, repos.waterEntries.all(), date,
    ),
    consistency: nutrition.loggingConsistency(allMeals, 30, date),
    calories: nutrition.dailyCalories(allMeals, foods, 14, date),
    hasUnknowns: Object.values(totals.unknown).some((count) => count > 0),
  };
}

function namesOf(items: MealItem[], foods: Food[]): string[] {
  return items.map(
    (item) => foods.find((food) => food.id === item.foodId)?.name ?? 'Alimento',
  );
}

/** Breakfast before lunch before dinner, and timed meals before untimed ones. */
function byMealOrder(a: DayMeal, b: DayMeal): number {
  const typeDelta = MEAL_ORDER.indexOf(a.type) - MEAL_ORDER.indexOf(b.type);
  if (typeDelta !== 0) return typeDelta;
  if (a.time && b.time) return a.time.localeCompare(b.time);
  return a.time ? -1 : b.time ? 1 : 0;
}

/** The most recent meals across all days, newest first — the history list. */
export function recentMeals(repos: Repositories, limit = 12): DayMeal[] {
  const foods = repos.foods.all();
  return repos.meals
    .all()
    .slice()
    .sort((a, b) => (a.date === b.date
      ? (b.time ?? '').localeCompare(a.time ?? '')
      : b.date.localeCompare(a.date)))
    .slice(0, limit)
    .map((meal) => ({
      key: `meal-${meal.id}`,
      type: meal.type,
      time: meal.time,
      meal,
      planEntry: null,
      totals: nutrition.mealTotals(meal, foods),
      itemNames: namesOf(meal.items, foods),
    }));
}
