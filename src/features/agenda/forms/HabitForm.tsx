/**
 * Create or edit a habit.
 *
 * The one form with a guard: a reminder window with a short interval can
 * generate dozens of notifications a day, so the count is shown live and a
 * high-volume configuration must be confirmed before it is saved.
 */

import { useMemo, useState, type ReactElement } from 'react';
import {
  HABIT_FREQUENCY_OPTIONS, HABIT_KIND_OPTIONS, REMINDER_INTERVAL_OPTIONS,
} from '../../../core/constants';
import { createHabit } from '../../../core/factories';
import { defaultReminderWindow } from '../../../core/scheduling';
import type { DayKey, Habit, NotificationSettings } from '../../../core/types';
import { checkHabitVolume } from '../../../services/notifications';
import { Sheet } from '../../../ui/Sheet';
import { Button, Chip } from '../../../ui/primitives';
import { Field, Input, Segmented } from '../../../ui/form';
import { TimeField } from '../../../ui/TimeField';
import { Switch } from '../../../ui/Switch';
import { EssentialToggle } from './EssentialToggle';
import { WeekdayPicker } from './WeekdayPicker';

export interface ConfirmFn {
  (options: { title: string; body?: string; confirmLabel?: string }): Promise<boolean>;
}

export function HabitForm({
  date, existing, settings, onSave, onArchive, onClose, confirm,
}: {
  date: DayKey;
  existing?: Habit;
  settings: NotificationSettings;
  onSave: (habit: Habit) => void;
  onArchive?: () => void;
  onClose: () => void;
  confirm: ConfirmFn;
}): ReactElement {
  const [draft, setDraft] = useState<Habit>(() => existing ?? createHabit({ startDate: date }));
  const [error, setError] = useState<string | null>(null);

  const patch = (changes: Partial<Habit>): void => {
    setDraft((current) => ({ ...current, ...changes }));
    setError(null);
  };

  const volume = useMemo(() => checkHabitVolume(draft, settings), [draft, settings]);

  const save = async (): Promise<void> => {
    if (!draft.title.trim()) {
      setError('Dá um nome ao hábito.');
      return;
    }
    if (draft.frequency === 'custom' && draft.weekdays.length === 0) {
      setError('Escolhe pelo menos um dia.');
      return;
    }
    if (volume.high) {
      const ok = await confirm({
        title: 'Muitas notificações',
        body: volume.message,
        confirmLabel: 'Sim, quero',
      });
      if (!ok) return;
    }
    onSave({ ...draft, title: draft.title.trim() });
  };

  const reminder = draft.reminder;

  return (
    <Sheet
      title={existing ? 'Editar hábito' : 'Novo hábito'}
      onClose={onClose}
      footer={
        <>
          {onArchive ? (
            <Button variant="outline" label="Arquivar" onClick={onArchive} />
          ) : (
            <Button variant="outline" label="Cancelar" onClick={onClose} />
          )}
          <Button variant="primary" label="Guardar" onClick={() => void save()} />
        </>
      }
    >
      <div className="stack stack-5">
        <Field htmlFor="habit-title" error={error ?? undefined}>
          <Input
            id="habit-title"
            value={draft.title}
            placeholder="Beber água, caminhar, ler…"
            maxLength={60}
            invalid={!!error}
            onChange={(value) => patch({ title: value })}
          />
        </Field>

        <Field label="Tipo">
          <Segmented
            ariaLabel="Tipo de hábito"
            value={draft.kind}
            options={HABIT_KIND_OPTIONS}
            onChange={(id) => patch({ kind: id, target: id === 'check' ? 1 : draft.target })}
          />
        </Field>

        {draft.kind !== 'check' ? (
          <div className="grid-2">
            <Field label={draft.kind === 'count' ? 'Vezes por dia' : 'Minutos por dia'}>
              <Input
                type="number"
                inputMode="numeric"
                value={draft.target}
                min={1}
                max={99}
                step={1}
                onChange={(value) => patch({ target: Math.max(1, Number(value) || 1) })}
              />
            </Field>
            <Field label="Unidade">
              <Input
                value={draft.unit ?? ''}
                placeholder={draft.kind === 'count' ? 'copos' : 'min'}
                maxLength={12}
                onChange={(value) => patch({ unit: value || null })}
              />
            </Field>
          </div>
        ) : null}

        <Field label="Frequência">
          <div className="stack stack-3">
            <div className="chips">
              {HABIT_FREQUENCY_OPTIONS.map((option) => (
                <Chip
                  key={option.id}
                  label={option.label}
                  pressed={draft.frequency === option.id}
                  onClick={() => patch({ frequency: option.id })}
                />
              ))}
            </div>
            {draft.frequency === 'custom' ? (
              <WeekdayPicker value={draft.weekdays} onChange={(weekdays) => patch({ weekdays })} />
            ) : null}
            {draft.frequency === 'interval' ? (
              <Input
                type="number"
                inputMode="numeric"
                unit="dias"
                value={draft.intervalDays}
                min={1}
                max={60}
                step={1}
                onChange={(value) => patch({ intervalDays: Math.max(1, Number(value) || 1) })}
              />
            ) : null}
          </div>
        </Field>

        <div className="grid-2">
          <Field label="Horário">
            <TimeField
              value={draft.timeOfDay ?? ''}
              placeholder="08:00"
              onChange={(value) => patch({ timeOfDay: value || null })}
            />
          </Field>
          <Field label="Duração">
            <Input
              type="number"
              inputMode="numeric"
              unit="min"
              value={draft.durationMin ?? ''}
              min={0}
              max={600}
              step={5}
              onChange={(value) => patch({ durationMin: value ? Number(value) : null })}
            />
          </Field>
        </div>

        <EssentialToggle value={draft.essential} onChange={(essential) => patch({ essential })} />

        <div className="essential-box">
          <Switch
            checked={!!reminder?.enabled}
            title="Lembretes"
            subtitle={
              reminder?.enabled ? volume.message : 'Avisos locais durante uma janela do dia.'
            }
            onChange={(enabled) =>
              patch({
                reminder: enabled
                  ? { ...(reminder ?? defaultReminderWindow()), enabled: true }
                  : reminder
                    ? { ...reminder, enabled: false }
                    : null,
              })
            }
          />
        </div>

        {reminder?.enabled ? (
          <div className="stack stack-4">
            <div className="grid-2">
              <Field label="Das">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={reminder.startTime}
                  maxLength={5}
                  onChange={(value) => patch({ reminder: { ...reminder, startTime: value } })}
                />
              </Field>
              <Field label="Até">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={reminder.endTime}
                  maxLength={5}
                  onChange={(value) => patch({ reminder: { ...reminder, endTime: value } })}
                />
              </Field>
            </div>
            <Field label="Frequência do lembrete">
              <div className="chips">
                {REMINDER_INTERVAL_OPTIONS.map((option) => {
                  const minutes = option.id === 'once' ? null : Number(option.id);
                  return (
                    <Chip
                      key={option.id}
                      label={option.label}
                      pressed={reminder.intervalMinutes === minutes}
                      onClick={() =>
                        patch({ reminder: { ...reminder, intervalMinutes: minutes } })
                      }
                    />
                  );
                })}
              </div>
            </Field>
            {volume.high ? (
              <p className="t-sm" style={{ color: 'var(--c-attention)' }}>
                {volume.count} notificações por dia. Vamos confirmar antes de guardar.
              </p>
            ) : null}
          </div>
        ) : null}

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
