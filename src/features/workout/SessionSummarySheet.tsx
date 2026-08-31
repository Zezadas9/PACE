/** What the session was, asked once, at the end. */

import { useState, type ReactElement } from 'react';
import { RPE_SCALE, SESSION_DIFFICULTY_OPTIONS } from '../../core/constants';
import type { SessionDifficulty, Workout, WorkoutSession } from '../../core/types';
import * as format from '../../core/utils/format';
import * as training from '../../domain/training';
import { finishSession } from '../../services/training';
import { useApp, useFeedback } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip } from '../../ui/primitives';
import { Metric } from '../../ui/data';
import { Field, Input } from '../../ui/form';

export function SessionSummarySheet({
  session, workout, elapsedSec, onClose, onDone,
}: {
  session: WorkoutSession;
  workout: Workout | null;
  elapsedSec: number;
  onClose: () => void;
  onDone: () => void;
}): ReactElement {
  const { repos } = useApp();
  const feedback = useFeedback();
  const { toast } = useUi();

  const [notes, setNotes] = useState(session.notes ?? '');
  const [rpe, setRpe] = useState<number | null>(session.perceivedEffort);
  const [difficulty, setDifficulty] = useState<SessionDifficulty | null>(session.difficulty);

  const progress = training.sessionProgress(session, workout);
  const volume = training.sessionVolumeKg(session, workout);
  const showVolume = training.volumeApplies(workout) && volume > 0;

  const save = (): void => {
    finishSession(repos, session.id, {
      notes: notes.trim() || null,
      perceivedEffort: rpe,
      difficulty,
    });
    feedback.play('success');
    toast('Treino registado.');
    onDone();
  };

  return (
    <Sheet
      title="Treino terminado"
      subtitle={workout?.title ?? 'Treino'}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" label="Continuar" onClick={onClose} />
          <Button variant="primary" label="Guardar" onClick={save} />
        </>
      }
    >
      <div className="stack stack-5">
        <div className="grid-2">
          <Metric label="Duração" value={format.duration(elapsedSec)} />
          <Metric
            label="Exercícios"
            value={`${progress.blocksCompleted}/${progress.blocksTotal}`}
          />
          <Metric label="Séries" value={`${progress.setsCompleted}/${progress.setsTotal}`} />
          {showVolume ? (
            <Metric label="Volume" value={format.number(volume, 0)} suffix="kg" />
          ) : (
            <Metric label="Repetições" value={String(training.sessionReps(session, workout))} />
          )}
        </div>

        <Field label="Esforço percebido" hint={rpeLabel(rpe)}>
          <div className="rpe-scale">
            {RPE_SCALE.map((step) => (
              <button
                key={step.value}
                type="button"
                aria-pressed={rpe === step.value}
                aria-label={`RPE ${step.value}`}
                onClick={() => setRpe(rpe === step.value ? null : step.value)}
              >
                {step.value}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Dificuldade">
          <div className="chips">
            {SESSION_DIFFICULTY_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                pressed={difficulty === option.id}
                onClick={() => setDifficulty(difficulty === option.id ? null : option.id)}
              />
            ))}
          </div>
        </Field>

        <Field label="Notas">
          <Input
            value={notes}
            placeholder="Como correu?"
            maxLength={200}
            onChange={setNotes}
          />
        </Field>
      </div>
    </Sheet>
  );
}

function rpeLabel(value: number | null): string | undefined {
  if (value == null) return undefined;
  const step = RPE_SCALE.find((candidate) => candidate.value === value);
  return step?.label || `Nível ${value}`;
}
