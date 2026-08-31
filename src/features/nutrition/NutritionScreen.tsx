import { useMemo, type ReactElement } from 'react';
import { MEAL_LABELS } from '../../core/constants';
import { longDate, todayKey } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import { mealCalories } from '../../domain/progress';
import { useRepos, useStoreVersion } from '../../app/providers/appContext';
import { Screen } from '../../app/navigation/Screen';
import { Card, SectionHeader } from '../../ui/primitives';
import { EmptyState, Metric, Row, Rows } from '../../ui/data';
import { PageHeader, Upcoming } from '../../ui/page';

export function NutritionScreen(): ReactElement {
  const repos = useRepos();
  const version = useStoreVersion();
  const today = todayKey();

  const { meals, foods, calories, macros } = useMemo(() => {
    const allFoods = repos.foods.all();
    const todaysMeals = repos.meals.where((meal) => meal.date === today);
    const totals = todaysMeals.reduce(
      (acc, meal) => {
        for (const item of meal.items) {
          const food = allFoods.find((candidate) => candidate.id === item.foodId);
          if (!food) continue;
          const factor = item.quantityG / 100;
          acc.protein += food.proteinPer100g * factor;
          acc.carbs += food.carbsPer100g * factor;
          acc.fat += food.fatPer100g * factor;
        }
        return acc;
      },
      { protein: 0, carbs: 0, fat: 0 },
    );
    return {
      meals: todaysMeals,
      foods: allFoods,
      calories: todaysMeals.reduce((sum, meal) => sum + mealCalories(meal, allFoods), 0),
      macros: totals,
    };
  }, [repos, today, version]);

  return (
    <Screen>
      <PageHeader
        eyebrow={longDate(today)}
        title="Alimentação"
        subtitle="Refeições, energia e macronutrientes."
      />
      <Card>
        <p className="t-eyebrow">Energia de hoje</p>
        <p className="t-display" style={{ marginTop: '0.35rem' }}>
          {format.number(Math.round(calories), 0)}
        </p>
        <p className="t-sm muted-2">kcal</p>
        <div className="grid-2" style={{ marginTop: '1.25rem' }}>
          <Metric label="Proteína" value={format.number(macros.protein, 0)} suffix="g" />
          <Metric label="Hidratos" value={format.number(macros.carbs, 0)} suffix="g" />
          <Metric label="Gordura" value={format.number(macros.fat, 0)} suffix="g" />
          <Metric label="Refeições" value={String(meals.length)} />
        </div>
      </Card>
      <section>
        <SectionHeader title="Refeições" />
        {meals.length === 0 ? (
          <EmptyState
            icon="leaf"
            title="Sem refeições hoje"
            body="O registo de refeições chega numa próxima fase."
          />
        ) : (
          <Card variant="flush">
            <Rows>
              {meals.map((meal) => (
                <Row
                  key={meal.id}
                  icon="utensils"
                  title={MEAL_LABELS[meal.type] ?? 'Refeição'}
                  sub={`${meal.items.length} alimentos`}
                  trail={format.kcal(mealCalories(meal, foods))}
                />
              ))}
            </Rows>
          </Card>
        )}
      </section>
      <Upcoming
        items={[
          'Pesquisa de alimentos e leitura de código de barras',
          'Objetivos de calorias e macronutrientes',
          'Refeições guardadas e repetição rápida',
        ]}
      />
    </Screen>
  );
}
