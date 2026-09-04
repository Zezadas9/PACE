/**
 * Alimentação — what was eaten today, what the plan says, and how the logging
 * has been going.
 *
 * Three views rather than one long page: the day you are living, the week you
 * decided in advance, and the record behind both. Nothing here grades a diet or
 * suggests a target — PACE counts what is entered and says when it cannot.
 */

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { MEAL_LABELS } from '../../core/constants';
import { createFood, createMealPlan } from '../../core/factories';
import type { DayKey, Food, MealPlanEntry, NutritionGoal } from '../../core/types';
import { addDaysToKey, longDate, mediumDate, todayKey } from '../../core/utils/date';
import { createId } from '../../core/utils/id';
import {
  activePlan, addWater, completePlanEntry, deleteGoal, deleteMeal, deletePlanEntry,
  draftFromMeal, draftItems, emptyItemDraft, emptyMealDraft, nutritionDay, recentMeals,
  saveFood, saveGoal, saveMeal, savePlan, savePlanEntry, toMealItems, undoWater,
  type DayMeal, type MealDraft,
} from '../../services/nutrition';
import { useApp, useFeedback, useStoreVersion } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Screen } from '../../app/navigation/Screen';
import { PageHeader } from '../../ui/page';
import { Segmented } from '../../ui/form';
import { DateNavigator } from '../../ui/calendar';
import { Fab } from '../../ui/Fab';
import { MealForm } from './MealForm';
import { FoodForm } from './FoodForm';
import { MealPlanForm, type PlanEntryDraft } from './MealPlanForm';
import { NutritionGoalForm } from './NutritionGoalForm';
import {
  GoalsSection, HistorySection, MealsSection, PlanSection, TotalsCard, WaterCard,
} from './sections';
import { AskPace } from '../assistant/AskPace';

type View = 'diary' | 'plan' | 'history';

const VIEW_OPTIONS = [
  { id: 'diary' as const, label: 'Diário' },
  { id: 'plan' as const, label: 'Plano' },
  { id: 'history' as const, label: 'Histórico' },
];

type SheetState =
  | { kind: 'meal'; draft: MealDraft }
  | { kind: 'plan'; draft: PlanEntryDraft }
  | { kind: 'goal'; goal?: NutritionGoal }
  /** The detour taken to fill in a food's nutrition; `back` returns to it. */
  | { kind: 'food'; food: Food; back: SheetState }
  | null;

function emptyPlanDraft(): PlanEntryDraft {
  return {
    id: null, weekdays: [], type: 'lunch', time: null, notes: null, items: [emptyItemDraft()],
  };
}

export function NutritionScreen(): ReactElement {
  const { repos } = useApp();
  const feedback = useFeedback();
  const { confirm, toast } = useUi();
  const version = useStoreVersion();

  const today = todayKey();
  const [date, setDate] = useState<DayKey>(today);
  const [view, setView] = useState<View>('diary');
  const [sheet, setSheet] = useState<SheetState>(null);

  const model = useMemo(() => nutritionDay(repos, date), [repos, date, version]);
  const foods = useMemo(() => repos.foods.all(), [repos, version]);
  const history = useMemo(() => recentMeals(repos), [repos, version]);
  const plan = useMemo(() => activePlan(repos), [repos, version]);

  const waterGoal = model.goals.find((progress) => progress.goal.metric === 'water') ?? null;

  const planRows = useMemo(
    () => (plan?.entries ?? []).map((entry) => ({
      id: entry.id,
      weekday: entry.weekday,
      label: MEAL_LABELS[entry.type],
      sub: [
        entry.time,
        entry.items
          .map((item) => foods.find((food) => food.id === item.foodId)?.name ?? 'Alimento')
          .join(', '),
      ].filter(Boolean).join(' · '),
    })),
    [plan, foods],
  );

  /* --- Actions ------------------------------------------------------------------ */

  const openMeal = useCallback((meal: DayMeal) => {
    if (!meal.meal) return;
    setSheet({ kind: 'meal', draft: draftFromMeal(meal.meal, foods) });
  }, [foods]);

  const complete = useCallback((meal: DayMeal) => {
    if (!meal.planEntry) return;
    completePlanEntry(repos, meal.planEntry, date);
    feedback.play('complete');
    toast('Refeição marcada.');
  }, [repos, date, feedback, toast]);

  /** Opens the food editor over whatever sheet is open, and remembers the way back. */
  const editFood = useCallback((name: string) => {
    setSheet((current) => {
      if (!current || current.kind === 'goal' || current.kind === 'food') return current;
      const trimmed = name.trim();
      const existing = foods.find(
        (food) => food.name.toLowerCase() === trimmed.toLowerCase(),
      );
      return {
        kind: 'food',
        food: existing ?? createFood({ name: trimmed }),
        back: current,
      };
    });
  }, [foods]);

  const savePlanDraft = useCallback((draft: PlanEntryDraft) => {
    const target = plan ?? savePlan(repos, createMealPlan({ title: 'Plano' }));
    const items = toMealItems(repos, draft.items);

    // One entry per weekday chosen: the plan is per day, so five weekdays is
    // five entries, and each can later be edited or dropped on its own.
    if (draft.id) {
      const weekday = draft.weekdays[0] ?? 0;
      savePlanEntry(repos, target.id, {
        id: draft.id, weekday, type: draft.type, time: draft.time, notes: draft.notes, items,
      });
    } else {
      for (const weekday of draft.weekdays) {
        savePlanEntry(repos, target.id, {
          id: createId(), weekday, type: draft.type, time: draft.time, notes: draft.notes, items,
        });
      }
    }
    setSheet(null);
    toast(draft.id ? 'Plano atualizado.' : 'Refeição adicionada ao plano.');
  }, [repos, plan, toast]);

  const label = view === 'plan' ? 'Semana' : date === today ? 'Hoje' : mediumDate(date);

  return (
    <>
      <Screen>
        <PageHeader
          eyebrow={view === 'plan' ? 'Plano' : longDate(date)}
          title="Alimentação"
          subtitle="Refeições, água e o que ficou registado."
        />

        <Segmented ariaLabel="Vista" value={view} options={VIEW_OPTIONS} onChange={setView} />

        {view === 'diary' ? (
          <>
            <DateNavigator
              label={label}
              onPrev={() => setDate((current) => addDaysToKey(current, -1))}
              onNext={() => setDate((current) => addDaysToKey(current, 1))}
              onToday={() => setDate(today)}
              showToday={date !== today}
            />
            <TotalsCard totals={model.totals} />
            <WaterCard
              ml={model.waterMl}
              goal={waterGoal}
              onAdd={(ml) => {
                addWater(repos, ml, date);
                feedback.touch('light');
              }}
              onUndo={() => undoWater(repos, date)}
            />
            <MealsSection
              meals={model.meals}
              onOpen={openMeal}
              onComplete={complete}
              onAdd={() => setSheet({ kind: 'meal', draft: emptyMealDraft(date) })}
            />
            <GoalsSection
              goals={model.goals}
              onAdd={() => setSheet({ kind: 'goal' })}
              onEdit={(goal) => setSheet({ kind: 'goal', goal })}
            />
          </>
        ) : null}

        {view === 'plan' ? (
          <PlanSection
            entries={planRows}
            onAdd={() => setSheet({ kind: 'plan', draft: emptyPlanDraft() })}
            onEdit={(id) => {
              const entry = plan?.entries.find((candidate) => candidate.id === id);
              if (!entry) return;
              setSheet({ kind: 'plan', draft: planDraftFrom(entry, foods) });
            }}
          />
        ) : null}

        {view === 'history' ? (
          <HistorySection day={model} recent={history} onOpen={openMeal} />
        ) : null}

        <AskPace questions={[
          'Dá-me ideias para o jantar',
          'Como está a minha alimentação esta semana?',
          'Quanta proteína devo comer por dia?',
        ]} />
      </Screen>

      {view !== 'history' ? (
        <Fab
          label={view === 'plan' ? 'Adicionar ao plano' : 'Registar refeição'}
          onClick={() => setSheet(
            view === 'plan'
              ? { kind: 'plan', draft: emptyPlanDraft() }
              : { kind: 'meal', draft: emptyMealDraft(date) },
          )}
        />
      ) : null}

      {sheet?.kind === 'meal' ? (
        <MealForm
          draft={sheet.draft}
          foods={foods}
          onChange={(draft) => setSheet({ kind: 'meal', draft })}
          onEditFood={editFood}
          onClose={() => setSheet(null)}
          onSave={(draft) => {
            saveMeal(repos, draft);
            feedback.play('complete');
            setSheet(null);
            toast(draft.id ? 'Refeição atualizada.' : 'Refeição registada.');
          }}
          onDelete={sheet.draft.id ? () => {
            const id = sheet.draft.id;
            void (async () => {
              const ok = await confirm({
                title: 'Apagar refeição?', confirmLabel: 'Apagar', danger: true,
              });
              if (!ok || !id) return;
              deleteMeal(repos, id);
              setSheet(null);
            })();
          } : undefined}
        />
      ) : null}

      {sheet?.kind === 'plan' ? (
        <MealPlanForm
          draft={sheet.draft}
          foods={foods}
          onChange={(draft) => setSheet({ kind: 'plan', draft })}
          onEditFood={editFood}
          onClose={() => setSheet(null)}
          onSave={savePlanDraft}
          onDelete={sheet.draft.id ? () => {
            const id = sheet.draft.id;
            void (async () => {
              const ok = await confirm({
                title: 'Apagar do plano?', confirmLabel: 'Apagar', danger: true,
              });
              if (!ok || !id || !plan) return;
              deletePlanEntry(repos, plan.id, id);
              setSheet(null);
            })();
          } : undefined}
        />
      ) : null}

      {sheet?.kind === 'food' ? (
        <FoodForm
          food={sheet.food}
          onClose={() => setSheet(sheet.back)}
          onSave={(food) => {
            saveFood(repos, food);
            setSheet(sheet.back);
            toast('Alimento guardado.');
          }}
        />
      ) : null}

      {sheet?.kind === 'goal' ? (
        <NutritionGoalForm
          existing={sheet.goal}
          onClose={() => setSheet(null)}
          onSave={(goal) => {
            saveGoal(repos, goal, sheet.goal?.id);
            setSheet(null);
            toast(sheet.goal ? 'Objetivo atualizado.' : 'Objetivo criado.');
          }}
          onDelete={sheet.goal ? () => {
            const id = sheet.goal?.id;
            void (async () => {
              const ok = await confirm({
                title: 'Apagar objetivo?', confirmLabel: 'Apagar', danger: true,
              });
              if (!ok || !id) return;
              deleteGoal(repos, id);
              setSheet(null);
            })();
          } : undefined}
        />
      ) : null}
    </>
  );
}

function planDraftFrom(entry: MealPlanEntry, foods: Food[]): PlanEntryDraft {
  return {
    id: entry.id,
    weekdays: [entry.weekday],
    type: entry.type,
    time: entry.time,
    notes: entry.notes,
    items: draftItems(entry.items, foods),
  };
}
