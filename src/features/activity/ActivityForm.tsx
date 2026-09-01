/**
 * Manual entry.
 *
 * Everything the brief asks for, with the two derived numbers shown live rather
 * than asked for: someone who knows their distance and time should not also
 * have to do the division, and seeing pace appear as they type is the fastest
 * way to catch a typo.
 */

import { useState, type ReactElement } from 'react';
import { ACTIVITY_TYPE_OPTIONS, paceModeFor } from '../../core/constants';
import type { DayKey, UserPreferences } from '../../core/types';
import * as format from '../../core/utils/format';
import { distance as distanceUnits } from '../../core/utils/units';
import { paceSecPerKm, speedKmh } from '../../domain/activity';
import { emptyManualEntry, type ManualEntry } from '../../services/activity';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip } from '../../ui/primitives';
import { DateField } from '../../ui/DateField';
import { Field, Input } from '../../ui/form';

function toNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export function ActivityForm({
  date, existing, existingId, preferences, onSave, onDelete, onClose,
}: {
  date: DayKey;
  existing?: ManualEntry;
  existingId?: string;
  preferences: UserPreferences;
  onSave: (entry: ManualEntry) => void;
  onDelete?: () => void;
  onClose: () => void;
}): ReactElement {
  const [entry, setEntry] = useState<ManualEntry>(() => existing ?? emptyManualEntry(date));
  const [error, setError] = useState<string | null>(null);

  const patch = (changes: Partial<ManualEntry>): void => {
    setEntry((current) => ({ ...current, ...changes }));
    setError(null);
  };

  const unit = preferences.distanceUnit;
  const mode = paceModeFor(entry.type);
  const pace = paceSecPerKm(entry.distanceM, entry.durationSec);
  const speed = speedKmh(entry.distanceM, entry.durationSec);

  const save = (): void => {
    if (!entry.durationSec && !entry.distanceM) {
      setError('Indica pelo menos a duração ou a distância.');
      return;
    }
    onSave(entry);
  };

  return (
    <Sheet
      title={existingId ? 'Editar atividade' : 'Registar atividade'}
      subtitle={derivedLabel(mode, pace, speed, unit)}
      onClose={onClose}
      footer={
        <>
          {onDelete ? (
            <Button variant="outline" label="Apagar" onClick={onDelete} />
          ) : (
            <Button variant="outline" label="Cancelar" onClick={onClose} />
          )}
          <Button variant="primary" label="Guardar" onClick={save} />
        </>
      }
    >
      <div className="stack stack-5">
        <Field label="Atividade">
          <div className="chips">
            {ACTIVITY_TYPE_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                pressed={entry.type === option.id}
                onClick={() => patch({ type: option.id })}
              />
            ))}
          </div>
        </Field>

        <Field label="Data">
          <DateField
            idPrefix="act-date"
            value={entry.date}
            onChange={(value) => { if (value) patch({ date: value }); }}
          />
        </Field>

        <div className="grid-2">
          <Field label="Duração" error={error ?? undefined}>
            <Input
              type="number"
              inputMode="numeric"
              unit="min"
              value={entry.durationSec == null ? '' : Math.round(entry.durationSec / 60)}
              min={0}
              step={1}
              invalid={!!error}
              onChange={(value) => {
                const minutes = toNumber(value);
                patch({ durationSec: minutes == null ? null : Math.round(minutes * 60) });
              }}
            />
          </Field>
          <Field label="Distância">
            <Input
              type="number"
              inputMode="decimal"
              unit={unit}
              value={
                entry.distanceM == null
                  ? ''
                  : distanceUnits.fromMeters(entry.distanceM, unit) ?? ''
              }
              min={0}
              step={0.01}
              onChange={(value) => {
                const typed = toNumber(value);
                patch({ distanceM: typed == null ? null : distanceUnits.toMeters(typed, unit) });
              }}
            />
          </Field>
        </div>

        {mode !== 'none' && (pace != null || speed != null) ? (
          <div className="grid-2">
            <div className="metric">
              <div className="value">
                {mode === 'pace' ? format.pace(pace, unit) : format.number(speed, 1)}
                {mode === 'speed' ? <span className="suffix">{unit}/h</span> : null}
              </div>
              <div className="label">{mode === 'pace' ? 'Ritmo médio' : 'Velocidade média'}</div>
            </div>
            <div className="metric">
              <div className="value">
                {mode === 'pace' ? format.number(speed, 1) : format.pace(pace, unit)}
                {mode === 'pace' ? <span className="suffix">{unit}/h</span> : null}
              </div>
              <div className="label">{mode === 'pace' ? 'Velocidade' : 'Ritmo'}</div>
            </div>
          </div>
        ) : null}

        <div className="grid-2">
          <Field label="Freq. cardíaca" hint="Se souberes">
            <Input
              type="number"
              inputMode="numeric"
              unit="bpm"
              value={entry.avgHeartRate ?? ''}
              min={30}
              max={230}
              onChange={(value) => patch({ avgHeartRate: toNumber(value) })}
            />
          </Field>
          <Field label="Calorias" hint="Se o aparelho der">
            <Input
              type="number"
              inputMode="numeric"
              unit="kcal"
              value={entry.calories ?? ''}
              min={0}
              onChange={(value) => patch({ calories: toNumber(value) })}
            />
          </Field>
        </div>

        <Field label="Elevação">
          <Input
            type="number"
            inputMode="numeric"
            unit="m"
            value={entry.elevationGainM ?? ''}
            min={0}
            onChange={(value) => patch({ elevationGainM: toNumber(value) })}
          />
        </Field>

        <Field label="Notas">
          <Input
            value={entry.notes ?? ''}
            placeholder="Como correu?"
            maxLength={200}
            onChange={(value) => patch({ notes: value || null })}
          />
        </Field>
      </div>
    </Sheet>
  );
}

function derivedLabel(
  mode: ReturnType<typeof paceModeFor>,
  pace: number | null,
  speed: number | null,
  unit: UserPreferences['distanceUnit'],
): string {
  if (mode === 'pace' && pace != null) return format.pace(pace, unit);
  if (mode === 'speed' && speed != null) return `${format.number(speed, 1)} ${unit}/h`;
  return 'Registo manual';
}
