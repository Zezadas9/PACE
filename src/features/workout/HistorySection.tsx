/**
 * Past sessions and the progression of individual lifts.
 *
 * Two views of the same records: what you did (history) and how a movement has
 * moved (progress). The second is the one that answers "am I getting stronger",
 * so it is keyed on the exercise rather than the plan.
 */

import { useMemo, useState, type ReactElement } from 'react';
import type { Exercise } from '../../core/types';
import { mediumDate } from '../../core/utils/date';
import * as format from '../../core/utils/format';
import * as training from '../../domain/training';
import { useApp, usePreferences, useStoreVersion } from '../../app/providers/appContext';
import { Card, SectionHeader } from '../../ui/primitives';
import { EmptyState, Row, Rows } from '../../ui/data';
import { Segmented } from '../../ui/form';

export function HistorySection(): ReactElement {
  const { repos } = useApp();
  const preferences = usePreferences();
  const version = useStoreVersion();
  const [tab, setTab] = useState<'history' | 'progress'>('history');
  const [exerciseId, setExerciseId] = useState<string | null>(null);

  const { sessions, exercises } = useMemo(() => {
    const allSessions = repos.workoutSessions.all();
    const allWorkouts = repos.workouts.all();
    return {
      sessions: training.history(allSessions, allWorkouts, 20),
      exercises: training.trainedExercises(allSessions, allWorkouts, repos.exercises.all()),
    };
  }, [repos, version]);

  if (sessions.length === 0) {
    return (
      <section>
        <SectionHeader title="Histórico" />
        <EmptyState
          brand="estatisticas"
          title="Ainda sem sessões"
          body="Depois do primeiro treino, o histórico e a evolução das cargas aparecem aqui."
        />
      </section>
    );
  }

  const selected = exerciseId ?? exercises[0]?.exercise.id ?? null;

  return (
    <section>
      <SectionHeader title="Histórico" />
      <div className="stack stack-4">
        <Segmented
          ariaLabel="Vista do histórico"
          value={tab}
          options={[
            { id: 'history', label: 'Sessões' },
            { id: 'progress', label: 'Evolução' },
          ]}
          onChange={setTab}
        />

        {tab === 'history' ? (
          <Card variant="flush">
            <Rows>
              {sessions.map((row) => (
                <Row
                  key={row.session.id}
                  icon="dumbbell"
                  title={row.title}
                  sub={[
                    mediumDate(row.session.date),
                    format.duration(row.durationSec),
                    row.volumeKg > 0 && training.volumeApplies(row.workout)
                      ? `${format.number(row.volumeKg, 0)} kg`
                      : `${row.reps} reps`,
                  ].filter(Boolean).join(' · ')}
                  trail={row.session.perceivedEffort ? `RPE ${row.session.perceivedEffort}` : null}
                />
              ))}
            </Rows>
          </Card>
        ) : (
          <ExerciseProgress
            exercises={exercises.map((row) => row.exercise)}
            selectedId={selected}
            onSelect={setExerciseId}
            preferences={preferences}
          />
        )}
      </div>
    </section>
  );
}

function ExerciseProgress({
  exercises, selectedId, onSelect, preferences,
}: {
  exercises: Exercise[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  preferences: import('../../core/types').UserPreferences;
}): ReactElement {
  const { repos } = useApp();
  const version = useStoreVersion();

  const points = useMemo(
    () => (selectedId
      ? training.exerciseProgress(
          selectedId, repos.workoutSessions.all(), repos.workouts.all())
      : []),
    [repos, selectedId, version],
  );

  if (exercises.length === 0) {
    return (
      <EmptyState
        brand="progresso"
        title="Sem exercícios concluídos"
        body="A evolução aparece assim que terminares as séries de um exercício."
      />
    );
  }

  const loads = points.map((point) => point.topLoadKg ?? 0);
  const peak = Math.max(1, ...loads);
  const first = points[0];
  const last = points[points.length - 1];
  const delta =
    first?.topLoadKg != null && last?.topLoadKg != null ? last.topLoadKg - first.topLoadKg : null;

  return (
    <div className="stack stack-4">
      <div className="chips-scroll">
        {exercises.map((exercise) => (
          <button
            key={exercise.id}
            type="button"
            className="chip"
            aria-pressed={exercise.id === selectedId}
            onClick={() => onSelect(exercise.id)}
          >
            <span className="dot" />
            <span>{exercise.name}</span>
          </button>
        ))}
      </div>

      {points.length === 0 ? (
        <EmptyState icon="chart" title="Sem registos para este exercício" />
      ) : (
        <Card>
          <div className="row row-between">
            <div>
              <p className="t-eyebrow">Carga máxima</p>
              <p className="t-title" style={{ marginTop: '0.25rem' }}>
                {last?.topLoadKg != null
                  ? format.weight(last.topLoadKg, preferences.weightUnit)
                  : `${last?.totalReps ?? 0} reps`}
              </p>
            </div>
            {delta != null && delta !== 0 ? (
              <span className={delta > 0 ? 'delta up' : 'delta down'}>
                {delta > 0 ? '+' : ''}
                {format.number(delta, 1)} kg
              </span>
            ) : null}
          </div>

          {/* A sparkline, not a chart: the shape is the point, not the axis. */}
          <div className="spark" aria-hidden="true">
            {points.map((point) => (
              <span key={point.date} className="spark-bar">
                <i style={{ height: `${Math.round(((point.topLoadKg ?? 0) / peak) * 100)}%` }} />
              </span>
            ))}
          </div>

          <div className="rows" style={{ marginTop: 'var(--s-4)' }}>
            {points.slice(-5).reverse().map((point) => (
              <div key={point.date} className="row-item" style={{ paddingInline: 0 }}>
                <span className="grow">
                  <span className="title">{mediumDate(point.date)}</span>
                  <span className="sub">
                    {point.sets} séries · {point.totalReps} reps
                    {point.volumeKg > 0 ? ` · ${format.number(point.volumeKg, 0)} kg` : ''}
                  </span>
                </span>
                <span className="trail t-num">
                  {point.topLoadKg != null ? format.weight(point.topLoadKg, preferences.weightUnit) : '—'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
