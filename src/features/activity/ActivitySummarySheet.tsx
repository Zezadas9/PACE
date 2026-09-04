/**
 * O fim de uma atividade: o que aconteceu, por onde, e como correu.
 *
 * A pergunta do esforço é a mais valiosa das três — é a única que o telemóvel
 * não consegue medir sozinho e a que faz um plano adaptar-se. Fica por isso
 * logo a seguir aos números, e nenhuma delas é obrigatória.
 */

import { useState, type ReactElement } from 'react';
import { ACTIVITY_LABELS } from '../../core/constants';
import type { ActivitySession, SessionDifficulty } from '../../core/types';
import * as format from '../../core/utils/format';
import * as activity from '../../domain/activity';
import { distance as distanceUnits } from '../../core/utils/units';
import type { FinishInput } from '../../services/activity';
import { usePreferences } from '../../app/providers/appContext';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip } from '../../ui/primitives';
import { Metric } from '../../ui/data';
import { Field, Input } from '../../ui/form';
import { RouteMap } from './RouteMap';

function toNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** Borg CR10 em palavras, porque "7" não diz nada a quem nunca o usou. */
const EFFORT_SCALE: ReadonlyArray<{ value: number; word: string }> = [
  { value: 1, word: 'muito leve' },
  { value: 2, word: 'muito leve' },
  { value: 3, word: 'leve' },
  { value: 4, word: 'moderado' },
  { value: 5, word: 'moderado' },
  { value: 6, word: 'algo difícil' },
  { value: 7, word: 'difícil' },
  { value: 8, word: 'difícil' },
  { value: 9, word: 'muito difícil' },
  { value: 10, word: 'máximo' },
];

const DIFFICULTY: ReadonlyArray<{ id: SessionDifficulty; label: string }> = [
  { id: 'easy', label: 'Fácil' },
  { id: 'right', label: 'Na medida' },
  { id: 'hard', label: 'Custou' },
];

export function ActivitySummarySheet({
  session, onClose, onDone,
}: {
  session: ActivitySession;
  onClose: () => void;
  onDone: (input: FinishInput) => void;
}): ReactElement {
  const preferences = usePreferences();
  const [notes, setNotes] = useState(session.notes ?? '');
  const [calories, setCalories] = useState<number | null>(
    session.caloriesSource === 'manual' ? session.calories : null,
  );
  const [heartRate, setHeartRate] = useState<number | null>(session.avgHeartRate);
  const [effort, setEffort] = useState<number | null>(session.perceivedEffort);
  const [difficulty, setDifficulty] = useState<SessionDifficulty | null>(session.difficulty);
  const [discomfort, setDiscomfort] = useState(session.discomfort ?? '');
  // Sem percurso não há distância medida. Em vez de a dar por perdida,
  // pergunta-se — é o único momento em que a pessoa ainda se lembra.
  const [distanceM, setDistanceM] = useState<number | null>(null);

  const metrics = activity.metricsOf(session);
  const unit = preferences.distanceUnit;
  const showPace = metrics.paceMode === 'pace';
  const effortWord = EFFORT_SCALE.find((step) => step.value === effort)?.word ?? null;

  return (
    <Sheet
      title="Atividade terminada"
      subtitle={ACTIVITY_LABELS[session.type]}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" label="Continuar" onClick={onClose} />
          <Button
            variant="primary"
            label="Guardar"
            onClick={() => onDone({
              notes: notes.trim() || null,
              calories,
              avgHeartRate: heartRate,
              perceivedEffort: effort,
              difficulty,
              discomfort: discomfort.trim() || null,
              distanceM,
            })}
          />
        </>
      }
    >
      <div className="stack stack-5">
        {session.track.length > 1 ? (
          <RouteMap track={session.track} />
        ) : (
          <>
            <p className="t-sm muted-2">
              Sem percurso registado — a localização não esteve disponível.
            </p>
            <Field label="Distância" hint="Escreve-a, se souberes. Fica marcada como manual.">
              <Input
                type="number"
                inputMode="decimal"
                unit={unit}
                value={distanceM == null ? '' : distanceUnits.fromMeters(distanceM, unit) ?? ''}
                min={0}
                step={0.01}
                onChange={(value) => {
                  const typed = toNumber(value);
                  setDistanceM(typed == null ? null : distanceUnits.toMeters(typed, unit));
                }}
              />
            </Field>
          </>
        )}

        <div className="grid-2">
          <Metric label="Tempo" value={format.duration(metrics.durationSec)} />
          <Metric
            label="Distância"
            value={metrics.distanceM ? format.distance(metrics.distanceM, unit) : '—'}
          />
          <Metric
            label={showPace ? 'Ritmo médio' : 'Velocidade média'}
            value={
              metrics.distanceM
                ? showPace
                  ? format.pace(metrics.paceSecPerKm, unit)
                  : `${format.number(metrics.speedKmh, 1)} ${unit}/h`
                : '—'
            }
          />
          <Metric
            label="Subida"
            value={metrics.elevationGainM == null ? '—' : format.number(metrics.elevationGainM, 0)}
            suffix={metrics.elevationGainM == null ? undefined : 'm'}
          />
        </div>

        <Field
          label="Esforço percebido"
          hint={effortWord ? `${effort}/10 — ${effortWord}` : 'Opcional, de 1 a 10.'}
        >
          <div className="effort-scale">
            {EFFORT_SCALE.map((step) => (
              <button
                key={step.value}
                type="button"
                className="effort-step"
                aria-pressed={effort === step.value}
                aria-label={`${step.value} de 10, ${step.word}`}
                onClick={() => setEffort(effort === step.value ? null : step.value)}
              >
                {step.value}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Como correu">
          <div className="chips">
            {DIFFICULTY.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                pressed={difficulty === option.id}
                onClick={() => setDifficulty(difficulty === option.id ? null : option.id)}
              />
            ))}
          </div>
        </Field>

        <div className="grid-2">
          <Field label="Freq. cardíaca" hint="Se souberes">
            <Input
              type="number"
              inputMode="numeric"
              unit="bpm"
              value={heartRate ?? ''}
              min={30}
              max={230}
              onChange={(value) => setHeartRate(toNumber(value))}
            />
          </Field>
          <Field label="Calorias" hint="Se o aparelho der">
            <Input
              type="number"
              inputMode="numeric"
              unit="kcal"
              value={calories ?? ''}
              min={0}
              onChange={(value) => setCalories(toNumber(value))}
            />
          </Field>
        </div>
        <p className="t-sm muted-2">
          Se deixares as calorias vazias, a PACE estima-as a partir do teu peso e
          da duração, e assinala-as sempre como estimativa.
        </p>

        <Field label="Notas">
          <Input
            value={notes}
            placeholder="Como correu?"
            maxLength={200}
            onChange={setNotes}
          />
        </Field>

        <Field label="Desconforto" hint="Só se houve. Não substitui uma avaliação clínica.">
          <Input
            value={discomfort}
            placeholder="Ex.: joelho direito no fim"
            maxLength={120}
            onChange={setDiscomfort}
          />
        </Field>
      </div>
    </Sheet>
  );
}
