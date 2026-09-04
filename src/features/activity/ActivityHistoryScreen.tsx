/**
 * Todo o histórico, com filtros.
 *
 * O ecrã principal mostra as últimas doze; quem quer procurar uma corrida de
 * há três meses vem aqui. Filtra por tipo e por período, e diz sempre quantas
 * está a mostrar — uma lista filtrada sem contagem parece uma lista vazia.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACTIVITY_LABELS, ACTIVITY_TYPE_OPTIONS } from '../../core/constants';
import type { ActivityType } from '../../core/types';
import { mediumDate } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import * as activity from '../../domain/activity';
import { PERIOD_OPTIONS, sessionsInPeriod, summarizePeriod, type PeriodId } from '../../domain/activity-insights';
import { useApp, usePreferences, useStoreVersion } from '../../app/providers/appContext';
import { Screen } from '../../app/navigation/Screen';
import { Card } from '../../ui/primitives';
import { EmptyState, Metric, Row, Rows } from '../../ui/data';
import { Segmented } from '../../ui/form';
import { PageHeader } from '../../ui/page';
import { iconFor } from './ActivityScreen';

type TypeFilter = ActivityType | 'all';

const TYPE_OPTIONS = [
  { id: 'all' as TypeFilter, label: 'Todas' },
  ...ACTIVITY_TYPE_OPTIONS.map((option) => ({ id: option.id as TypeFilter, label: option.label })),
];

export function ActivityHistoryScreen(): ReactElement {
  const { repos } = useApp();
  const preferences = usePreferences();
  const navigate = useNavigate();
  const version = useStoreVersion();

  const [type, setType] = useState<TypeFilter>('all');
  const [period, setPeriod] = useState<PeriodId>('30d');

  const sessions = useMemo(() => {
    const all = repos.activitySessions.all()
      .filter((session) => type === 'all' || session.type === type);
    return activity.history(sessionsInPeriod(all, period));
  }, [repos, type, period, version]);

  const summary = useMemo(() => summarizePeriod(sessions), [sessions]);
  const unit = preferences.distanceUnit;

  return (
    <Screen>
      <PageHeader
        eyebrow="Atividade"
        title="Histórico"
        subtitle={`${sessions.length} ${sessions.length === 1 ? 'atividade' : 'atividades'}`}
      />

      <div className="stack stack-3">
        <Segmented
          options={PERIOD_OPTIONS.map((option) => ({ id: option.id, label: option.label }))}
          value={period}
          onChange={setPeriod}
          ariaLabel="Período"
        />
        <div className="chips-scroll">
          {TYPE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="chip"
              aria-pressed={type === option.id}
              onClick={() => setType(option.id)}
            >
              <span className="dot" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {sessions.length > 0 ? (
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
        </Card>
      ) : null}

      {sessions.length === 0 ? (
        <EmptyState
          brand="corrida"
          title="Nada neste filtro"
          body="Experimenta outro período ou outro tipo de atividade."
        />
      ) : (
        <Card variant="flush">
          <Rows>
            {sessions.map((session) => {
              const m = activity.metricsOf(session);
              return (
                <Row
                  key={session.id}
                  icon={iconFor(session.type)}
                  title={ACTIVITY_LABELS[session.type]}
                  sub={[
                    mediumDate(session.date),
                    format.duration(m.durationSec),
                    m.distanceM ? format.distance(m.distanceM, unit) : null,
                  ].filter(Boolean).join(' · ')}
                  trail={
                    m.paceMode === 'speed'
                      ? `${format.number(m.speedKmh, 1)} ${unit}/h`
                      : m.paceMode === 'pace' && m.distanceM
                        ? format.pace(m.paceSecPerKm, unit)
                        : null
                  }
                  chevron
                  onClick={() => navigate(`/atividade/detalhe/${session.id}`)}
                />
              );
            })}
          </Rows>
        </Card>
      )}
    </Screen>
  );
}
