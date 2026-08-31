/**
 * Create or edit a workout.
 *
 * Exercises are typed by name rather than picked from a list: the catalogue
 * grows from what people actually train, and a name that already exists is
 * reused so the progression chart stays whole.
 */

import { useState, type ReactElement } from 'react';
import { REST_PRESETS, WORKOUT_TYPE_OPTIONS } from '../../core/constants';
import {
  emptyBlockDraft, emptyWorkoutDraft, type BlockDraft, type WorkoutDraft,
} from '../../services/training';
import { Sheet } from '../../ui/Sheet';
import { Button, Chip } from '../../ui/primitives';
import { Field, Input } from '../../ui/form';
import { Icon } from '../../ui/Icon';

/** Whole minutes read better than "1.5 min"; anything else stays in seconds. */
function countLabel(count: number): string {
  return count === 1 ? '1 exercício' : `${count} exercícios`;
}

function restLabel(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds}s`;
}

function toNumber(raw: string): number | null {
  if (raw.trim() === '') return null;
  const value = Number(raw.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

export function WorkoutBuilder({
  initial, onSave, onArchive, onClose,
}: {
  initial?: WorkoutDraft;
  onSave: (draft: WorkoutDraft) => void;
  onArchive?: () => void;
  onClose: () => void;
}): ReactElement {
  const [draft, setDraft] = useState<WorkoutDraft>(() => initial ?? emptyWorkoutDraft());
  const [error, setError] = useState<string | null>(null);

  const patch = (changes: Partial<WorkoutDraft>): void => {
    setDraft((current) => ({ ...current, ...changes }));
    setError(null);
  };

  const patchBlock = (id: string, changes: Partial<BlockDraft>): void => {
    setDraft((current) => ({
      ...current,
      blocks: current.blocks.map((block) => (block.id === id ? { ...block, ...changes } : block)),
    }));
    setError(null);
  };

  const addBlock = (): void => {
    setDraft((current) => ({ ...current, blocks: [...current.blocks, emptyBlockDraft()] }));
  };

  const removeBlock = (id: string): void => {
    setDraft((current) => ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== id),
    }));
  };

  const save = (): void => {
    if (!draft.title.trim()) {
      setError('Dá um nome ao treino.');
      return;
    }
    if (draft.blocks.every((block) => !block.exerciseName.trim())) {
      setError('Adiciona pelo menos um exercício.');
      return;
    }
    onSave(draft);
  };

  return (
    <Sheet
      title={draft.id ? 'Editar treino' : 'Novo treino'}
      subtitle={countLabel(draft.blocks.filter((b) => b.exerciseName.trim()).length)}
      onClose={onClose}
      footer={
        <>
          {onArchive ? (
            <Button variant="outline" label="Arquivar" onClick={onArchive} />
          ) : (
            <Button variant="outline" label="Cancelar" onClick={onClose} />
          )}
          <Button variant="primary" label="Guardar" onClick={save} />
        </>
      }
    >
      <div className="stack stack-5">
        <Field htmlFor="wk-title" error={error ?? undefined}>
          <Input
            id="wk-title"
            value={draft.title}
            placeholder="Nome do treino"
            maxLength={60}
            invalid={!!error}
            onChange={(value) => patch({ title: value })}
          />
        </Field>

        <Field label="Tipo">
          <div className="chips">
            {WORKOUT_TYPE_OPTIONS.map((option) => (
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
          <Field label="Duração estimada">
            <Input
              type="number"
              inputMode="numeric"
              unit="min"
              value={draft.estimatedMin ?? ''}
              min={5}
              max={300}
              step={5}
              onChange={(value) => patch({ estimatedMin: toNumber(value) })}
            />
          </Field>
          <Field label="Exercícios">
            <div className="input" style={{ display: 'flex', alignItems: 'center' }}>
              {draft.blocks.length}
            </div>
          </Field>
        </div>

        <Field label="Descrição">
          <Input
            value={draft.description ?? ''}
            placeholder="Opcional"
            maxLength={160}
            onChange={(value) => patch({ description: value || null })}
          />
        </Field>

        <div className="stack stack-3">
          <p className="t-eyebrow">Exercícios</p>
          {draft.blocks.map((block, index) => (
            <BlockEditor
              key={block.id}
              block={block}
              index={index}
              canRemove={draft.blocks.length > 1}
              onChange={(changes) => patchBlock(block.id, changes)}
              onRemove={() => removeBlock(block.id)}
            />
          ))}
          <Button variant="outline" block icon="plus" label="Adicionar exercício" onClick={addBlock} />
        </div>
      </div>
    </Sheet>
  );
}

function BlockEditor({
  block, index, canRemove, onChange, onRemove,
}: {
  block: BlockDraft;
  index: number;
  canRemove: boolean;
  onChange: (changes: Partial<BlockDraft>) => void;
  onRemove: () => void;
}): ReactElement {
  return (
    <div className="block-editor">
      <div className="row">
        <span className="block-index" aria-hidden="true">{index + 1}</span>
        <Input
          value={block.exerciseName}
          placeholder="Nome do exercício"
          maxLength={60}
          onChange={(value) => onChange({ exerciseName: value })}
        />
        {canRemove ? (
          <button
            type="button"
            className="btn-icon"
            aria-label={`Remover exercício ${index + 1}`}
            onClick={onRemove}
          >
            <Icon name="close" />
          </button>
        ) : null}
      </div>

      <div className="block-grid">
        <NumberCell
          label="Séries"
          value={block.sets}
          min={1}
          max={20}
          onChange={(value) => onChange({ sets: Math.max(1, value ?? 1) })}
        />
        <NumberCell
          label="Reps"
          value={block.reps}
          min={1}
          max={999}
          onChange={(value) => onChange({ reps: value })}
        />
        <NumberCell
          label="Carga"
          unit="kg"
          value={block.loadKg}
          min={0}
          max={999}
          step={0.5}
          onChange={(value) => onChange({ loadKg: value })}
        />
        <NumberCell
          label="Duração"
          unit="s"
          value={block.durationSec}
          min={0}
          max={3600}
          step={5}
          onChange={(value) => onChange({ durationSec: value })}
        />
      </div>

      <div className="stack stack-2">
        <span className="cell-label">Descanso</span>
        <div className="chips-scroll">
          {REST_PRESETS.map((seconds) => (
            <Chip
              key={seconds}
              label={restLabel(seconds)}
              pressed={block.restSec === seconds}
              onClick={() => onChange({ restSec: seconds })}
            />
          ))}
          <Chip
            label="Sem descanso"
            pressed={block.restSec == null || block.restSec === 0}
            onClick={() => onChange({ restSec: null })}
          />
        </div>
      </div>

      <Input
        value={block.note ?? ''}
        placeholder="Notas do exercício"
        maxLength={120}
        onChange={(value) => onChange({ note: value || null })}
      />
    </div>
  );
}

function NumberCell({
  label, value, unit, min, max, step, onChange,
}: {
  label: string;
  value: number | null;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number | null) => void;
}): ReactElement {
  return (
    <label className="number-cell">
      <span className="cell-label">{label}</span>
      <span className="cell-input">
        <input
          className="input"
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          min={min}
          max={max}
          step={step}
          placeholder="—"
          onChange={(event) => onChange(toNumber(event.target.value))}
        />
        {unit ? <span className="cell-unit">{unit}</span> : null}
      </span>
    </label>
  );
}
