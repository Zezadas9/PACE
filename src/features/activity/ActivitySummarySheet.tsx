/**
 * The end of an activity: what happened, where, and anything the watch knew
 * that the phone did not.
 */

import { useState, type ReactElement } from 'react';
import { ACTIVITY_LABELS } from '../../core/constants';
import type { ActivitySession } from '../../core/types';
import * as format from '../../core/utils/format';
import * as activity from '../../domain/activity';
import type { FinishInput } from '../../services/activity';
import { usePreferences } from '../../app/providers/appContext';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/primitives';
import { Metric } from '../../ui/data';
import { Field, Input } from '../../ui/form';
import { RouteMap } from './RouteMap';

function toNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export function ActivitySummarySheet({
  session, onClose, onDone,
}: {
  session: ActivitySession;
  onClose: () => void;
  onDone: (input: FinishInput) => void;
}): ReactElement {
  const preferences = usePreferences();
  const [notes, setNotes] = useState(session.notes ?? '');
  const [calories, setCalories] = useState<number | null>(session.calories);
  const [heartRate, setHeartRate] = useState<number | null>(session.avgHeartRate);

  const metrics = activity.metricsOf(session);
  const unit = preferences.distanceUnit;
  const showPace = metrics.paceMode === 'pace';

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
            onClick={() => onDone({ notes: notes.trim() || null, calories, avgHeartRate: heartRate })}
          />
        </>
      }
    >
      <div className="stack stack-5">
        {session.track.length > 1 ? (
          <RouteMap track={session.track} />
        ) : (
          <p className="t-sm muted-2">
            Sem percurso registado — a localização não esteve disponível.
          </p>
        )}

        <div className="grid-2">
          <Metric label="Tempo" value={format.duration(metrics.durationSec)} />
          <Metric label="Distância" value={format.distance(metrics.distanceM, unit)} />
          <Metric
            label={showPace ? 'Ritmo médio' : 'Velocidade média'}
            value={
              showPace
                ? format.pace(metrics.paceSecPerKm, unit)
                : `${format.number(metrics.speedKmh, 1)} ${unit}/h`
            }
          />
          <Metric
            label="Subida"
            value={metrics.elevationGainM == null ? '—' : format.number(metrics.elevationGainM, 0)}
            suffix={metrics.elevationGainM == null ? undefined : 'm'}
          />
        </div>

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
