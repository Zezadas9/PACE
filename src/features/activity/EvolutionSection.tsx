/**
 * Evolução, frequência, recordes e observações.
 *
 * Quatro blocos que só existem quando há dados para eles. O período é escolhido
 * pelo utilizador e a comparação é sempre com a janela anterior do mesmo
 * tamanho — dizer "mais 12 km" sem dizer face a quê não informa ninguém.
 */

import { useMemo, useState, type ReactElement } from 'react';
import type { ActivityType, DistanceUnit } from '../../core/types';
import { MONTHS_SHORT, fromKey } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import type { PeriodBucket } from '../../domain/activity';
import {
  PERIOD_OPTIONS, type ActivityInsight, type FrequencyStats, type PeriodId,
  type PersonalRecord,
} from '../../domain/activity-insights';
import { evolution } from '../../services/activity';
import { useApp, useStoreVersion } from '../../app/providers/appContext';
import { Card, SectionHeader } from '../../ui/primitives';
import { Metric } from '../../ui/data';
import { Segmented } from '../../ui/form';
import { BarChart, TrendLine, type ChartPoint } from '../../ui/charts';

function bucketLabel(bucket: PeriodBucket): string {
  const date = fromKey(bucket.start);
  return date ? `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}` : '';
}

export function EvolutionSection({
  unit, type = null,
}: {
  unit: DistanceUnit;
  type?: ActivityType | null;
}): ReactElement | null {
  const { repos } = useApp();
  const version = useStoreVersion();
  const [period, setPeriod] = useState<PeriodId>('30d');

  const model = useMemo(
    () => evolution(repos, period, type),
    [repos, period, type, version],
  );

  const hasAny = useMemo(
    () => repos.activitySessions.all().some((session) => session.endedAt !== null),
    [repos, version],
  );
  if (!hasAny) return null;

  const { summary, previous, buckets } = model;
  const last = buckets.length - 1;
  const toPoints = (pick: (b: PeriodBucket) => number): ChartPoint[] =>
    buckets.map((bucket, index) => ({
      key: bucket.start,
      value: pick(bucket),
      label: index === 0 || index === last ? bucketLabel(bucket) : '',
      current: index === last,
    }));

  return (
    <section>
      <SectionHeader title="Evolução" />
      <div className="stack stack-3">
        <Segmented
          options={PERIOD_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
          value={period}
          onChange={setPeriod}
          ariaLabel="Período"
        />

        {summary.sessions === 0 ? (
          <Card variant="quiet">
            <p className="t-sm muted">Nenhuma atividade neste período.</p>
          </Card>
        ) : (
          <>
            <Card variant="quiet">
              <div className="grid-2">
                <Metric label="Atividades" value={String(summary.sessions)} />
                <Metric
                  label="Distância"
                  value={summary.distanceM == null ? '—' : format.distance(summary.distanceM, unit)}
                />
                <Metric
                  label="Tempo"
                  value={summary.durationSec == null ? '—' : format.duration(summary.durationSec)}
                />
                <Metric
                  label="Ritmo médio"
                  value={summary.paceSecPerKm == null ? '—' : format.pace(summary.paceSecPerKm, unit)}
                />
              </div>
              {previous.sessions > 0 ? (
                <p className="t-sm muted-2" style={{ marginTop: 'var(--s-3)' }}>
                  {compare(summary.distanceM, previous.distanceM, unit)}
                </p>
              ) : null}
            </Card>

            <Card>
              <p className="t-eyebrow">Distância por semana</p>
              <BarChart
                points={toPoints((b) => b.distanceM)}
                format={(value) => format.distance(value, unit)}
              />
            </Card>
            <Card>
              <p className="t-eyebrow">Tempo por semana</p>
              <BarChart points={toPoints((b) => b.durationSec)} format={format.duration} />
            </Card>
            <Card>
              <p className="t-eyebrow">Ritmo médio</p>
              {/* Menor é melhor, por isso a linha vai invertida: melhorar sobe. */}
              <TrendLine
                points={toPoints((b) => b.paceSecPerKm ?? 0)}
                invert
                emptyLabel="Ainda sem ritmo suficiente para uma tendência"
              />
            </Card>
          </>
        )}
      </div>
    </section>
  );
}

/** A comparação com o período anterior, ou silêncio se não houver com quê. */
function compare(current: number | null, previous: number | null, unit: DistanceUnit): string {
  if (current == null || previous == null || previous === 0) {
    return 'Sem período anterior comparável.';
  }
  const delta = current - previous;
  if (Math.abs(delta) < previous * 0.05) return 'Praticamente igual ao período anterior.';
  return delta > 0
    ? `${format.distance(delta, unit)} a mais do que no período anterior.`
    : `${format.distance(-delta, unit)} a menos do que no período anterior.`;
}

/**
 * Frequência: esta semana, a média, e as últimas oito semanas em barras.
 *
 * A tira de oito semanas é o que responde à pergunta "tenho sido regular?" sem
 * ninguém ter de ler números.
 */
export function FrequencySection({
  frequency, unit,
}: {
  frequency: FrequencyStats;
  unit: DistanceUnit;
}): ReactElement | null {
  if (frequency.total === 0) return null;

  const max = Math.max(1, ...frequency.weeks.map((week) => week.sessions));

  return (
    <section>
      <SectionHeader title="Frequência" />
      <Card>
        <div className="grid-3">
          <Metric label="Esta semana" value={String(frequency.thisWeek)} />
          <Metric
            label="Média semanal"
            value={frequency.weeklyAverage == null ? '—' : format.number(frequency.weeklyAverage, 1)}
          />
          <Metric
            label="Última"
            value={
              frequency.daysSinceLast == null
                ? '—'
                : frequency.daysSinceLast === 0
                  ? 'Hoje'
                  : `há ${frequency.daysSinceLast}d`
            }
          />
        </div>

        <div className="week-strip" style={{ marginTop: 'var(--s-4)' }}>
          {frequency.weeks.map((week, index) => (
            <div key={week.start} className="week-strip-col">
              <div
                className="week-strip-bar"
                data-current={String(index === frequency.weeks.length - 1)}
                data-empty={String(week.sessions === 0)}
                style={{ height: `${Math.max(6, (week.sessions / max) * 100)}%` }}
                title={`${week.sessions} ${week.sessions === 1 ? 'atividade' : 'atividades'}`}
              />
              <span className="week-strip-label t-num">{week.sessions || ''}</span>
            </div>
          ))}
        </div>
        <p className="t-sm muted-2" style={{ marginTop: 'var(--s-2)' }}>
          Últimas 8 semanas
          {frequency.weeks[frequency.weeks.length - 1]?.distanceM
            ? ` · ${format.distance(frequency.weeks[frequency.weeks.length - 1]!.distanceM, unit)} esta semana`
            : ''}
        </p>
      </Card>
    </section>
  );
}

export function RecordsSection({ records }: { records: PersonalRecord[] }): ReactElement | null {
  if (records.length === 0) return null;
  return (
    <section>
      <SectionHeader title="Recordes" />
      <Card variant="quiet">
        <div className="grid-2">
          {records.map((record) => (
            <Metric key={record.id} label={record.label} value={record.value} />
          ))}
        </div>
      </Card>
    </section>
  );
}

export function InsightsSection({
  insights,
}: {
  insights: ActivityInsight[];
}): ReactElement | null {
  if (insights.length === 0) return null;
  return (
    <section>
      <SectionHeader title="O que os dados dizem" />
      <div className="stack stack-3">
        {insights.map((insight) => (
          <Card key={insight.id} variant="quiet">
            <div className="row">
              <span className={`insight-dot insight-${insight.tone}`} aria-hidden="true" />
              <p className="t-sm grow" style={{ marginLeft: 'var(--s-3)' }}>{insight.text}</p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
