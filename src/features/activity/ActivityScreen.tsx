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
  deleteGoal, deleteSession, overview, saveGoal, saveManual, type ManualEntry,
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
import { GoalsSection, SummarySection } from './sections';
import {
  EvolutionSection, FrequencySection, InsightsSection, RecordsSection,
} from './EvolutionSection';
import { AskPace } from '../assistant/AskPace';

type SheetState =
  | { kind: 'manual'; entry?: ManualEntry; id?: string }
  | { kind: 'goal'; goal?: ActivityGoal }
  | null;

/**
 * O equivalente ilustrado de cada atividade.
 *
 * Só "Outro" fica sem desenho — é a atividade que pode ser qualquer coisa, e
 * qualquer imagem que lhe déssemos estaria a dizer mais do que sabemos. Essa
 * cai no ícone de linha, que segue o tema.
 */
export function brandIconFor(type: ActivityType): BrandIconName | null {
  if (type === 'run') return 'corrida';
  if (type === 'ride') return 'bicicleta';
  if (type === 'walk') return 'caminhada';
  if (type === 'brisk_walk') return 'caminhada-rapida';
  if (type === 'hike') return 'hiking';
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
  const unit = preferences.distanceUnit;

  // Os recordes saem já escritos, e quem os escreve tem de ser quem conhece as
  // unidades do utilizador — km ou milhas, vírgula ou ponto.
  const model = useMemo(
    () => overview(repos, todayKey(), {
      distance: (m) => format.distance(m, unit),
      duration: (secs) => format.duration(secs),
      pace: (secs) => format.pace(secs, unit),
    }),
    [repos, unit, version],
  );

  // Tocar num tipo não arranca nada: leva ao ecrã de preparação, onde se vê o
  // estado do GPS e o que está em aberto antes de o cronómetro começar.
  const begin = useCallback(
    (type: ActivityType) => {
      feedback.touch('light');
      navigate(`/atividade/preparar/${type}`);
    },
    [feedback, navigate],
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
            {ACTIVITY_TYPE_OPTIONS.map((option) => (
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

        <HistorySection
          sessions={model.recent}
          total={model.totals.sessions}
          unit={unit}
          onOpen={(session) => navigate(`/atividade/detalhe/${session.id}`)}
          onSeeAll={() => navigate('/atividade/historico')}
        />

        <FrequencySection frequency={model.frequency} unit={unit} />
        <EvolutionSection unit={unit} />
        <RecordsSection records={model.records} />
        <InsightsSection insights={model.insights} />
        <AskPace questions={[
          'Como está a minha evolução na atividade?',
          'Devo aumentar o volume de corrida?',
          'Cria-me um plano para correr 10 km',
        ]} />
      </Screen>

      <Fab label="Registar atividade" onClick={() => setSheet({ kind: 'manual' })} />

      <ActivitySheets
        sheet={sheet}
        onClose={() => setSheet(null)}
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
  sessions, total, unit, onOpen, onSeeAll,
}: {
  sessions: ActivitySession[];
  total: number;
  unit: 'km' | 'mi';
  onOpen: (session: ActivitySession) => void;
  onSeeAll: () => void;
}): ReactElement {
  return (
    <section>
      <SectionHeader
        title="Histórico"
        actionLabel={total > sessions.length ? `Ver ${total}` : undefined}
        onAction={total > sessions.length ? onSeeAll : undefined}
      />
      {sessions.length === 0 ? (
        <EmptyState
          brand="corrida"
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
  sheet, onClose, onSaveManual, onDeleteManual, onSaveGoal, onDeleteGoal,
}: {
  sheet: SheetState;
  onClose: () => void;
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

  return null;
}
