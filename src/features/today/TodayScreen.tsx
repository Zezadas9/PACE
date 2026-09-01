/**
 * Today — the dashboard.
 *
 * Everything it shows comes from `todayModel`; the screen only decides how it
 * looks. Completion is one tap on a row, everywhere.
 */

import { useMemo, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { EVENT_CATEGORY_LABELS } from '../../core/constants';
import { fromMinutes } from '../../core/scheduling';
import * as format from '../../core/utils/format';
import { mediumDate } from '../../core/utils/date';
import {
  advanceHabit, setHabitDone, toggleTask, todayModel, type TodayModel,
} from '../../services/dashboard';
import { useApp, useFeedback, usePreferences, useStoreVersion } from '../../app/providers/appContext';
import { Screen } from '../../app/navigation/Screen';
import { WeekStrip } from '../../ui/calendar';
import { Avatar, Card, Chip, Divider, SectionHeader } from '../../ui/primitives';
import { EmptyState, Metric, ProgressBar, Ring, Row, Rows } from '../../ui/data';
import { Icon } from '../../ui/Icon';
import { PerfectDayBanner } from './PerfectDayBanner';
import { StreakCard } from './StreakCard';

export function TodayScreen(): ReactElement {
  const { repos } = useApp();
  const feedback = useFeedback();
  const preferences = usePreferences();
  const version = useStoreVersion();

  const model = useMemo(
    () => todayModel(repos, preferences),
    [repos, preferences, version],
  );

  /**
    * Sound only on the tap that finishes something. Incrementing a counted
    * habit and undoing one are both felt, not heard.
    */
  const tap = (action: () => boolean): void => {
    if (action()) feedback.play('complete');
    else feedback.touch();
  };

  return (
    <Screen>
      <Hero model={model} />
      {model.summary.isPerfectDay ? <PerfectDayBanner streak={model.streak.current} /> : null}
      <SummaryCard model={model} />
      <section>
        <SectionHeader title="Sequência" />
        <StreakCard stats={model.streak} />
      </section>
      <HabitsSection
        model={model}
        onTap={(habitId) => tap(() => {
          const item = model.habits.find((entry) => entry.habit.id === habitId);
          if (!item || item.done) { advanceHabit(repos, habitId, model.date); return false; }
          advanceHabit(repos, habitId, model.date);
          // Only the repetition that reaches the target counts as finishing.
          return item.value + 1 >= Math.max(1, item.habit.target);
        })}
        onFill={(habitId) => tap(() => {
          setHabitDone(repos, habitId, model.date, true);
          return true;
        })}
      />
      <TasksSection
        model={model}
        onTap={(taskId) => tap(() => {
          const before = model.tasks.find((task) => task.id === taskId)?.status === 'done';
          toggleTask(repos, taskId);
          return !before;
        })}
      />
      <WorkoutSection model={model} />
      <MovementSection model={model} />
      <UpcomingSection model={model} />
      <RecapSection model={model} />
    </Screen>
  );
}

function Hero({ model }: { model: TodayModel }): ReactElement {
  const name = format.firstName(model.user?.name);
  return (
    <header className="today-hero">
      <div>
        <p className="t-eyebrow">{model.longDate}</p>
        <h1 className="t-title" style={{ marginTop: '0.35rem' }}>
          {model.greeting}
          {name ? `, ${name}` : ''}
        </h1>
      </div>
      <Avatar name={model.user?.name ?? ''} />
    </header>
  );
}

function headline(model: TodayModel): string {
  const { summary } = model;
  if (summary.isPerfectDay) return 'Dia perfeito.';
  if (summary.essentialTotal > 0) {
    const left = summary.essentialTotal - summary.essentialCompleted;
    return left === 1 ? 'Falta 1 essencial.' : `Faltam ${left} essenciais.`;
  }
  if (summary.score >= 0.6) return 'No teu ritmo.';
  if (summary.score > 0) return 'Já começaste.';
  return 'Um passo de cada vez.';
}

function SummaryCard({ model }: { model: TodayModel }): ReactElement {
  const s = model.summary;
  const done = s.habitsCompleted + s.tasksCompleted + (s.workoutCompleted ? 1 : 0);
  const total = s.habitsTotal + s.tasksTotal + (s.workoutPlanned ? 1 : 0);

  return (
    <Card>
      <div className="summary-card">
        <Ring
          size={92}
          stroke={8}
          progress={s.score}
          label={format.percent(s.score)}
          sublabel="hoje"
          ariaLabel={`Progresso de hoje: ${format.percent(s.score)}`}
        />
        <div className="copy">
          <p className="t-h2">{headline(model)}</p>
          <p className="t-sm muted">
            {total === 0
              ? 'Ainda não há nada planeado para hoje.'
              : `${done} de ${total} itens concluídos.`}
          </p>
          {s.essentialTotal > 0 ? (
            <div style={{ marginTop: '0.75rem' }}>
              <span className="streak-pill">
                <Icon name="star" />
                <span>
                  {s.essentialCompleted}/{s.essentialTotal} essenciais
                </span>
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <Divider />
      <div style={{ marginTop: '1rem' }}>
        <WeekStrip days={model.week} />
      </div>
    </Card>
  );
}

function HabitsSection({
  model, onTap, onFill,
}: {
  model: TodayModel;
  onTap: (habitId: string) => void;
  /** Fills a counted habit straight to its target. */
  onFill: (habitId: string) => void;
}): ReactElement {
  const done = model.habits.filter((item) => item.done).length;

  return (
    <section>
      <SectionHeader
        title="Hábitos"
        actionLabel={model.habits.length ? `${done}/${model.habits.length}` : undefined}
      />
      {model.habits.length === 0 ? (
        <EmptyState
          icon="repeat"
          title="Sem hábitos para hoje"
          body="Cria um na Agenda e ele aparece aqui todas as manhãs."
        />
      ) : (
        <Card variant="flush">
          <Rows>
            {model.habits.map((item) => (
              <div key={item.habit.id} className="row-item" data-done={String(item.done)}>
                <button
                  type="button"
                  className="tick"
                  aria-pressed={item.done}
                  aria-label={item.done ? `Desmarcar ${item.habit.title}` : `Registar ${item.habit.title}`}
                  onClick={() => onTap(item.habit.id)}
                >
                  <Icon name="check" />
                </button>
                <span className="grow">
                  <span className="title">
                    {item.habit.title}
                    {item.habit.essential ? (
                      <i className="essential-dot" aria-label="essencial" />
                    ) : null}
                  </span>
                  <span className="sub">
                    {item.habit.kind === 'check'
                      ? item.habit.timeOfDay ?? 'Hoje'
                      : `${item.value} / ${item.habit.target}${item.habit.unit ? ` ${item.habit.unit}` : ''}`}
                  </span>
                  {item.ratio > 0 && item.ratio < 1 ? (
                    <span className="row-meter" aria-hidden="true">
                      <i style={{ width: `${Math.round(item.ratio * 100)}%` }} />
                    </span>
                  ) : null}
                </span>
                {/* Eight taps to log eight glasses is a chore. One tap here
                    fills the whole target. */}
                {item.habit.target > 1 && !item.done ? (
                  <button
                    type="button"
                    className="fill-all"
                    onClick={() => onFill(item.habit.id)}
                    aria-label={`Concluir tudo: ${item.habit.title}`}
                  >
                    Tudo
                  </button>
                ) : null}
              </div>
            ))}
          </Rows>
        </Card>
      )}
    </section>
  );
}

function TasksSection({
  model, onTap,
}: {
  model: TodayModel;
  onTap: (taskId: string) => void;
}): ReactElement | null {
  if (model.tasks.length === 0) return null;
  const done = model.tasks.filter((task) => task.status === 'done').length;

  return (
    <section>
      <SectionHeader title="Tarefas" actionLabel={`${done}/${model.tasks.length}`} />
      <Card variant="flush">
        <Rows>
          {model.tasks.map((task) => (
            <Row
              key={task.id}
              tick
              done={task.status === 'done'}
              title={task.title}
              sub={task.time}
              trail={task.essential ? '★' : null}
              onClick={() => onTap(task.id)}
            />
          ))}
        </Rows>
      </Card>
    </section>
  );
}

/**
 * Training on the dashboard: today's session first, then what is next, then
 * what just happened. The detail lives on the Treino tab; this is the glance.
 */
function WorkoutSection({ model }: { model: TodayModel }): ReactElement {
  const navigate = useNavigate();
  const { next, recent, stats } = model.training;

  return (
    <section>
      <SectionHeader
        title="Treino"
        actionLabel="Ver tudo"
        onAction={() => navigate('/treino')}
      />
      <div className="stack stack-3">
        {model.workout ? (
          <Card onClick={() => navigate(model.workout!.completed ? '/treino' : '/treino/sessao')}>
            <div className="row row-between">
              <div className="grow">
                <p className="t-eyebrow">Hoje</p>
                <p className="t-h2" style={{ marginTop: '0.2rem' }}>{model.workout.title}</p>
                <p className="t-sm muted">
                  {[
                    model.workout.blockCount ? `${model.workout.blockCount} exercícios` : null,
                    model.workout.estimatedMin ? `${model.workout.estimatedMin} min` : null,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
              <span className="today-cta">
                {model.workout.completed
                  ? 'Feito'
                  : model.workout.running
                    ? 'Continuar'
                    : 'Começar'}
              </span>
            </div>
            {model.workout.running || model.workout.completed ? (
              <div style={{ marginTop: 'var(--s-3)' }}>
                <ProgressBar ratio={model.workout.progress} />
              </div>
            ) : null}
          </Card>
        ) : (
          <EmptyState
            icon="dumbbell"
            title="Sem treino planeado"
            body="Dia de descanso — ou ainda por planear."
          />
        )}

        {next || recent.length > 0 ? (
          <Card variant="flush">
            <Rows>
              {next ? (
                <Row
                  icon="calendar"
                  title={next.workout?.title ?? 'Treino'}
                  sub="Próximo treino"
                  trail={mediumDate(next.date)}
                  onClick={() => navigate('/treino')}
                />
              ) : null}
              {recent.map((row) => (
                <Row
                  key={row.session.id}
                  icon="clock"
                  title={row.title}
                  sub={mediumDate(row.session.date)}
                  trail={format.duration(row.durationSec)}
                />
              ))}
              {stats.totalSessions > 0 ? (
                <Row
                  icon="chart"
                  title="Frequência"
                  sub={`${stats.last7} esta semana · ${stats.perWeek}/semana`}
                  chevron
                  onClick={() => navigate('/treino')}
                />
              ) : null}
            </Rows>
          </Card>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Movement: today's activity and how the week's goals are going.
 *
 * The goals live on the Atividade tab but their progress belongs here — a goal
 * you have to go looking for is a goal you forget.
 */
function MovementSection({ model }: { model: TodayModel }): ReactElement | null {
  const navigate = useNavigate();
  const unit = model.preferences.distanceUnit;
  if (!model.activity && model.activityGoals.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title="Atividade"
        actionLabel="Ver tudo"
        onAction={() => navigate('/atividade')}
      />
      <div className="stack stack-3">
        {model.activity ? (
          <Card variant="quiet">
            <div className="grid-2">
              <Metric label="Duração" value={format.duration(model.activity.durationSec)} />
              <Metric
                label="Distância"
                value={format.distance(model.activity.distanceM, unit)}
              />
            </div>
          </Card>
        ) : null}

        {model.activityGoals.map((progress) => (
          <button
            key={progress.goal.id}
            type="button"
            className="goal-card"
            data-complete={String(progress.complete)}
            onClick={() => navigate('/atividade')}
          >
            <div className="row row-between">
              <span className="title">{progress.goal.title}</span>
              <span className="t-num">{Math.round(progress.ratio * 100)}%</span>
            </div>
            <ProgressBar ratio={progress.ratio} />
          </button>
        ))}
      </div>
    </section>
  );
}

function UpcomingSection({ model }: { model: TodayModel }): ReactElement | null {
  if (model.upcoming.length === 0) return null;

  return (
    <section>
      <SectionHeader title="Próximos eventos" />
      <Card variant="flush">
        <Rows>
          {model.upcoming.map(({ occurrence, dayOffset }) => (
            <Row
              key={`${occurrence.event.id}-${occurrence.date}`}
              icon="calendar"
              hue={occurrence.event.category}
              title={occurrence.event.title}
              sub={[
                dayOffset === 0 ? 'Hoje' : dayOffset === 1 ? 'Amanhã' : mediumDate(occurrence.date),
                EVENT_CATEGORY_LABELS[occurrence.event.category],
              ].join(' · ')}
              trail={
                occurrence.startMinutes != null
                  ? fromMinutes(occurrence.startMinutes)
                  : 'dia inteiro'
              }
            />
          ))}
        </Rows>
      </Card>
    </section>
  );
}

function RecapSection({ model }: { model: TodayModel }): ReactElement {
  const s = model.summary;
  return (
    <section>
      <SectionHeader title="Resumo do dia" />
      <Card variant="quiet">
        <div className="grid-2">
          <Metric label="Hábitos" value={`${s.habitsCompleted}/${s.habitsTotal}`} />
          <Metric label="Tarefas" value={`${s.tasksCompleted}/${s.tasksTotal}`} />
          <Metric
            label="Essenciais"
            value={`${s.essentialCompleted}/${s.essentialTotal}`}
          />
          <Metric label="Movimento" value={format.duration(s.activityDurationSec)} />
        </div>
        <div style={{ marginTop: '1rem' }}>
          <ProgressBar ratio={s.score} />
        </div>
        {model.goals.length > 0 ? (
          <div className="chips" style={{ marginTop: '1rem' }}>
            {model.goals.map((goal) => (
              <Chip key={goal.id} label={goal.label} pressed />
            ))}
          </div>
        ) : null}
      </Card>
    </section>
  );
}
