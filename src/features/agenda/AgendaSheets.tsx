/**
 * The create/edit sheets, and the save and delete rules behind them.
 *
 * Split out of AgendaScreen so the screen stays about navigation and this file
 * stays about persistence: which repository a form writes to, what has to be
 * confirmed first, and what the user is told afterwards.
 */

import type { ReactElement } from 'react';
import type { CalendarEvent, DayKey, Habit, Task } from '../../core/types';
import { archiveHabit, deleteEvent, deleteTask } from '../../services/agenda';
import { useApp } from '../../app/providers/appContext';
import { useUi } from '../../app/providers/uiContext';
import { EventForm } from './forms/EventForm';
import { TaskForm } from './forms/TaskForm';
import { HabitForm } from './forms/HabitForm';

export type SheetState =
  | { kind: 'picker' }
  | { kind: 'event'; existing?: CalendarEvent }
  | { kind: 'task'; existing?: Task }
  | { kind: 'habit'; existing?: Habit }
  | null;

export function AgendaSheets({
  sheet, date, onClose,
}: {
  sheet: SheetState;
  date: DayKey;
  onClose: () => void;
}): ReactElement | null {
  const { repos } = useApp();
  const { confirm, toast } = useUi();

  if (!sheet || sheet.kind === 'picker') return null;

  if (sheet.kind === 'event') {
    const existing = sheet.existing;
    return (
      <EventForm
        date={date}
        existing={existing}
        onClose={onClose}
        onSave={(event) => {
          if (existing) repos.events.update(event.id, event);
          else repos.events.insert(event);
          onClose();
          toast(existing ? 'Evento atualizado.' : 'Evento criado.');
        }}
        onDelete={
          existing
            ? () => {
                void (async () => {
                  const ok = await confirm({
                    title: 'Apagar evento?',
                    body: 'Remove também as repetições futuras.',
                    confirmLabel: 'Apagar',
                    danger: true,
                  });
                  if (!ok) return;
                  deleteEvent(repos, existing.id);
                  onClose();
                })();
              }
            : undefined
        }
      />
    );
  }

  if (sheet.kind === 'task') {
    const existing = sheet.existing;
    return (
      <TaskForm
        date={date}
        existing={existing}
        onClose={onClose}
        onSave={(task) => {
          if (existing) repos.tasks.update(task.id, task);
          else repos.tasks.insert(task);
          onClose();
          toast(existing ? 'Tarefa atualizada.' : 'Tarefa criada.');
        }}
        onDelete={
          existing
            ? () => {
                void (async () => {
                  const ok = await confirm({
                    title: 'Apagar tarefa?',
                    confirmLabel: 'Apagar',
                    danger: true,
                  });
                  if (!ok) return;
                  deleteTask(repos, existing.id);
                  onClose();
                })();
              }
            : undefined
        }
      />
    );
  }

  const existing = sheet.existing;
  return (
    <HabitForm
      date={date}
      existing={existing}
      settings={repos.settings.get().notifications}
      confirm={confirm}
      onClose={onClose}
      onSave={(habit) => {
        if (existing) repos.habits.update(habit.id, habit);
        else repos.habits.insert(habit);
        onClose();
        toast(existing ? 'Hábito atualizado.' : 'Hábito criado.');
      }}
      onArchive={
        existing
          ? () => {
              void (async () => {
                const ok = await confirm({
                  title: 'Arquivar hábito?',
                  body: 'Deixa de aparecer, mas o histórico e a sequência ficam intactos.',
                  confirmLabel: 'Arquivar',
                });
                if (!ok) return;
                archiveHabit(repos, existing.id);
                onClose();
              })();
            }
          : undefined
      }
    />
  );
}
