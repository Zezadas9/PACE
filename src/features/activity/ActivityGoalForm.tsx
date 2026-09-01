/**
 * An activity goal: "correr 20 km esta semana", "caminhar 30 minutos por dia",
 * "bicicleta 3 vezes por semana".
 *
 * The title writes itself from the choices, because a goal the user has to name
 * is a goal most people abandon at the naming step. They can still override it.
 */

import { useState, type ReactElement } from 'react';
import {
  ACTIVITY_GOAL_METRIC_OPTIONS, ACTIVITY_GOAL_PERIOD_OPTIONS,
  ACTIVITY_TYPE_OPTIONS,
} from '../../core/constants';
import { createActivityGoal } from '../../core/factories';
import type { ActivityGoal, UserPreferences } from '../../core/types';
import { distance as distanceUnits } from '../../core/utils/units';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip } from '../../ui/primitives';
import { Field, Input, Segmented } from '../../ui/form';

function toNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** "Correr 20 km esta semana" — built from the parts the user picked. */
export function describeGoal(goal: ActivityGoal, unit: 'km' | 'mi'): string {
  const type = ACTIVITY_TYPE_OPTIONS.find((option) => option.id === goal.activityType);
  const what = type ? type.label : 'Atividade';
  const when = goal.period === 'day' ? 'por dia' : 'esta semana';

  if (goal.metric === 'distance') {
    const value = distanceUnits.fromMeters(goal.target, unit) ?? 0;
    return `${what}: ${value} ${unit} ${when}`;
  }
  if (goal.metric === 'duration') {
    return `${what}: ${Math.round(goal.target / 60)} min ${when}`;
  }
  const times = goal.target === 1 ? 'vez' : 'vezes';
  return `${what}: ${goal.target} ${times} ${when}`;
}

export function ActivityGoalForm({
  existing, preferences, onSave, onDelete, onClose,
}: {
  existing?: ActivityGoal;
  preferences: UserPreferences;
  onSave: (goal: ActivityGoal) => void;
  onDelete?: () => void;
  onClose: () => void;
}): ReactElement {
  const [goal, setGoal] = useState<ActivityGoal>(
    () => existing ?? createActivityGoal({ activityType: 'run' }),
  );
  const unit = preferences.distanceUnit;

  const patch = (changes: Partial<ActivityGoal>): void => {
    setGoal((current) => ({ ...current, ...changes }));
  };

  const save = (): void => {
    onSave({ ...goal, title: goal.title.trim() || describeGoal(goal, unit) });
  };

  return (
    <Sheet
      title={existing ? 'Editar objetivo' : 'Novo objetivo'}
      subtitle={describeGoal(goal, unit)}
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
            <Chip
              label="Qualquer"
              pressed={goal.activityType === null}
              onClick={() => patch({ activityType: null })}
            />
            {ACTIVITY_TYPE_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                pressed={goal.activityType === option.id}
                onClick={() => patch({ activityType: option.id })}
              />
            ))}
          </div>
        </Field>

        <Field label="Medir">
          <Segmented
            ariaLabel="O que medir"
            value={goal.metric}
            options={ACTIVITY_GOAL_METRIC_OPTIONS}
            onChange={(metric) => patch({ metric, target: defaultTarget(metric) })}
          />
        </Field>

        <Field label="Período">
          <Segmented
            ariaLabel="Período"
            value={goal.period}
            options={ACTIVITY_GOAL_PERIOD_OPTIONS}
            onChange={(period) => patch({ period })}
          />
        </Field>

        <Field label="Meta">
          <Input
            type="number"
            inputMode="decimal"
            unit={goal.metric === 'distance' ? unit : goal.metric === 'duration' ? 'min' : 'vezes'}
            value={displayTarget(goal, unit)}
            min={1}
            step={goal.metric === 'distance' ? 0.5 : 1}
            onChange={(value) => {
              const typed = toNumber(value);
              if (typed == null) return;
              patch({ target: storeTarget(goal.metric, typed, unit) });
            }}
          />
        </Field>

        <Field label="Nome" hint="Deixa vazio para usar a descrição automática.">
          <Input
            value={goal.title}
            placeholder={describeGoal(goal, unit)}
            maxLength={60}
            onChange={(title) => patch({ title })}
          />
        </Field>
      </div>
    </Sheet>
  );
}

function defaultTarget(metric: ActivityGoal['metric']): number {
  if (metric === 'distance') return 20000;
  if (metric === 'duration') return 1800;
  return 3;
}

/** Targets are stored canonically (metres, seconds) and shown in user units. */
function displayTarget(goal: ActivityGoal, unit: 'km' | 'mi'): number {
  if (goal.metric === 'distance') return distanceUnits.fromMeters(goal.target, unit) ?? 0;
  if (goal.metric === 'duration') return Math.round(goal.target / 60);
  return goal.target;
}

function storeTarget(
  metric: ActivityGoal['metric'],
  value: number,
  unit: 'km' | 'mi',
): number {
  if (metric === 'distance') return distanceUnits.toMeters(value, unit) ?? 0;
  if (metric === 'duration') return Math.round(value * 60);
  return Math.max(1, Math.round(value));
}
