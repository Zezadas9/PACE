import { describe, expect, it } from 'vitest';
import { createFood, createMeal, createNutritionGoal } from '../core/factories';
import type { Food, Meal, MealItem, WaterEntry } from '../core/types';
import {
  dailyCalories, dayTotals, goalProgress, gramsOf, hasNutrition, loggingConsistency,
  nutritionOf, totalsOf, waterOn,
} from './nutrition';

const TODAY = '2026-09-01';

/** Oats: 389 kcal, 16.9 g protein per 100 g. Real label, real numbers. */
const oats: Food = createFood({
  id: 'oats',
  name: 'Aveia',
  kcalPer100g: 389,
  proteinPer100g: 16.9,
  carbsPer100g: 66,
  fatPer100g: 6.9,
  fiberPer100g: 10.6,
  gramsPerUnit: 30,
});

/** Milk, with a density so millilitres can be resolved. */
const milk: Food = createFood({
  id: 'milk',
  name: 'Leite',
  kcalPer100g: 46,
  proteinPer100g: 3.2,
  carbsPer100g: 4.7,
  fatPer100g: 1.6,
  fiberPer100g: 0,
  gramsPerMl: 1.03,
});

/** A home-made soup nobody has entered values for. Unknown, not zero. */
const soup: Food = createFood({ id: 'soup', name: 'Sopa de legumes' });

const FOODS = [oats, milk, soup];

function item(partial: Partial<MealItem> = {}): MealItem {
  return { id: 'i1', foodId: 'oats', quantity: 100, unit: 'g', ...partial };
}

function meal(partial: Partial<Meal> = {}): Meal {
  return createMeal({ date: TODAY, type: 'breakfast', ...partial });
}

describe('gramsOf', () => {
  it('takes grams at face value', () => {
    expect(gramsOf(item({ quantity: 60 }), oats)).toBe(60);
  });

  it('uses the density for millilitres', () => {
    expect(gramsOf(item({ foodId: 'milk', quantity: 200, unit: 'ml' }), milk))
      .toBeCloseTo(206, 5);
  });

  it('refuses to guess millilitres without a density', () => {
    // 1 ml = 1 g is right for water and wrong for oil, so it is not assumed.
    expect(gramsOf(item({ foodId: 'soup', quantity: 200, unit: 'ml' }), soup)).toBeNull();
  });

  it('uses the unit weight for units and portions', () => {
    expect(gramsOf(item({ quantity: 2, unit: 'unit' }), oats)).toBe(60);
    expect(gramsOf(item({ quantity: 1, unit: 'portion' }), oats)).toBe(30);
  });

  it('is unknown when the food is missing', () => {
    expect(gramsOf(item(), undefined)).toBeNull();
  });
});

describe('nutritionOf', () => {
  it('scales a label to the quantity', () => {
    const values = nutritionOf(item({ quantity: 50 }), oats);
    expect(values.kcal).toBeCloseTo(194.5, 1);
    expect(values.protein).toBeCloseTo(8.5, 1);
  });

  it('returns null for every nutrient of an unlabelled food', () => {
    const values = nutritionOf(item({ foodId: 'soup' }), soup);
    expect(values).toEqual({ kcal: null, protein: null, carbs: null, fat: null, fiber: null });
  });
});

describe('totalsOf', () => {
  it('adds up what it can and counts what it cannot', () => {
    const totals = totalsOf(
      [item({ quantity: 100 }), item({ id: 'i2', foodId: 'soup', quantity: 300 })],
      FOODS,
    );
    expect(totals.values.kcal).toBeCloseTo(389, 1);
    expect(totals.unknown.kcal).toBe(1);
    expect(totals.itemCount).toBe(2);
  });

  it('reports unknown, not zero, when nothing resolves', () => {
    const totals = totalsOf([item({ foodId: 'soup' })], FOODS);
    // The difference that matters: a day of unlabelled food is not a day of
    // no calories.
    expect(totals.values.kcal).toBeNull();
    expect(totals.unknown.kcal).toBe(1);
  });

  it('is zero for an empty meal', () => {
    expect(totalsOf([], FOODS).values.kcal).toBe(0);
  });
});

describe('dayTotals', () => {
  it('only counts the day asked for', () => {
    const meals = [
      meal({ items: [item()] }),
      meal({ date: '2026-08-31', items: [item({ quantity: 200 })] }),
    ];
    expect(dayTotals(meals, FOODS, TODAY).values.kcal).toBeCloseTo(389, 1);
  });
});

describe('hasNutrition', () => {
  it('separates a labelled food from a bare name', () => {
    expect(hasNutrition(oats)).toBe(true);
    expect(hasNutrition(soup)).toBe(false);
  });
});

describe('waterOn', () => {
  const entries: WaterEntry[] = [
    { id: 'w1', date: TODAY, ml: 200, at: `${TODAY}T08:00:00.000Z` },
    { id: 'w2', date: TODAY, ml: 330, at: `${TODAY}T12:00:00.000Z` },
    { id: 'w3', date: '2026-08-31', ml: 500, at: '2026-08-31T12:00:00.000Z' },
  ];

  it('sums the day', () => {
    expect(waterOn(entries, TODAY)).toBe(530);
  });

  it('is zero on a day with nothing logged', () => {
    expect(waterOn(entries, '2026-08-30')).toBe(0);
  });
});

describe('goalProgress', () => {
  const water: WaterEntry[] = [
    { id: 'w1', date: TODAY, ml: 1200, at: `${TODAY}T09:00:00.000Z` },
  ];

  it('measures water against a daily target', () => {
    const goal = createNutritionGoal({ metric: 'water', target: 2000, period: 'day' });
    const progress = goalProgress(goal, [], FOODS, water, TODAY);
    expect(progress.current).toBe(1200);
    expect(progress.ratio).toBeCloseTo(0.6, 5);
    expect(progress.complete).toBe(false);
  });

  it('completes when the target is reached', () => {
    const goal = createNutritionGoal({ metric: 'water', target: 1000, period: 'day' });
    expect(goalProgress(goal, [], FOODS, water, TODAY).complete).toBe(true);
  });

  it('counts meals for a meal-count goal', () => {
    const goal = createNutritionGoal({ metric: 'meals', target: 3, period: 'day' });
    const meals = [meal({ items: [] }), meal({ type: 'lunch', items: [] })];
    expect(goalProgress(goal, meals, FOODS, [], TODAY).current).toBe(2);
  });

  it('carries the unresolved count into a protein goal', () => {
    const goal = createNutritionGoal({ metric: 'protein', target: 100, period: 'day' });
    const meals = [meal({ items: [item(), item({ id: 'i2', foodId: 'soup' })] })];
    const progress = goalProgress(goal, meals, FOODS, [], TODAY);
    expect(progress.current).toBeCloseTo(16.9, 1);
    expect(progress.unknownItems).toBe(1);
  });

  it('leaves a custom goal unmeasured', () => {
    // PACE does not define the metric, so it does not claim a value for it.
    const goal = createNutritionGoal({ metric: 'custom', unit: 'peças', target: 3 });
    const progress = goalProgress(goal, [], FOODS, [], TODAY);
    expect(progress.current).toBeNull();
    expect(progress.complete).toBe(false);
  });

  it('widens the window for a weekly goal', () => {
    const goal = createNutritionGoal({ metric: 'meals', target: 14, period: 'week' });
    // 2026-09-01 is a Tuesday; the week runs from Monday 08-31.
    const meals = [meal({ date: '2026-08-31', items: [] }), meal({ items: [] })];
    const progress = goalProgress(goal, meals, FOODS, [], TODAY);
    expect(progress.from).toBe('2026-08-31');
    expect(progress.to).toBe('2026-09-06');
    expect(progress.current).toBe(2);
  });
});

describe('loggingConsistency', () => {
  it('counts the days with something logged', () => {
    const meals = [
      meal({ items: [] }),
      meal({ date: '2026-08-31', items: [] }),
      meal({ date: '2026-08-31', type: 'lunch', items: [] }),
      meal({ date: '2026-08-28', items: [] }),
    ];
    const streak = loggingConsistency(meals, 30, TODAY);
    expect(streak.daysLogged).toBe(3);
    expect(streak.consistency).toBeCloseTo(0.1, 5);
    expect(streak.current).toBe(2);
  });

  it('keeps the streak alive on a day not yet logged', () => {
    // Nothing eaten yet today is not a broken streak — the day is not over.
    const meals = [meal({ date: '2026-08-31', items: [] })];
    expect(loggingConsistency(meals, 30, TODAY).current).toBe(1);
  });

  it('is empty with no meals at all', () => {
    const streak = loggingConsistency([], 30, TODAY);
    expect(streak.daysLogged).toBe(0);
    expect(streak.current).toBe(0);
  });
});

describe('dailyCalories', () => {
  it('returns one entry per day, oldest first', () => {
    const series = dailyCalories([meal({ items: [item()] })], FOODS, 3, TODAY);
    expect(series.map((entry) => entry.date)).toEqual(['2026-08-30', '2026-08-31', TODAY]);
    expect(series[2]?.kcal).toBeCloseTo(389, 1);
  });

  it('leaves a day with no meals null rather than zero', () => {
    const series = dailyCalories([], FOODS, 2, TODAY);
    expect(series.every((entry) => entry.kcal === null)).toBe(true);
  });

  it('marks a day of unlabelled food as unknown', () => {
    const meals = [meal({ items: [item({ foodId: 'soup' })] })];
    expect(dailyCalories(meals, FOODS, 1, TODAY)[0]?.kcal).toBeNull();
  });
});
