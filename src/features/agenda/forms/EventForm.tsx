/** Create or edit a calendar event. */

import { useState, type ReactElement } from 'react';
import {
  EVENT_CATEGORY_OPTIONS, RECURRENCE_OPTIONS, REMINDER_LEAD_OPTIONS,
} from '../../../core/constants';
import { createCalendarEvent } from '../../../core/factories';
import { defaultReminderLead } from '../../../core/scheduling';
import type { CalendarEvent, DayKey } from '../../../core/types';
import { describeRecurrence } from '../../../domain/recurrence';
import { Sheet } from '../../../ui/Sheet';
import { Button, Chip } from '../../../ui/primitives';
import { Field, Input, Segmented } from '../../../ui/form';
import { TimeField } from '../../../ui/TimeField';
import { WeekdayPicker } from './WeekdayPicker';

export function EventForm({
  date, existing, onSave, onDelete, onClose,
}: {
  date: DayKey;
  existing?: CalendarEvent;
  onSave: (event: CalendarEvent) => void;
  onDelete?: () => void;
  onClose: () => void;
}): ReactElement {
  const [draft, setDraft] = useState<CalendarEvent>(
    () => existing ?? createCalendarEvent({ date }),
  );
  const [error, setError] = useState<string | null>(null);

  const patch = (changes: Partial<CalendarEvent>): void => {
    setDraft((current) => ({ ...current, ...changes }));
    setError(null);
  };

  const save = (): void => {
    if (!draft.title.trim()) {
      setError('Dá um título ao evento.');
      return;
    }
    if (!draft.allDay && draft.endTime && draft.endTime < draft.startTime) {
      setError('A hora de fim é anterior à de início.');
      return;
    }
    onSave({ ...draft, title: draft.title.trim() });
  };

  const recurrence = draft.recurrence;

  return (
    <Sheet
      title={existing ? 'Editar evento' : 'Novo evento'}
      subtitle={describeRecurrence(recurrence, draft.date)}
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
        <Field htmlFor="ev-title" error={error ?? undefined}>
          <Input
            id="ev-title"
            value={draft.title}
            placeholder="Título"
            maxLength={80}
            invalid={!!error}
            onChange={(value) => patch({ title: value })}
          />
        </Field>

        <Field label="Categoria">
          <div className="chips">
            {EVENT_CATEGORY_OPTIONS.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                pressed={draft.category === option.id}
                onClick={() => patch({ category: option.id })}
              />
            ))}
          </div>
        </Field>

        <Field label="Data" htmlFor="ev-date">
          <Input
            id="ev-date"
            type="date"
            value={draft.date}
            onChange={(value) => patch({ date: value || draft.date })}
          />
        </Field>

        <Field label="Horário">
          <div className="stack stack-3">
            <Segmented
              ariaLabel="Duração"
              value={draft.allDay ? 'allday' : 'timed'}
              options={[
                { id: 'timed', label: 'Com hora' },
                { id: 'allday', label: 'Dia inteiro' },
              ]}
              onChange={(id) => patch({ allDay: id === 'allday' })}
            />
            {!draft.allDay ? (
              <div className="grid-2">
                <TimeField
                  value={draft.startTime}
                  placeholder="09:00"
                  ariaLabel="Hora de início"
                  onChange={(value) => patch({ startTime: value })}
                />
                <TimeField
                  value={draft.endTime ?? ''}
                  placeholder="10:00"
                  ariaLabel="Hora de fim"
                  onChange={(value) => patch({ endTime: value || null })}
                />
              </div>
            ) : null}
          </div>
        </Field>

        <Field label="Repetição">
          <div className="stack stack-3">
            <div className="chips">
              {RECURRENCE_OPTIONS.map((option) => (
                <Chip
                  key={option.id}
                  label={option.label}
                  pressed={recurrence.kind === option.id}
                  onClick={() => patch({ recurrence: { ...recurrence, kind: option.id } })}
                />
              ))}
            </div>
            {recurrence.kind === 'weekly' ? (
              <WeekdayPicker
                value={recurrence.weekdays}
                onChange={(weekdays) => patch({ recurrence: { ...recurrence, weekdays } })}
              />
            ) : null}
            {recurrence.kind !== 'none' ? (
              <Input
                type="number"
                inputMode="numeric"
                unit={intervalUnit(recurrence.kind)}
                value={recurrence.interval}
                min={1}
                max={99}
                step={1}
                onChange={(value) =>
                  patch({ recurrence: { ...recurrence, interval: Math.max(1, Number(value) || 1) } })
                }
              />
            ) : null}
          </div>
        </Field>

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
                  !!draft.reminder?.enabled &&
                  draft.reminder.minutesBefore === Number(option.id)
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
            value={draft.description ?? ''}
            placeholder="Opcional"
            maxLength={200}
            onChange={(value) => patch({ description: value || null })}
          />
        </Field>
      </div>
    </Sheet>
  );
}

function intervalUnit(kind: string): string {
  if (kind === 'daily') return 'dias';
  if (kind === 'weekly') return 'semanas';
  if (kind === 'monthly') return 'meses';
  return 'anos';
}
