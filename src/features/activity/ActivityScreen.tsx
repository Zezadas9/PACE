import { useMemo, type ReactElement } from 'react';
import { ACTIVITY_LABELS } from '../../core/constants';
import { longDate } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import {
  usePreferences, useRepos, useStoreVersion,
} from '../../app/providers/appContext';
import { Screen } from '../../app/navigation/Screen';
import { Card, SectionHeader } from '../../ui/primitives';
import { EmptyState, Metric, Row, Rows } from '../../ui/data';
import { PageHeader, Upcoming } from '../../ui/page';

export function ActivityScreen(): ReactElement {
  const repos = useRepos();
  const preferences = usePreferences();
  const version = useStoreVersion();

  const sessions = useMemo(
    () => repos.activitySessions.all().sort((a, b) => (a.date < b.date ? 1 : -1)),
    [repos, version],
  );

  const totals = useMemo(
    () =>
      sessions.reduce(
        (acc, session) => ({
          duration: acc.duration + (session.durationSec ?? 0),
          distance: acc.distance + (session.distanceM ?? 0),
        }),
        { duration: 0, distance: 0 },
      ),
    [sessions],
  );

  return (
    <Screen>
      <PageHeader
        eyebrow="Movimento"
        title="Atividade"
        subtitle="Tudo o que fazes fora do plano de treino."
      />
      <Card variant="quiet">
        <div className="grid-2">
          <Metric label="Tempo total" value={format.duration(totals.duration)} />
          <Metric
            label="Distância total"
            value={format.distance(totals.distance, preferences.distanceUnit)}
          />
        </div>
      </Card>
      <section>
        <SectionHeader title="Registos" />
        {sessions.length === 0 ? (
          <EmptyState
            icon="run"
            title="Sem atividades"
            body="Corridas, caminhadas e passeios aparecem aqui."
          />
        ) : (
          <Card variant="flush">
            <Rows>
              {sessions.map((session) => (
                <Row
                  key={session.id}
                  icon="run"
                  title={ACTIVITY_LABELS[session.type] ?? 'Atividade'}
                  sub={longDate(session.date)}
                  trail={format.duration(session.durationSec)}
                />
              ))}
            </Rows>
          </Card>
        )}
      </section>
      <Upcoming
        items={[
          'Registo manual e cronómetro com GPS',
          'Ritmo, elevação e frequência cardíaca',
          'Importação do HealthKit e do Health Connect',
        ]}
      />
    </Screen>
  );
}
