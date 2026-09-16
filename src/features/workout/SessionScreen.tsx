/**
 * The live session runner.
 *
 * One decision at a time: the exercise you are on, the set you are on, and one
 * button. Everything else is either a glance (elapsed, progress) or one tap
 * away. It gets its own route without the tab bar, because mid-set is the worst
 * possible moment to accidentally navigate away.
 *
 * A voz diz o exercício e a série ao começar, o descanso quando acaba uma
 * série, e o que vem a seguir quando o descanso acaba — para o telemóvel poder
 * ficar no chão entre séries.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { hasSections, WORKOUT_SECTION_LABELS, WORKOUT_TYPE_LABELS } from '../../core/constants';
import type { Workout, WorkoutSession } from '../../core/types';
import * as training from '../../domain/training';
import {
  WORKOUT_DONE_CUE, afterRestCue, restCue, setCue, type SetInfo,
} from '../../domain/guidance';
import {
  activeSession, completeNextSet, discardSession, logSet,
} from '../../services/training';
import { useApp, useFeedback, useStoreVersion } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import type { Repositories } from '../../data/repositories';
import { Icon } from '../../ui/Icon';
import { ProgressBar } from '../../ui/data';
import { Button } from '../../ui/primitives';
import { SessionSummarySheet } from './SessionSummarySheet';
import { RestTimer } from './RestTimer';
import { clock, useTicker } from './useTicker';
import { useVoice } from '../guidance/useVoice';
import { useWakeLock } from '../guidance/useWakeLock';

type NextSet = NonNullable<ReturnType<typeof training.nextSet>>;

/** O que a voz precisa de saber sobre uma série. */
function setInfo(
  repos: Repositories,
  session: WorkoutSession,
  workout: Workout | null,
  next: NextSet,
): SetInfo {
  return {
    exercise: repos.exercises.byId(next.block.exerciseId)?.name ?? 'Exercício',
    // So se diz a seccao quando ela muda alguma coisa: "aquecimento" ajuda,
    // repetir o nome da parte principal antes de cada serie e ruido.
    section: workout && hasSections(workout.type) && next.block.section !== 'main'
      ? WORKOUT_SECTION_LABELS[next.block.section]
      : null,
    setIndex: next.set.setIndex,
    setsTotal: training.setsFor(session, next.block).length,
    reps: next.set.reps ?? next.block.reps ?? null,
    durationSec: next.set.durationSec ?? next.block.durationSec ?? null,
    loadKg: next.set.loadKg ?? next.block.loadKg ?? null,
  };
}

export function SessionScreen(): ReactElement {
  const { repos, platform } = useApp();
  const feedback = useFeedback();
  const { confirm } = useUi();
  const navigate = useNavigate();
  const version = useStoreVersion();
  const voice = useVoice();

  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  // Uma chave nova por descanso: dois descansos de 60 s seguidos são dois
  // descansos, e o segundo tem de recomeçar do início.
  const [restKey, setRestKey] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const session = useMemo(() => activeSession(repos), [repos, version]);
  const workout = useMemo(
    () => (session?.workoutId ? repos.workouts.byId(session.workoutId) : null),
    [repos, session, version],
  );

  const now = useTicker(!!session && !finishing);
  useWakeLock(!!session && !finishing);

  const progress = useMemo(
    () => (session ? training.sessionProgress(session, workout) : null),
    [session, workout, version],
  );
  const current = useMemo(
    () => (session ? training.nextSet(session, workout) : null),
    [session, workout, version],
  );

  // A primeira frase, só num treino acabado de começar. Voltar a um treino a
  // meio não o anuncia de novo.
  const announced = useRef(false);
  useEffect(() => {
    if (announced.current || !session || !current) return;
    announced.current = true;
    if ((progress?.setsCompleted ?? 0) === 0) {
      voice.say(setCue(setInfo(repos, session, workout, current)));
    }
  }, [repos, session, workout, current, progress, voice]);

  const complete = useCallback(() => {
    if (!session || !current) return;
    completeNextSet(repos, session.id);

    // Rest only makes sense when there is something left to rest before.
    const updated = repos.workoutSessions.byId(session.id) ?? session;
    const after = training.nextSet(updated, workout);
    const rest = current.block.restSec ?? 0;
    setRestSeconds(after && rest > 0 ? rest : null);
    setRestKey((key) => key + 1);

    // Only the set that ends the workout makes a sound; the rest are felt.
    if (after) feedback.touch('medium');
    else feedback.play('workout');

    if (!after) voice.say(WORKOUT_DONE_CUE, true);
    else if (rest > 0) voice.say(restCue(rest), true);
    else voice.say(setCue(setInfo(repos, updated, workout, after)), true);
  }, [repos, session, current, workout, feedback, voice]);

  const restDone = useCallback(() => {
    setRestSeconds(null);
    const latest = repos.workoutSessions.byId(session?.id ?? '');
    if (!latest) return;
    const next = training.nextSet(latest, workout);
    if (next) voice.say(afterRestCue(setInfo(repos, latest, workout, next)), true);
  }, [repos, session?.id, workout, voice]);

  const leave = useCallback(async () => {
    if (!session) { navigate('/treino', { replace: true }); return; }
    const ok = await confirm({
      title: 'Sair do treino?',
      body: 'As séries que já registaste são apagadas e o treino volta a ficar por fazer.',
      confirmLabel: 'Sair',
      danger: true,
    });
    if (!ok) return;
    platform.voice.cancel();
    discardSession(repos, session.id);
    navigate('/treino', { replace: true });
  }, [confirm, navigate, repos, platform, session]);

  if (!session) {
    return (
      <div className="screen session-screen">
        <div className="day-empty">
          <p className="t-h2">Nenhum treino a decorrer</p>
          <Button variant="outline" label="Voltar" onClick={() => navigate('/treino')} />
        </div>
      </div>
    );
  }

  const elapsed = training.elapsedSeconds(session, now);
  const finished = current === null;

  return (
    <div className="screen session-screen" data-state="entering">
      <header className="session-top">
        <button type="button" className="btn-icon" aria-label="Sair" onClick={() => void leave()}>
          <Icon name="close" />
        </button>
        <div className="session-title">
          <span className="t-eyebrow">{workout ? WORKOUT_TYPE_LABELS[workout.type] : 'Treino'}</span>
          <span className="t-h2">{workout?.title ?? 'Treino'}</span>
        </div>
        <span className="session-clock t-num">{clock(elapsed)}</span>
        {voice.supported ? (
          <button
            type="button"
            className="btn-icon"
            aria-label={voice.on ? 'Desligar a voz' : 'Ligar a voz'}
            aria-pressed={voice.on}
            onClick={voice.toggle}
          >
            <Icon name={voice.on ? 'volume' : 'volumeOff'} />
          </button>
        ) : null}
      </header>

      <div className="session-progress">
        <ProgressBar ratio={progress?.ratio ?? 0} />
        <span className="t-sm muted-2">
          {progress?.setsCompleted ?? 0} de {progress?.setsTotal ?? 0} séries ·{' '}
          {progress?.blocksCompleted ?? 0}/{progress?.blocksTotal ?? 0} exercícios
        </span>
      </div>

      {restSeconds != null ? (
        <RestTimer key={restKey} seconds={restSeconds} onDone={restDone} />
      ) : null}

      {finished ? (
        <div className="session-done">
          <span className="glyph" aria-hidden="true"><Icon name="check" /></span>
          <p className="t-title">Treino completo</p>
          <p className="t-sm muted">{clock(elapsed)} · {progress?.setsCompleted} séries</p>
        </div>
      ) : (
        <CurrentSet
          session={session}
          current={current}
          onEdit={(patch) =>
            logSet(repos, session.id, current.block.id, current.set.setIndex, patch)}
          exerciseName={
            repos.exercises.byId(current.block.exerciseId)?.name ?? 'Exercício'
          }
          sectionLabel={
            workout && hasSections(workout.type)
              ? WORKOUT_SECTION_LABELS[current.block.section]
              : null
          }
        />
      )}

      <div className="session-actions">
        {finished ? (
          <Button variant="accent" block label="Terminar treino" onClick={() => setFinishing(true)} />
        ) : (
          <>
            <Button variant="primary" block label="Concluir série" onClick={complete} />
            <Button variant="ghost" block label="Terminar agora" onClick={() => setFinishing(true)} />
          </>
        )}
      </div>

      <BlockList session={session} workout={workout} currentBlockId={current?.block.id ?? null} />

      {finishing ? (
        <SessionSummarySheet
          session={session}
          workout={workout}
          elapsedSec={elapsed}
          onClose={() => setFinishing(false)}
          onDone={() => {
            platform.voice.cancel();
            navigate('/treino', { replace: true });
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The one thing that matters right now.
 *
 * Reps and load are editable in place: what you planned and what you actually
 * lifted diverge constantly, and making the user leave the set to say so is how
 * logs stop being true.
 */
function CurrentSet({
  session, current, exerciseName, sectionLabel, onEdit,
}: {
  session: WorkoutSession;
  current: NextSet;
  exerciseName: string;
  sectionLabel: string | null;
  onEdit: (patch: Partial<import('../../core/types').SetLog>) => void;
}): ReactElement {
  const sets = training.setsFor(session, current.block);

  return (
    <div className="session-current">
      <p className="t-eyebrow">
        {sectionLabel ? `${sectionLabel} · ` : ''}
        Exercício {current.blockIndex + 1} · Série {current.set.setIndex + 1} de {sets.length}
      </p>
      <h1 className="session-exercise">{exerciseName}</h1>

      <div className="session-targets">
        {current.set.reps != null || current.block.durationSec == null ? (
          <Stepper
            label="Reps"
            value={current.set.reps ?? 0}
            step={1}
            onChange={(reps) => onEdit({ reps })}
          />
        ) : null}
        {current.block.durationSec != null ? (
          <div className="target">
            <span className="value t-num">{current.set.durationSec ?? current.block.durationSec}</span>
            <span className="unit">s</span>
          </div>
        ) : null}
        <Stepper
          label="Carga"
          unit="kg"
          value={current.set.loadKg ?? 0}
          step={2.5}
          onChange={(loadKg) => onEdit({ loadKg })}
        />
      </div>

      {current.block.note ? (
        <p className="t-sm muted session-note">{current.block.note}</p>
      ) : null}
    </div>
  );
}

function Stepper({
  label, value, step, unit, onChange,
}: {
  label: string;
  value: number;
  step: number;
  unit?: string;
  onChange: (value: number) => void;
}): ReactElement {
  const bump = (delta: number): void => {
    const next = Math.max(0, Math.round((value + delta) * 100) / 100);
    onChange(next);
  };
  return (
    <div className="target">
      <span className="cell-label">{label}</span>
      <div className="stepper">
        <button type="button" aria-label={`Menos ${label}`} onClick={() => bump(-step)}>
          <Icon name="minus" />
        </button>
        <span className="value t-num">
          {value}
          {unit ? <span className="unit">{unit}</span> : null}
        </span>
        <button type="button" aria-label={`Mais ${label}`} onClick={() => bump(step)}>
          <Icon name="plus" />
        </button>
      </div>
    </div>
  );
}

/** The rest of the plan, so the shape of the session is never a surprise. */
function BlockList({
  session, workout, currentBlockId,
}: {
  session: WorkoutSession;
  workout: Workout | null;
  currentBlockId: string | null;
}): ReactElement | null {
  const { repos } = useApp();
  if (!workout) return null;

  return (
    <ol className="session-blocks">
      {workout.blocks.map((block, index) => {
        const sets = training.setsFor(session, block);
        const done = sets.filter((set) => set.completed).length;
        const state = done === sets.length ? 'done' : block.id === currentBlockId ? 'current' : 'todo';
        return (
          <li key={block.id} className="session-block" data-state={state}>
            <span className="block-index">{index + 1}</span>
            <span className="grow">
              <span className="title">
                {repos.exercises.byId(block.exerciseId)?.name ?? 'Exercício'}
              </span>
              <span className="sub">
                {sets.length} x {block.reps ?? block.durationSec ?? '—'}
                {block.reps != null ? '' : 's'}
                {block.loadKg != null ? ` · ${block.loadKg} kg` : ''}
              </span>
            </span>
            <span className="trail t-num">{done}/{sets.length}</span>
          </li>
        );
      })}
    </ol>
  );
}
