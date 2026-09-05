/**
 * Os valores de um alimento, por 100 g.
 *
 * Todos os campos sao opcionais e vazio quer dizer desconhecido: a aplicacao
 * prefere um traco a um numero que ninguem escreveu, e nada aqui e posto a zero
 * por omissao.
 *
 * A PACE pode preenche-los, e quando o faz eles ficam marcados como estimativa.
 * Editar um valor estimado torna-o teu: a partir do momento em que alguem o
 * escreve, deixa de ser um palpite.
 */

import { useState, type ReactElement } from 'react';
import type { Food } from '../../core/types';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/primitives';
import { Field, Input } from '../../ui/form';

function toNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function text(value: number | null): string {
  return value == null ? '' : String(value);
}

export function FoodForm({
  food, onSave, onClose, onAskPace,
}: {
  food: Food;
  onSave: (food: Food) => void;
  onClose: () => void;
  /** Pede os valores à PACE. Só aparece quando o alimento não os tem. */
  onAskPace?: (name: string) => void;
}): ReactElement {
  const [draft, setDraft] = useState<Food>(food);

  const patch = (changes: Partial<Food>): void => {
    setDraft((current) => ({
      ...current,
      ...changes,
      // Um valor escrito à mão deixa de ser estimativa de ninguém.
      source: current.source === 'ai_estimate' && 'kcalPer100g' in changes
        ? 'manual'
        : current.source,
    }));
  };

  const semValores = draft.kcalPer100g == null && draft.proteinPer100g == null;

  return (
    <Sheet
      title={draft.name || 'Alimento'}
      subtitle="Valores por 100 g. Deixa vazio o que não souberes."
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" label="Cancelar" onClick={onClose} />
          <Button
            variant="primary"
            label="Guardar"
            onClick={() => onSave({ ...draft, name: draft.name.trim() })}
          />
        </>
      }
    >
      <div className="stack stack-5">
        {draft.source === 'ai_estimate' ? (
          <p className="t-sm muted-2">
            Estes valores foram estimados pela PACE a partir do nome. São típicos para
            este alimento, não vieram de um rótulo — corrige o que souberes.
          </p>
        ) : null}

        {semValores && onAskPace ? (
          <Button
            variant="outline"
            block
            label="Pedir os valores à PACE"
            onClick={() => onAskPace(draft.name.trim())}
          />
        ) : null}

        <Field label="Nome">
          <Input value={draft.name} maxLength={60} onChange={(name) => patch({ name })} />
        </Field>

        <Field label="Marca">
          <Input
            value={draft.brand ?? ''}
            placeholder="Opcional"
            maxLength={40}
            onChange={(brand) => patch({ brand: brand.trim() || null })}
          />
        </Field>

        <div className="grid-2">
          <Field label="Energia">
            <Input
              type="number" inputMode="decimal" unit="kcal" min={0}
              value={text(draft.kcalPer100g)}
              onChange={(value) => patch({ kcalPer100g: toNumber(value) })}
            />
          </Field>
          <Field label="Proteína">
            <Input
              type="number" inputMode="decimal" unit="g" min={0}
              value={text(draft.proteinPer100g)}
              onChange={(value) => patch({ proteinPer100g: toNumber(value) })}
            />
          </Field>
          <Field label="Hidratos">
            <Input
              type="number" inputMode="decimal" unit="g" min={0}
              value={text(draft.carbsPer100g)}
              onChange={(value) => patch({ carbsPer100g: toNumber(value) })}
            />
          </Field>
          <Field label="Gordura">
            <Input
              type="number" inputMode="decimal" unit="g" min={0}
              value={text(draft.fatPer100g)}
              onChange={(value) => patch({ fatPer100g: toNumber(value) })}
            />
          </Field>
          <Field label="Fibra">
            <Input
              type="number" inputMode="decimal" unit="g" min={0}
              value={text(draft.fiberPer100g)}
              onChange={(value) => patch({ fiberPer100g: toNumber(value) })}
            />
          </Field>
        </div>

        <div className="grid-2">
          {/* Without these two, a quantity in ml or in units cannot become
              grams, and the item is counted as unknown rather than guessed. */}
          <Field label="1 ml pesa" hint="Para quantidades em ml.">
            <Input
              type="number" inputMode="decimal" unit="g" min={0} step={0.01}
              value={text(draft.gramsPerMl)}
              onChange={(value) => patch({ gramsPerMl: toNumber(value) })}
            />
          </Field>
          <Field label="1 unidade pesa" hint="Para unidades ou porções.">
            <Input
              type="number" inputMode="decimal" unit="g" min={0}
              value={text(draft.gramsPerUnit)}
              onChange={(value) => patch({ gramsPerUnit: toNumber(value) })}
            />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}
