/**
 * A nutrition goal: calories, a macronutrient, water, meals, or something the
 * user names themselves.
 *
 * The app suggests no numbers. A target is a decision, and where that decision
 * belongs to someone's health it belongs to them and whoever advises them —
 * PACE records it and counts, and does not recommend.
 */

import { useState, type ReactElement } from 'react';
import { NUTRITION_GOAL_OPTIONS, NUTRITION_PERIOD_OPTIONS } from '../../core/constants';
import { createNutritionGoal } from '../../core/factories';
import type { NutritionGoal, NutritionGoalMetric } from '../../core/types';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip } from '../../ui/primitives';
import { Field, Input, Segmented } from '../../ui/form';

export function unitFor(goal: NutritionGoal): string {
  if (goal.metric === 'custom') return goal.unit ?? '';
  return NUTRITION_GOAL_OPTIONS.find((option) => option.id === goal.metric)?.unit ?? '';
}

/** "Proteína: 120 g por dia" — a title nobody has to think up. */
export function describeNutritionGoal(goal: NutritionGoal): string {
  const label = NUTRITION_GOAL_OPTIONS.find((option) => option.id === goal.metric)?.label
    ?? 'Objetivo';
  const unit = unitFor(goal);
  const when = goal.period === 'day' ? 'por dia' : 'por semana';
  return `${label}: ${goal.target}${unit ? ` ${unit}` : ''} ${when}`.replace(/\s+/g, ' ');
}

function defaultTarget(metric: NutritionGoalMetric): number {
  if (metric === 'water') return 2000;
  if (metric === 'meals') return 3;
  return 100;
}

export function NutritionGoalForm({
  existing, onSave, onDelete, onClose,
}: {
  existing?: NutritionGoal;
  onSave: (goal: NutritionGoal) => void;
  onDelete?: () => void;
  onClose: () => void;
}): ReactElement {
  const [goal, setGoal] = useState<NutritionGoal>(
    () => existing ?? createNutritionGoal({ metric: 'water', target: 2000 }),
  );

  const patch = (changes: Partial<NutritionGoal>): void => {
    setGoal((current) => ({ ...current, ...changes }));
  };

  return (
    <Sheet
      title={existing ? 'Editar objetivo' : 'Novo objetivo'}
      subtitle={describeNutritionGoal(goal)}
      onClose={onClose}
      footer={
        <>
          {onDelete
            ? <Button variant="outline" label="Apagar" onClick={onDelete} />
            : <Button variant="outline" label="Cancelar" onClick={onClose} />}
          <Button
            variant="primary"
            label="Guardar"
            onClick={() => onSave({
              ...goal,
              title: goal.title.trim() || describeNutritionGoal(goal),
            })}
          />
        </>
      }
    >
      <div className="stack stack-5">
        <Field label="Medir">
          <div className="chips">
            {NUTRITION_GOAL_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                pressed={goal.metric === option.id}
                onClick={() => patch({
                  metric: option.id,
                  target: defaultTarget(option.id),
                  unit: option.id === 'custom' ? goal.unit : null,
                })}
              />
            ))}
          </div>
        </Field>

        {goal.metric === 'custom' ? (
          <Field
            label="Unidade"
            hint="A PACE conta o que regista; um objetivo próprio é acompanhado por ti."
          >
            <Input
              value={goal.unit ?? ''}
              placeholder="Ex.: peças de fruta"
              maxLength={20}
              onChange={(unit) => patch({ unit: unit.trim() || null })}
            />
          </Field>
        ) : null}

        <Field label="Período">
          <Segmented
            ariaLabel="Período"
            value={goal.period}
            options={NUTRITION_PERIOD_OPTIONS}
            onChange={(period) => patch({ period })}
          />
        </Field>

        <Field label="Meta">
          <Input
            type="number"
            inputMode="numeric"
            unit={unitFor(goal) || undefined}
            min={1}
            value={goal.target}
            onChange={(value) => {
              const parsed = Number(value.replace(',', '.'));
              if (Number.isFinite(parsed)) patch({ target: Math.max(1, Math.round(parsed)) });
            }}
          />
        </Field>

        <Field label="Nome" hint="Deixa vazio para usar a descrição automática.">
          <Input
            value={goal.title}
            placeholder={describeNutritionGoal(goal)}
            maxLength={60}
            onChange={(title) => patch({ title })}
          />
        </Field>
      </div>
    </Sheet>
  );
}
