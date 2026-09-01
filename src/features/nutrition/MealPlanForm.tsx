/**
 * One meal of the weekly plan.
 *
 * A plan entry is a meal without a date: the same foods and quantities, tied to
 * a weekday instead of a day. Several weekdays can be picked at once, because
 * "almoço igual de segunda a sexta" is the normal case and entering it five
 * times is not a plan, it is data entry.
 */

import type { ReactElement } from 'react';
import { MEAL_TYPE_OPTIONS } from '../../core/constants';
import type { Food, MealType } from '../../core/types';
import type { MealItemDraft } from '../../services/nutrition';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip } from '../../ui/primitives';
import { Field, Input } from '../../ui/form';
import { WeekdayPicker } from '../agenda/forms/WeekdayPicker';
import { ItemsEditor } from './MealForm';

export interface PlanEntryDraft {
  id: string | null;
  weekdays: number[];
  type: MealType;
  time: string | null;
  notes: string | null;
  items: MealItemDraft[];
}

export function MealPlanForm({
  draft, foods, onChange, onSave, onDelete, onEditFood, onClose,
}: {
  draft: PlanEntryDraft;
  foods: Food[];
  onChange: (draft: PlanEntryDraft) => void;
  onSave: (draft: PlanEntryDraft) => void;
  onDelete?: () => void;
  onEditFood: (name: string) => void;
  onClose: () => void;
}): ReactElement {
  const patch = (changes: Partial<PlanEntryDraft>): void => onChange({ ...draft, ...changes });
  const ready = draft.weekdays.length > 0
    && draft.items.some((item) => item.foodName.trim().length > 0);

  return (
    <Sheet
      title={draft.id ? 'Editar refeição do plano' : 'Nova refeição do plano'}
      subtitle="Fica no plano até a apagares. Marcas como feita no dia."
      onClose={onClose}
      footer={
        <>
          {onDelete
            ? <Button variant="outline" label="Apagar" onClick={onDelete} />
            : <Button variant="outline" label="Cancelar" onClick={onClose} />}
          <Button
            variant="primary"
            label="Guardar"
            disabled={!ready}
            onClick={() => onSave(draft)}
          />
        </>
      }
    >
      <div className="stack stack-5">
        <Field label="Refeição">
          <div className="chips">
            {MEAL_TYPE_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                pressed={draft.type === option.id}
                onClick={() => patch({ type: option.id })}
              />
            ))}
          </div>
        </Field>

        <Field label="Dias da semana">
          <WeekdayPicker
            value={draft.weekdays}
            onChange={(weekdays) => patch({ weekdays })}
          />
        </Field>

        <Field label="Hora" hint="Opcional.">
          <Input
            value={draft.time ?? ''}
            placeholder="13:00"
            maxLength={5}
            inputMode="numeric"
            onChange={(time) => patch({ time: time.trim() || null })}
          />
        </Field>

        <ItemsEditor
          items={draft.items}
          foods={foods}
          onChange={(items) => patch({ items })}
          onEditFood={onEditFood}
        />

        <Field label="Notas">
          <Input
            value={draft.notes ?? ''}
            placeholder="Opcional"
            maxLength={160}
            onChange={(notes) => patch({ notes: notes.trim() || null })}
          />
        </Field>
      </div>
    </Sheet>
  );
}
