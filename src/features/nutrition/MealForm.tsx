/**
 * A meal: what was eaten, how much, and when.
 *
 * Quantities carry their unit rather than being converted on entry — "1 unidade"
 * stays one unit, and only becomes grams if the food says what a unit weighs.
 * Items whose food has no nutrition are marked as such right here, with the way
 * to fix it one tap away, because that is the moment the person knows the answer.
 */

import type { ReactElement } from 'react';
import { FOOD_UNIT_OPTIONS, MEAL_TYPE_OPTIONS } from '../../core/constants';
import type { Food } from '../../core/types';
import { hasNutrition, nutritionOf } from '../../domain/nutrition';
import type { MealDraft, MealItemDraft } from '../../services/nutrition';
import { emptyItemDraft } from '../../services/nutrition';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip, IconButton } from '../../ui/primitives';
import { Field, Input, Segmented } from '../../ui/form';

function toQuantity(raw: string): number {
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function findFood(foods: Food[], name: string): Food | undefined {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return undefined;
  return foods.find((food) => food.name.toLowerCase() === trimmed);
}

export function MealForm({
  draft, foods, onChange, onSave, onDelete, onEditFood, onClose,
}: {
  draft: MealDraft;
  foods: Food[];
  onChange: (draft: MealDraft) => void;
  onSave: (draft: MealDraft) => void;
  onDelete?: () => void;
  onEditFood: (name: string) => void;
  onClose: () => void;
}): ReactElement {
  const patch = (changes: Partial<MealDraft>): void => onChange({ ...draft, ...changes });

  const named = draft.items.filter((item) => item.foodName.trim().length > 0);

  return (
    <Sheet
      title={draft.id ? 'Editar refeição' : 'Nova refeição'}
      subtitle={named.length === 0
        ? 'Adiciona os alimentos.'
        : `${named.length} ${named.length === 1 ? 'alimento' : 'alimentos'}`}
      onClose={onClose}
      footer={
        <>
          {onDelete
            ? <Button variant="outline" label="Apagar" onClick={onDelete} />
            : <Button variant="outline" label="Cancelar" onClick={onClose} />}
          <Button
            variant="primary"
            label="Guardar"
            disabled={named.length === 0}
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

        <div className="grid-2">
          <Field label="Data">
            <Input
              type="date"
              value={draft.date}
              onChange={(date) => patch({ date })}
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
        </div>

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

/**
 * The list of foods and quantities, shared by a logged meal and a plan entry —
 * they are the same thing entered at different times.
 */
export function ItemsEditor({
  items, foods, onChange, onEditFood,
}: {
  items: MealItemDraft[];
  foods: Food[];
  onChange: (items: MealItemDraft[]) => void;
  onEditFood: (name: string) => void;
}): ReactElement {
  const named = items.filter((item) => item.foodName.trim().length > 0);
  const suggestions = foods
    .filter((food) => !named.some((item) => item.foodName.trim() === food.name))
    .slice(-6)
    .reverse();

  return (
    <div className="stack stack-3">
      <p className="t-eyebrow">Alimentos</p>
      {items.map((item) => (
        <ItemEditor
          key={item.id}
          item={item}
          food={findFood(foods, item.foodName)}
          onChange={(changes) => onChange(
            items.map((other) => (other.id === item.id ? { ...other, ...changes } : other)),
          )}
          onRemove={items.length > 1
            ? () => onChange(items.filter((other) => other.id !== item.id))
            : undefined}
          onEditFood={() => onEditFood(item.foodName)}
        />
      ))}

      {suggestions.length > 0 ? (
        <div className="chips">
          {suggestions.map((food) => (
            <Chip
              key={food.id}
              label={food.name}
              pressed={false}
              onClick={() => onChange([...items, { ...emptyItemDraft(), foodName: food.name }])}
            />
          ))}
        </div>
      ) : null}

      <Button
        variant="ghost"
        icon="plus"
        label="Adicionar alimento"
        onClick={() => onChange([...items, emptyItemDraft()])}
      />
    </div>
  );
}

function ItemEditor({
  item, food, onChange, onRemove, onEditFood,
}: {
  item: MealItemDraft;
  food: Food | undefined;
  onChange: (changes: Partial<MealItemDraft>) => void;
  onRemove?: () => void;
  onEditFood: () => void;
}): ReactElement {
  const typed = item.foodName.trim().length > 0;
  const kcal = food
    ? nutritionOf({ id: item.id, foodId: food.id, quantity: item.quantity, unit: item.unit }, food)
      .kcal
    : null;

  // Three states, and the middle one matters most: a food the app knows nothing
  // about is not an error, it just cannot be counted until someone says.
  const status = !typed
    ? null
    : food && hasNutrition(food)
      ? kcal == null
        ? `Falta o peso de 1 ${item.unit === 'ml' ? 'ml' : 'unidade'}`
        : `${Math.round(kcal)} kcal`
      : 'Sem valores nutricionais';

  return (
    <div className="food-item">
      <div className="row row-between">
        <Input
          value={item.foodName}
          placeholder="Ex.: aveia"
          maxLength={60}
          onChange={(foodName) => onChange({ foodName })}
        />
        {onRemove ? (
          <IconButton icon="trash" label="Remover alimento" onClick={onRemove} />
        ) : null}
      </div>

      <div className="food-item-row">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={item.unit === 'g' || item.unit === 'ml' ? 10 : 1}
          value={item.quantity === 0 ? '' : item.quantity}
          onChange={(value) => onChange({ quantity: toQuantity(value) })}
        />
        <Segmented
          ariaLabel="Unidade"
          value={item.unit}
          options={FOOD_UNIT_OPTIONS}
          onChange={(unit) => onChange({ unit })}
        />
      </div>

      {status ? (
        <button type="button" className="food-status" onClick={onEditFood}>
          <span>{status}</span>
          <span className="link">
            {food && hasNutrition(food) && kcal != null ? 'Editar' : 'Adicionar'}
          </span>
        </button>
      ) : null}
    </div>
  );
}
