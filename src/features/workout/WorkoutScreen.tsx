/**
 * Treino — plans, today's session, history and progression.
 *
 * The screen is ordered by what you most likely opened it for: start today's
 * workout, then pick another plan, then look back.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { WORKOUT_TYPE_LABELS } from '../../core/constants';
import type { Workout } from '../../core/types';
import { longDate, todayKey } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import * as training from '../../domain/training';
import {
  archiveWorkout, draftFromWorkout, planSession, plannedForDay, saveWorkout,
  startSession, type WorkoutDraft,
} from '../../services/training';
import { useApp, useFeedback, useStoreVersion } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Screen } from '../../app/navigation/Screen';
import { Card, SectionHeader } from '../../ui/primitives';
import { EmptyState, Metric, ProgressBar, Row, Rows } from '../../ui/data';
import { Fab } from '../../ui/Fab';
import { PageHeader } from '../../ui/page';
import { WorkoutBuilder } from './WorkoutBuilder';
import { HistorySection } from './HistorySection';
import { AskPace } from '../assistant/AskPace';

/** "seg, qua, sex" — or nothing at all when the plan is not on a schedule. */
function describeWeekdays(weekdays: number[]): string | null {
  if (weekdays.length === 0) return null;
  if (weekdays.length === 7) return 'todos os dias';
  const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return weekdays
    .slice()
    .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
    .map((day) => names[day])
    .join(', ');
}

export function WorkoutScreen(): ReactElement {
  const { repos } = useApp();
  const feedback = useFeedback();
  const { confirm, toast } = useUi();
  const navigate = useNavigate();
  const version = useStoreVersion();

  const [builder, setBuilder] = useState<{ draft?: WorkoutDraft } | null>(null);
  const today = todayKey();

  const data = useMemo(() => {
    const workouts = repos.workouts.where((workout) => !workout.archived);
    const sessions = repos.workoutSessions.all();
    return {
      workouts,
      sessions,
      planned: plannedForDay(repos, today),
      stats: training.trainingStats(sessions, repos.workouts.all(), today),
      weeks: training.weeklyFrequency(sessions, 8, today),
    };
  }, [repos, today, version]);

  const todayWorkout = data.planned.workout;

  const begin = (workout: Workout): void => {
    startSession(repos, workout.id, today);
    feedback.touch('medium');
    navigate('/treino/sessao');
  };

  return (
    <>
      <Screen>
        <PageHeader
          eyebrow="Força e movimento"
          title="Treino"
          subtitle="Planos, sessões e progressão."
        />

        <TodayCard
          session={data.planned.session}
          workout={todayWorkout}
          onStart={() => todayWorkout && begin(todayWorkout)}
          onResume={() => navigate('/treino/sessao')}
        />

        <section>
          <SectionHeader title="Planos" actionLabel={String(data.workouts.length)} />
          {data.workouts.length === 0 ? (
            <EmptyState
              brand="planos"
              title="Sem planos de treino"
              body="Cria o primeiro com o botão +."
            />
          ) : (
            <Card variant="flush">
              <Rows>
                {data.workouts.map((workout) => (
                  <Row
                    key={workout.id}
                    icon="dumbbell"
                    hue={workout.type}
                    title={workout.title}
                    sub={[
                      WORKOUT_TYPE_LABELS[workout.type],
                      `${workout.blocks.length} exercícios`,
                      workout.estimatedMin ? `${workout.estimatedMin} min` : null,
                      describeWeekdays(workout.weekdays),
                      workout.timeOfDay,
                    ].filter(Boolean).join(' · ')}
                    chevron
                    onClick={() =>
                      setBuilder({ draft: draftFromWorkout(workout, repos.exercises.all()) })}
                  />
                ))}
              </Rows>
            </Card>
          )}
        </section>

        <FrequencySection stats={data.stats} weeks={data.weeks} />
        <HistorySection />
        <AskPace questions={[
          'Cria-me um treino de 45 minutos',
          'Como está a minha evolução no treino?',
          'Que treino devo fazer hoje?',
        ]} />
      </Screen>

      <Fab label="Novo treino" onClick={() => setBuilder({})} />

      {builder !== null ? (
        <WorkoutBuilder
          initial={builder.draft}
          onClose={() => setBuilder(null)}
          onSave={(draft) => {
            const workout = saveWorkout(repos, draft);
            setBuilder(null);
            toast(draft.id ? 'Treino atualizado.' : 'Treino criado.');
            if (!draft.id) planSession(repos, workout.id, today);
          }}
          onArchive={
            builder.draft?.id
              ? () => {
                  void (async () => {
                    const ok = await confirm({
                      title: 'Arquivar treino?',
                      body: 'Sai da lista, mas o histórico das sessões fica intacto.',
                      confirmLabel: 'Arquivar',
                    });
                    if (!ok) return;
                    archiveWorkout(repos, builder.draft!.id!);
                    setBuilder(null);
                  })();
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}

function TodayCard({
  session, workout, onStart, onResume,
}: {
  session: import('../../core/types').WorkoutSession | null;
  workout: Workout | null;
  onStart: () => void;
  onResume: () => void;
}): ReactElement {
  if (!workout) {
    return (
      <section>
        <SectionHeader title="Hoje" />
        <EmptyState
          brand="treinos"
          title="Sem treino marcado"
          body="Escolhe um plano abaixo ou cria um novo."
        />
      </section>
    );
  }

  const progress = session
    ? training.sessionProgress(session, workout)
    : { ratio: 0, setsCompleted: 0, setsTotal: 0, blocksCompleted: 0, blocksTotal: 0 };
  const running = session != null && session.startedAt !== null && !session.completed;

  return (
    <section>
      <SectionHeader title="Hoje" />
      <Card onClick={running ? onResume : onStart}>
        <div className="row row-between">
          <div className="grow">
            <p className="t-eyebrow">{WORKOUT_TYPE_LABELS[workout.type]}</p>
            <p className="t-h1" style={{ marginTop: '0.25rem' }}>{workout.title}</p>
            <p className="t-sm muted">
              {workout.blocks.length} exercícios
              {workout.estimatedMin ? ` · ${workout.estimatedMin} min` : ''}
            </p>
          </div>
          <span className="today-cta">
            {session?.completed ? 'Feito' : running ? 'Continuar' : 'Começar'}
          </span>
        </div>
        {running || session?.completed ? (
          <div style={{ marginTop: 'var(--s-4)' }}>
            <ProgressBar ratio={progress.ratio} />
            <p className="t-sm muted-2" style={{ marginTop: 'var(--s-2)' }}>
              {progress.setsCompleted} de {progress.setsTotal} séries
            </p>
          </div>
        ) : null}
      </Card>
    </section>
  );
}

function FrequencySection({
  stats, weeks,
}: {
  stats: training.TrainingStats;
  weeks: training.WeekBar[];
}): ReactElement | null {
  if (stats.totalSessions === 0) return null;
  const peak = Math.max(1, ...weeks.map((week) => week.sessions));

  return (
    <section>
      <SectionHeader title="Frequência" />
      <Card variant="quiet">
        <div className="grid-2">
          <Metric label="Esta semana" value={String(stats.last7)} />
          <Metric label="Por semana" value={format.number(stats.perWeek, 1)} />
          <Metric
            label="Total"
            value={String(stats.totalSessions)}
            suffix={stats.totalSessions === 1 ? 'sessão' : 'sessões'}
          />
          <Metric
            label="Último"
            value={
              stats.daysSinceLast == null
                ? '—'
                : stats.daysSinceLast === 0
                  ? 'Hoje'
                  : `há ${stats.daysSinceLast}d`
            }
          />
        </div>
        <div className="freq-bars" style={{ marginTop: 'var(--s-5)' }} aria-hidden="true">
          {weeks.map((week) => (
            <span key={week.start} className="freq-bar" title={longDate(week.start)}>
              <i style={{ height: `${Math.round((week.sessions / peak) * 100)}%` }} />
            </span>
          ))}
        </div>
        <p className="t-sm muted-2" style={{ marginTop: 'var(--s-2)' }}>
          Últimas 8 semanas
        </p>
      </Card>
    </section>
  );
}
