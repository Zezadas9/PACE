/**
 * Atividade — start something, see how the week is going, look back.
 *
 * Ordered by what brings you here: the button to begin, then the goals you set,
 * then the history behind them.
 */

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { ACTIVITY_LABELS, ACTIVITY_TYPE_OPTIONS } from '../../core/constants';
import type { ActivityGoal, ActivitySession, ActivityType } from '../../core/types';
import { mediumDate, todayKey } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import * as activity from '../../domain/activity';
import {
  deleteGoal, deleteSession, entryFromSession, overview, saveGoal, saveManual,
  startSession, type ManualEntry,
} from '../../services/activity';
import {
  useApp, useFeedback, usePreferences, useStoreVersion,
} from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Screen } from '../../app/navigation/Screen';
import { Card, SectionHeader } from '../../ui/primitives';
import { EmptyState, Row, Rows } from '../../ui/data';
import { Fab } from '../../ui/Fab';
import { PageHeader } from '../../ui/page';
import { Icon, type IconName } from '../../ui/Icon';
import { BrandIcon, type BrandIconName } from '../../ui/BrandIcon';
import { ActivityForm } from './ActivityForm';
import { ActivityGoalForm } from './ActivityGoalForm';
import { ChartsSection, GoalsSection, SummarySection } from './sections';
import { DetailSheet } from './DetailSheet';

type SheetState =
  | { kind: 'manual'; entry?: ManualEntry; id?: string }
  | { kind: 'goal'; goal?: ActivityGoal }
  | { kind: 'detail'; session: ActivitySession }
  | null;

/**
 * The illustrated equivalent, where the sheet actually has one.
 *
 * There is no walking or hiking artwork, and reusing the running shoe for all
 * three made the grid look broken rather than illustrated. Those fall back to
 * the line icon, on the same dark tile so the row still reads as one set.
 */
export function brandIconFor(type: ActivityType): BrandIconName | null {
  if (type === 'run') return 'corrida';
  if (type === 'ride') return 'bicicleta';
  return null;
}

export function iconFor(type: ActivityType): IconName {
  return (ACTIVITY_TYPE_OPTIONS.find((o) => o.id === type)?.icon ?? 'activity') as IconName;
}

export function ActivityScreen(): ReactElement {
  const { repos } = useApp();
  const feedback = useFeedback();
  const preferences = usePreferences();
  const { confirm, toast } = useUi();
  const navigate = useNavigate();
  const version = useStoreVersion();

  const [sheet, setSheet] = useState<SheetState>(null);
  const model = useMemo(() => overview(repos), [repos, version]);
  const unit = preferences.distanceUnit;

  const begin = useCallback(
    (type: ActivityType) => {
      startSession(repos, type);
      feedback.touch('medium');
      navigate('/atividade/sessao');
    },
    [repos, feedback, navigate],
  );

  return (
    <>
      <Screen>
        <PageHeader
          eyebrow="Movimento"
          title="Atividade"
          subtitle="Corridas, caminhadas e passeios."
        />

        {model.running ? (
          <Card onClick={() => navigate('/atividade/sessao')}>
            <div className="row row-between">
              <div className="grow">
                <p className="t-eyebrow">A decorrer</p>
                <p className="t-h1" style={{ marginTop: '0.25rem' }}>
                  {ACTIVITY_LABELS[model.running.type]}
                </p>
                <p className="t-sm muted">
                  {format.duration(activity.elapsedSec(model.running))}
                  {model.running.pausedAt ? ' · em pausa' : ''}
                </p>
              </div>
              <span className="today-cta">Continuar</span>
            </div>
          </Card>
        ) : (
          <div className="start-grid">
            {ACTIVITY_TYPE_OPTIONS.slice(0, 4).map((option) => (
              <button
                key={option.id}
                type="button"
                className="start-tile"
                onClick={() => begin(option.id)}
              >
                <span className="start-art">
                  {(() => {
                    const brand = brandIconFor(option.id);
                    return brand
                      ? <BrandIcon name={brand} size={40} float />
                      : <Icon name={option.icon as IconName} />;
                  })()}
                </span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        )}

        <GoalsSection
          goals={model.goals}
          unit={unit}
          onAdd={() => setSheet({ kind: 'goal' })}
          onEdit={(goal) => setSheet({ kind: 'goal', goal })}
        />

        <SummarySection totals={model.totals} unit={unit} />
        <ChartsSection weeks={model.weeks} unit={unit} />

        <HistorySection
          sessions={model.recent}
          total={model.totals.sessions}
          unit={unit}
          onOpen={(session) => setSheet({ kind: 'detail', session })}
        />
      </Screen>

      <Fab label="Registar atividade" onClick={() => setSheet({ kind: 'manual' })} />

      <ActivitySheets
        sheet={sheet}
        onClose={() => setSheet(null)}
        onEditSession={(session) => setSheet({
          kind: 'manual', entry: entryFromSession(session), id: session.id,
        })}
        onSaveManual={(entry, id) => {
          saveManual(repos, entry, id);
          feedback.play('complete');
          setSheet(null);
          toast(id ? 'Atividade atualizada.' : 'Atividade registada.');
        }}
        onDeleteManual={(id) => {
          void (async () => {
            const ok = await confirm({
              title: 'Apagar atividade?', confirmLabel: 'Apagar', danger: true,
            });
            if (!ok) return;
            deleteSession(repos, id);
            setSheet(null);
          })();
        }}
        onSaveGoal={(goal, id) => {
          saveGoal(repos, goal, id);
          setSheet(null);
          toast(id ? 'Objetivo atualizado.' : 'Objetivo criado.');
        }}
        onDeleteGoal={(id) => {
          void (async () => {
            const ok = await confirm({
              title: 'Apagar objetivo?', confirmLabel: 'Apagar', danger: true,
            });
            if (!ok) return;
            deleteGoal(repos, id);
            setSheet(null);
          })();
        }}
      />
    </>
  );
}

function HistorySection({
  sessions, total, unit, onOpen,
}: {
  sessions: ActivitySession[];
  total: number;
  unit: 'km' | 'mi';
  onOpen: (session: ActivitySession) => void;
}): ReactElement {
  return (
    <section>
      <SectionHeader title="Histórico" actionLabel={total > 0 ? String(total) : undefined} />
      {sessions.length === 0 ? (
        <EmptyState
          icon="run"
          title="Sem atividades"
          body="Começa uma acima, ou usa o + para registar à mão."
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
                      : m.paceMode === 'pace'
                        ? format.pace(m.paceSecPerKm, unit)
                        : null
                  }
                  chevron
                  onClick={() => onOpen(session)}
                />
              );
            })}
          </Rows>
        </Card>
      )}
    </section>
  );
}

/** The sheets, split out so the screen above stays about layout. */
function ActivitySheets({
  sheet, onClose, onEditSession, onSaveManual, onDeleteManual, onSaveGoal, onDeleteGoal,
}: {
  sheet: SheetState;
  onClose: () => void;
  onEditSession: (session: ActivitySession) => void;
  onSaveManual: (entry: ManualEntry, id?: string) => void;
  onDeleteManual: (id: string) => void;
  onSaveGoal: (goal: ActivityGoal, id?: string) => void;
  onDeleteGoal: (id: string) => void;
}): ReactElement | null {
  const preferences = usePreferences();
  if (!sheet) return null;

  if (sheet.kind === 'manual') {
    return (
      <ActivityForm
        date={todayKey()}
        existing={sheet.entry}
        existingId={sheet.id}
        preferences={preferences}
        onClose={onClose}
        onSave={(entry) => onSaveManual(entry, sheet.id)}
        onDelete={sheet.id ? () => onDeleteManual(sheet.id!) : undefined}
      />
    );
  }

  if (sheet.kind === 'goal') {
    return (
      <ActivityGoalForm
        existing={sheet.goal}
        preferences={preferences}
        onClose={onClose}
        onSave={(goal) => onSaveGoal(goal, sheet.goal?.id)}
        onDelete={sheet.goal ? () => onDeleteGoal(sheet.goal!.id) : undefined}
      />
    );
  }

  return (
    <DetailSheet
      session={sheet.session}
      onClose={onClose}
      onEdit={() => onEditSession(sheet.session)}
    />
  );
}
