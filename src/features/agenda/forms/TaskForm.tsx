/** Create or edit a task. */

import { useState, type ReactElement } from 'react';
import {
  REMINDER_LEAD_OPTIONS, TASK_CATEGORY_OPTIONS, TASK_PRIORITY_OPTIONS,
} from '../../../core/constants';
import { createTask } from '../../../core/factories';
import { defaultReminderLead } from '../../../core/scheduling';
import type { DayKey, Task } from '../../../core/types';
import { Sheet } from '../../../ui/Sheet';
import { Button, Chip } from '../../../ui/primitives';
import { Field, Input, Segmented } from '../../../ui/form';
import { TimeField } from '../../../ui/TimeField';
import { EssentialToggle } from './EssentialToggle';

export function TaskForm({
  date, existing, onSave, onDelete, onClose,
}: {
  date: DayKey;
  existing?: Task;
  onSave: (task: Task) => void;
  onDelete?: () => void;
  onClose: () => void;
}): ReactElement {
  const [draft, setDraft] = useState<Task>(() => existing ?? createTask({ date }));
  const [error, setError] = useState<string | null>(null);

  const patch = (changes: Partial<Task>): void => {
    setDraft((current) => ({ ...current, ...changes }));
    setError(null);
  };

  const save = (): void => {
    if (!draft.title.trim()) {
      setError('Dá um título à tarefa.');
      return;
    }
    onSave({ ...draft, title: draft.title.trim() });
  };

  return (
    <Sheet
      title={existing ? 'Editar tarefa' : 'Nova tarefa'}
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
        <Field htmlFor="task-title" error={error ?? undefined}>
          <Input
            id="task-title"
            value={draft.title}
            placeholder="O que precisas de fazer"
            maxLength={80}
            invalid={!!error}
            onChange={(value) => patch({ title: value })}
          />
        </Field>

        <div className="grid-2">
          <Field label="Data" htmlFor="task-date">
            <Input
              id="task-date"
              type="date"
              value={draft.date ?? ''}
              onChange={(value) => patch({ date: value || null })}
            />
          </Field>
          <Field label="Hora">
            <TimeField
              value={draft.time ?? ''}
              placeholder="18:30"
              ariaLabel="Hora da tarefa"
              onChange={(value) => patch({ time: value || null })}
            />
          </Field>
        </div>

        <Field label="Prioridade">
          <Segmented
            ariaLabel="Prioridade"
            value={draft.priority}
            options={TASK_PRIORITY_OPTIONS}
            onChange={(id) => patch({ priority: id })}
          />
        </Field>

        <Field label="Categoria">
          <div className="chips">
            {TASK_CATEGORY_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                pressed={draft.category === option.id}
                onClick={() => patch({ category: option.id })}
              />
            ))}
          </div>
        </Field>

        <EssentialToggle
          value={draft.essential}
          onChange={(essential) => patch({ essential })}
        />

        <Field label="Lembrete" hint="Só dispara se as notificações estiverem ligadas.">
          <div className="chips">
            <Chip
              label="Sem lembrete"
              pressed={!draft.reminder?.enabled}
              onClick={() => patch({ reminder: null })}
            />
            {REMINDER_LEAD_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                pressed={
                  !!draft.reminder?.enabled && draft.reminder.minutesBefore === Number(option.id)
                }
                onClick={() =>
                  patch({
                    reminder: {
                      ...defaultReminderLead(),
                      enabled: true,
                      minutesBefore: Number(option.id),
                    },
                  })
                }
              />
            ))}
          </div>
        </Field>

        <Field label="Notas">
          <Input
            value={draft.notes ?? ''}
            placeholder="Opcional"
            maxLength={200}
            onChange={(value) => patch({ notes: value || null })}
          />
        </Field>
      </div>
    </Sheet>
  );
}
