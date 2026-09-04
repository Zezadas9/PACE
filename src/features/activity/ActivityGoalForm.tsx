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
  const when = PERIOD_WORDS[goal.period] ?? 'esta semana';

  if (goal.metric === 'distance') {
    const value = distanceUnits.fromMeters(goal.target, unit) ?? 0;
    return `${what}: ${value} ${unit} ${when}`;
  }
  if (goal.metric === 'duration') {
    return `${what}: ${Math.round(goal.target / 60)} min ${when}`;
  }
  // Ritmo e velocidade são médias do período, não somas: lê-se "manter", não
  // "acumular", e a frase tem de dizer isso.
  if (goal.metric === 'pace') {
    const minutes = Math.floor(goal.target / 60);
    const seconds = String(Math.round(goal.target % 60)).padStart(2, '0');
    return `${what}: manter ${minutes}:${seconds} por ${unit} ${when}`;
  }
  if (goal.metric === 'speed') {
    return `${what}: manter ${(goal.target / 10).toFixed(1)} ${unit}/h ${when}`;
  }
  const times = goal.target === 1 ? 'vez' : 'vezes';
  return `${what}: ${goal.target} ${times} ${when}`;
}

const PERIOD_WORDS: Record<string, string> = {
  day: 'por dia',
  week: 'esta semana',
  month: 'este mês',
  total: 'no total',
};

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

        <Field
          label="Meta"
          hint={
            goal.metric === 'pace'
              ? 'Em minutos por ' + unit + '. Cumpre-se ficando abaixo deste ritmo.'
              : goal.metric === 'speed'
                ? 'Velocidade média a manter no período.'
                : undefined
          }
        >
          <Input
            type="number"
            inputMode="decimal"
            unit={targetUnit(goal.metric, unit)}
            value={displayTarget(goal, unit)}
            min={goal.metric === 'pace' ? 0 : 1}
            step={goal.metric === 'sessions' ? 1 : 0.5}
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
  if (metric === 'pace') return 330; // 5:30 por km
  if (metric === 'speed') return 200; // 20,0 km/h, em décimas
  return 3;
}

function targetUnit(metric: ActivityGoal['metric'], unit: 'km' | 'mi'): string {
  if (metric === 'distance') return unit;
  if (metric === 'duration') return 'min';
  if (metric === 'pace') return `min/${unit}`;
  if (metric === 'speed') return `${unit}/h`;
  return 'vezes';
}

/** Targets are stored canonically (metres, seconds) and shown in user units. */
function displayTarget(goal: ActivityGoal, unit: 'km' | 'mi'): number {
  if (goal.metric === 'distance') return distanceUnits.fromMeters(goal.target, unit) ?? 0;
  if (goal.metric === 'duration') return Math.round(goal.target / 60);
  if (goal.metric === 'pace') return Math.round((goal.target / 60) * 100) / 100;
  if (goal.metric === 'speed') return goal.target / 10;
  return goal.target;
}

function storeTarget(
  metric: ActivityGoal['metric'],
  value: number,
  unit: 'km' | 'mi',
): number {
  if (metric === 'distance') return distanceUnits.toMeters(value, unit) ?? 0;
  if (metric === 'duration') return Math.round(value * 60);
  if (metric === 'pace') return Math.max(60, Math.round(value * 60));
  if (metric === 'speed') return Math.max(1, Math.round(value * 10));
  return Math.max(1, Math.round(value));
}
