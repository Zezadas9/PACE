/**
 * The read-only blocks of the nutrition screen: the day's totals, water,
 * goals, the meals themselves, and the history behind them.
 */

import type { ReactElement } from 'react';
import { MEAL_LABELS, WATER_PRESETS } from '../../core/constants';
import type { NutritionGoal } from '../../core/types';
import { mediumDate } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import type { NutritionProgress, NutritionTotals } from '../../domain/nutrition';
import type { DayMeal, NutritionDay } from '../../services/nutrition';
import { Card, SectionHeader } from '../../ui/primitives';
import { EmptyState, Metric, ProgressBar, Row, Rows } from '../../ui/data';
import { BarChart, type ChartPoint } from '../../ui/charts';
import { BrandIcon } from '../../ui/BrandIcon';
import { NutrientGrid, unknownNote } from './nutrients';
import { describeNutritionGoal, unitFor } from './NutritionGoalForm';

export function TotalsCard({ totals }: { totals: NutritionTotals }): ReactElement {
  const kcal = totals.values.kcal;

  return (
    <Card>
      <p className="t-eyebrow">Energia de hoje</p>
      <p className="t-display" style={{ marginTop: '0.35rem' }}>
        {kcal == null ? '—' : format.number(Math.round(kcal), 0)}
      </p>
      {/* A day of unlabelled food reads as unknown, never as zero calories. */}
      <p className="t-sm muted-2">
        {kcal == null ? 'sem valores nutricionais' : 'kcal'}
      </p>
      <div style={{ marginTop: '1.25rem' }}>
        <NutrientGrid totals={totals} />
      </div>
    </Card>
  );
}

export function WaterCard({
  ml, goal, onAdd, onUndo,
}: {
  ml: number;
  goal: NutritionProgress | null;
  onAdd: (ml: number) => void;
  onUndo: () => void;
}): ReactElement {
  return (
    <Card>
      <div className="row row-between">
        <div className="grow">
          <p className="t-eyebrow">Água</p>
          <p className="t-h1" style={{ marginTop: '0.25rem' }}>
            {/* A chave muda com o valor: é o que faz a animação repetir a cada
                copo em vez de tocar uma só vez. */}
            <span className="water-total" key={ml}>{format.number(ml, 0)}</span>
            {' '}
            <span className="t-sm muted-2">ml</span>
          </p>
        </div>
        <BrandIcon name="hidratacao" size={44} float />
      </div>

      {goal ? (
        <div className="stack stack-2" style={{ marginTop: '0.9rem' }}>
          <ProgressBar ratio={goal.ratio} />
          <p className="t-sm muted">
            {goal.complete
              ? 'Objetivo cumprido'
              : `Faltam ${format.number(goal.target - ml, 0)} ml`}
          </p>
        </div>
      ) : null}

      <div className="water-row">
        {WATER_PRESETS.map((preset) => (
          <button key={preset} type="button" className="water-add" onClick={() => onAdd(preset)}>
            +{preset}
            <span>ml</span>
          </button>
        ))}
        <button
          type="button"
          className="water-undo"
          onClick={onUndo}
          disabled={ml === 0}
          aria-label="Anular último registo"
        >
          Anular
        </button>
      </div>
    </Card>
  );
}

export function GoalsSection({
  goals, onAdd, onEdit,
}: {
  goals: NutritionProgress[];
  onAdd: () => void;
  onEdit: (goal: NutritionGoal) => void;
}): ReactElement {
  return (
    <section>
      <SectionHeader title="Objetivos" actionLabel="Novo" onAction={onAdd} />
      {goals.length === 0 ? (
        <EmptyState
          brand="objetivos"
          title="Sem objetivos"
          body="Ex.: 2 000 ml de água por dia, ou 3 refeições registadas."
          actionLabel="Criar objetivo"
          onAction={onAdd}
        />
      ) : (
        <div className="stack stack-3">
          {goals.map((progress) => (
            <button
              key={progress.goal.id}
              type="button"
              className="goal-card"
              data-complete={String(progress.complete)}
              onClick={() => onEdit(progress.goal)}
            >
              <div className="row row-between">
                <span className="title">
                  {progress.goal.title || describeNutritionGoal(progress.goal)}
                </span>
                <span className="t-num">
                  {progress.current == null ? '—' : `${Math.round(progress.ratio * 100)}%`}
                </span>
              </div>
              <ProgressBar ratio={progress.ratio} />
              <span className="sub t-sm muted">{goalNote(progress)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** What is left, or why the app cannot say. */
function goalNote(progress: NutritionProgress): string {
  if (progress.goal.metric === 'custom') return 'Acompanhado por ti';
  if (progress.current == null) return 'Sem dados suficientes';
  if (progress.complete) return 'Concluído';

  const unit = unitFor(progress.goal);
  const left = Math.max(0, Math.round(progress.target - progress.current));
  const missing = unknownNote(progress.unknownItems);
  return `Faltam ${format.number(left, 0)}${unit ? ` ${unit}` : ''}${missing ? ` · ${missing}` : ''}`;
}

export function MealsSection({
  meals, onOpen, onComplete, onAdd,
}: {
  meals: DayMeal[];
  onOpen: (meal: DayMeal) => void;
  onComplete: (meal: DayMeal) => void;
  onAdd: () => void;
}): ReactElement {
  const planned = meals.filter((meal) => meal.planEntry).length;

  return (
    <section>
      <SectionHeader
        title="Refeições"
        actionLabel={planned > 0 ? `${planned} do plano` : undefined}
      />
      {meals.length === 0 ? (
        <EmptyState
          brand="alimentacao"
          title="Sem refeições"
          body="Regista o que comeste, ou cria um plano para o dia aparecer feito."
          actionLabel="Registar refeição"
          onAction={onAdd}
        />
      ) : (
        <Card variant="flush">
          <Rows>
            {meals.map((meal) => (
              <Row
                key={meal.key}
                tick={!!meal.planEntry}
                done={false}
                icon={meal.planEntry ? undefined : 'utensils'}
                chevron={!meal.planEntry}
                title={MEAL_LABELS[meal.type]}
                sub={[
                  meal.time,
                  meal.itemNames.join(', ') || 'Sem alimentos',
                ].filter(Boolean).join(' · ')}
                trail={mealTrail(meal)}
                onClick={() => (meal.planEntry ? onComplete(meal) : onOpen(meal))}
              />
            ))}
          </Rows>
        </Card>
      )}
    </section>
  );
}

function mealTrail(meal: DayMeal): string {
  if (meal.planEntry) return 'Marcar';
  const kcal = meal.totals.values.kcal;
  return kcal == null ? '—' : format.kcal(kcal);
}

export function PlanSection({
  entries, onAdd, onEdit,
}: {
  entries: Array<{ id: string; weekday: number; label: string; sub: string }>;
  onAdd: () => void;
  onEdit: (id: string) => void;
}): ReactElement {
  const names = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <section className="stack stack-4">
      <SectionHeader title="Plano da semana" actionLabel="Nova" onAction={onAdd} />
      {entries.length === 0 ? (
        <EmptyState
          brand="agenda"
          title="Sem plano"
          body="Define as refeições de cada dia. Depois é só marcar como feitas."
          actionLabel="Criar refeição do plano"
          onAction={onAdd}
        />
      ) : (
        order
          .filter((weekday) => entries.some((entry) => entry.weekday === weekday))
          .map((weekday) => (
            <div key={weekday} className="stack stack-2">
              <p className="t-eyebrow">{names[weekday]}</p>
              <Card variant="flush">
                <Rows>
                  {entries
                    .filter((entry) => entry.weekday === weekday)
                    .map((entry) => (
                      <Row
                        key={entry.id}
                        icon="utensils"
                        title={entry.label}
                        sub={entry.sub}
                        chevron
                        onClick={() => onEdit(entry.id)}
                      />
                    ))}
                </Rows>
              </Card>
            </div>
          ))
      )}
    </section>
  );
}

export function HistorySection({
  day, recent, onOpen,
}: {
  day: NutritionDay;
  recent: DayMeal[];
  onOpen: (meal: DayMeal) => void;
}): ReactElement {
  const points: ChartPoint[] = day.calories.map((entry, index) => ({
    key: entry.date,
    value: entry.kcal ?? 0,
    label: index % 3 === 0 ? String(Number(entry.date.slice(8, 10))) : '',
    current: index === day.calories.length - 1,
  }));

  return (
    <div className="stack stack-6">
      <section>
        <SectionHeader title="Consistência" />
        <Card variant="quiet">
          <div className="grid-2">
            <Metric
              label="Dias registados"
              value={String(day.consistency.daysLogged)}
              suffix={`/${day.consistency.daysTracked}`}
            />
            <Metric
              label="Consistência"
              value={format.percent(day.consistency.consistency)}
            />
            <Metric label="Seguidos" value={String(day.consistency.current)} suffix="dias" />
            <Metric
              label="Refeições no dia"
              value={String(day.meals.filter((meal) => meal.meal).length)}
            />
          </div>
          {/* Consistency here is about logging, not about what was eaten. */}
          <p className="t-sm muted-2" style={{ marginTop: '0.9rem' }}>
            Mede o hábito de registar, não a qualidade da alimentação.
          </p>
        </Card>
      </section>

      <section>
        <SectionHeader title="Energia (14 dias)" />
        <Card variant="quiet">
          <BarChart
            points={points}
            format={(value) => `${Math.round(value)} kcal`}
            emptyLabel="Sem valores nutricionais registados"
          />
        </Card>
      </section>

      <section>
        <SectionHeader title="Últimas refeições" />
        {recent.length === 0 ? (
          <EmptyState brand="estatisticas" title="Sem histórico" />
        ) : (
          <Card variant="flush">
            <Rows>
              {recent.map((meal) => (
                <Row
                  key={meal.key}
                  icon="utensils"
                  title={MEAL_LABELS[meal.type]}
                  sub={[
                    meal.meal ? mediumDate(meal.meal.date) : null,
                    meal.itemNames.join(', '),
                  ].filter(Boolean).join(' · ')}
                  trail={mealTrail(meal)}
                  chevron
                  onClick={() => onOpen(meal)}
                />
              ))}
            </Rows>
          </Card>
        )}
      </section>
    </div>
  );
}
