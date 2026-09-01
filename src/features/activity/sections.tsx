/** Goals, totals and charts — the three read-only blocks of the activity screen. */

import type { ReactElement } from 'react';
import type { ActivityGoal, DistanceUnit } from '../../core/types';
import { MONTHS_SHORT, fromKey } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import type { ActivityTotals, GoalProgress, PeriodBucket } from '../../domain/activity';
import { distance as distanceUnits } from '../../core/utils/units';
import { Card, SectionHeader } from '../../ui/primitives';
import { EmptyState, Metric, ProgressBar } from '../../ui/data';
import { BarChart, TrendLine, type ChartPoint } from '../../ui/charts';
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
          icon="target"
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
                {progress.complete
                  ? 'Concluído'
                  : `Faltam ${formatAmount(progress.goal, progress.remaining, unit)}`}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** A goal's numbers are metres, seconds or a count — read them accordingly. */
function formatAmount(goal: ActivityGoal, value: number, unit: DistanceUnit): string {
  if (goal.metric === 'distance') return format.distance(value, unit);
  if (goal.metric === 'duration') return format.duration(value);
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

export function ChartsSection({
  weeks, unit,
}: {
  weeks: PeriodBucket[];
  unit: DistanceUnit;
}): ReactElement | null {
  if (weeks.every((week) => week.sessions === 0)) return null;

  const label = (bucket: PeriodBucket): string => {
    const date = fromKey(bucket.start);
    return date ? `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}` : '';
  };
  const last = weeks.length - 1;

  const toPoints = (pick: (b: PeriodBucket) => number): ChartPoint[] =>
    weeks.map((bucket, index) => ({
      key: bucket.start,
      value: pick(bucket),
      label: index === 0 || index === last ? label(bucket) : '',
      current: index === last,
    }));

  return (
    <section>
      <SectionHeader title="Evolução" actionLabel="8 semanas" />
      <div className="stack stack-3">
        <Card>
          <p className="t-eyebrow">Distância por semana</p>
          <BarChart
            points={toPoints((b) => b.distanceM)}
            format={(value) => format.distance(value, unit)}
          />
        </Card>
        <Card>
          <p className="t-eyebrow">Tempo por semana</p>
          <BarChart
            points={toPoints((b) => b.durationSec)}
            format={(value) => format.duration(value)}
          />
        </Card>
        <Card>
          <p className="t-eyebrow">Frequência</p>
          <BarChart points={toPoints((b) => b.sessions)} format={(v) => `${v}`} />
        </Card>
        <Card>
          <p className="t-eyebrow">Ritmo médio</p>
          {/* Lower is better, so the line is inverted: improvement goes up. */}
          <TrendLine
            points={toPoints((b) => b.paceSecPerKm ?? 0)}
            invert
            emptyLabel="Ainda sem ritmo suficiente para uma tendência"
          />
          <p className="t-sm muted-2">
            {(() => {
              const paced = weeks.filter((w) => w.paceSecPerKm);
              const first = paced[0]?.paceSecPerKm;
              const latest = paced[paced.length - 1]?.paceSecPerKm;
              if (!first || !latest || paced.length < 2) return 'Sobe = mais rápido.';
              const delta = first - latest;
              if (Math.abs(delta) < 3) return 'Ritmo estável.';
              return delta > 0
                ? `${format.duration(delta)} mais rápido por ${unit} desde a primeira semana.`
                : `${format.duration(-delta)} mais lento por ${unit} desde a primeira semana.`;
            })()}
          </p>
        </Card>
      </div>
    </section>
  );
}

export { distanceUnits };
