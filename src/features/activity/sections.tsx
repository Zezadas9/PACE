/** Objetivos e totais — os blocos só de leitura do ecrã de atividade.
 *
 * A evolução vive em EvolutionSection, que tem período à escolha. */

import type { ReactElement } from 'react';
import type { ActivityGoal, DistanceUnit } from '../../core/types';
import * as format from '../../core/utils/format';
import type { ActivityTotals, GoalProgress } from '../../domain/activity';
import { distance as distanceUnits } from '../../core/utils/units';
import { Card, SectionHeader } from '../../ui/primitives';
import { EmptyState, Metric, ProgressBar } from '../../ui/data';
import { describeGoal } from './ActivityGoalForm';

export function GoalsSection({
  goals, unit, onAdd, onEdit,
}: {
  goals: GoalProgress[];
  unit: DistanceUnit;
  onAdd: () => void;
  onEdit: (goal: ActivityGoal) => void;
}): ReactElement {
  return (
    <section>
      <SectionHeader title="Objetivos" actionLabel="Novo" onAction={onAdd} />
      {goals.length === 0 ? (
        <EmptyState
          brand="objetivos"
          title="Sem objetivos"
          body="Ex.: correr 20 km esta semana, ou caminhar 30 minutos por dia."
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
                  {progress.goal.title || describeGoal(progress.goal, unit)}
                </span>
                <span className="t-num">{Math.round(progress.ratio * 100)}%</span>
              </div>
              <ProgressBar ratio={progress.ratio} />
              <span className="sub t-sm muted">
                {progress.current == null
                  ? 'Ainda sem registos neste período'
                  : progress.complete
                    ? 'Concluído'
                    : progress.lowerIsBetter
                      ? `${formatAmount(progress.goal, progress.remaining, unit)} acima do alvo`
                      : `Faltam ${formatAmount(progress.goal, progress.remaining, unit)}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** A goal's numbers are metres, seconds, a pace, a speed or a count. */
function formatAmount(goal: ActivityGoal, value: number, unit: DistanceUnit): string {
  if (goal.metric === 'distance') return format.distance(value, unit);
  if (goal.metric === 'duration') return format.duration(value);
  if (goal.metric === 'pace') return `${format.duration(value)}/${unit}`;
  if (goal.metric === 'speed') return `${format.number(value / 10, 1)} ${unit}/h`;
  return `${value} ${value === 1 ? 'vez' : 'vezes'}`;
}

export function SummarySection({
  totals, unit,
}: {
  totals: ActivityTotals;
  unit: DistanceUnit;
}): ReactElement | null {
  if (totals.sessions === 0) return null;
  return (
    <section>
      <SectionHeader title="Totais" />
      <Card variant="quiet">
        <div className="grid-2">
          <Metric label="Distância" value={format.distance(totals.distanceM, unit)} />
          <Metric label="Tempo" value={format.duration(totals.durationSec)} />
          <Metric
            label="Melhor ritmo"
            value={totals.bestPaceSecPerKm ? format.pace(totals.bestPaceSecPerKm, unit) : '—'}
          />
          <Metric
            label="Mais longe"
            value={totals.longestDistanceM ? format.distance(totals.longestDistanceM, unit) : '—'}
          />
        </div>
      </Card>
    </section>
  );
}

export { distanceUnits };
