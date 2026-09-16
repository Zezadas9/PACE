/**
 * PACE — um horário (escolar ou de trabalho) que passa a ser agenda.
 *
 * O horário chega à IA como fotografia, PDF ou ficheiro, e sai como uma lista
 * de aulas ou turnos. Este ficheiro transforma essa lista em eventos que se
 * repetem todas as semanas, e diz o que choca com o que já estava marcado.
 *
 * Três regras:
 *
 * 1. **Uma aula, um evento.** "Matemática, segunda e quarta, 9h–10h30" é um
 *    evento semanal com dois dias, e não dois eventos. Assim, mudar a sala ou
 *    apagar a disciplina faz-se num sítio só.
 * 2. **Só acrescenta.** O que já estava na agenda não é tocado, nem quando se
 *    sobrepõe. A sobreposição é mostrada, e decidida por quem conhece o dia.
 * 3. **Começa a partir de hoje.** Um evento semanal ancora no primeiro dia
 *    certo a partir da data de início — nunca no passado.
 */

import { toMinutes } from '../core/scheduling';
import type { CalendarEvent, DayKey } from '../core/types';
import { addDaysToKey } from '../core/utils/date';
import type { EventDraftItem, EventsDraft } from './coach/types';
import { occursOn } from './recurrence';

const weekdayOf = (date: DayKey): number => new Date(`${date}T12:00:00`).getDay();

/** Segunda primeiro, domingo no fim — como se lê um horário. */
const mondayFirst = (day: number): number => (day + 6) % 7;

function sameSlot(a: EventDraftItem, b: EventDraftItem): boolean {
  return a.title.trim().toLowerCase() === b.title.trim().toLowerCase()
    && a.startTime === b.startTime
    && (a.endTime ?? null) === (b.endTime ?? null)
    && (a.location ?? '').trim().toLowerCase() === (b.location ?? '').trim().toLowerCase()
    && a.category === b.category;
}

/**
 * Junta as linhas que são a mesma aula em dias diferentes.
 *
 * Idempotente: juntar uma lista já junta dá a mesma lista. A ordem de saída é a
 * de um horário — primeiro dia da semana, depois hora.
 */
export function groupEventItems(items: EventDraftItem[]): EventDraftItem[] {
  const groups: EventDraftItem[] = [];
  for (const item of items) {
    const existing = groups.find((group) => sameSlot(group, item));
    if (existing) {
      existing.weekdays = [...new Set([...existing.weekdays, ...item.weekdays])];
      continue;
    }
    groups.push({ ...item, weekdays: [...new Set(item.weekdays)] });
  }

  for (const group of groups) group.weekdays.sort((a, b) => mondayFirst(a) - mondayFirst(b));

  return groups.sort((a, b) => {
    const dayA = Math.min(...a.weekdays.map(mondayFirst));
    const dayB = Math.min(...b.weekdays.map(mondayFirst));
    if (dayA !== dayB) return dayA - dayB;
    return a.startTime.localeCompare(b.startTime);
  });
}

/** O primeiro dia, a partir de `from` inclusive, que cai num destes dias da semana. */
export function firstDateOn(from: DayKey, weekdays: number[]): DayKey {
  for (let offset = 0; offset < 7; offset += 1) {
    const date = addDaysToKey(from, offset);
    if (weekdays.includes(weekdayOf(date))) return date;
  }
  return from;
}

/** Quantas vezes por semana, somando todos os dias de todas as aulas. */
export function weeklyCount(items: EventDraftItem[]): number {
  return groupEventItems(items).reduce((total, item) => total + item.weekdays.length, 0);
}

/** Os eventos a criar. A data de início nunca fica antes de `today`. */
export function eventsFromDraft(
  draft: EventsDraft,
  today: DayKey,
): Array<Partial<CalendarEvent>> {
  const from = draft.startDate && draft.startDate > today ? draft.startDate : today;
  const until = draft.until && draft.until >= from ? draft.until : null;

  return groupEventItems(draft.items)
    .filter((item) => item.weekdays.length > 0)
    .map((item) => ({
      title: item.title.trim(),
      description: `Do horário "${draft.title.trim()}"`,
      category: item.category,
      date: firstDateOn(from, item.weekdays),
      startTime: item.startTime,
      endTime: item.endTime ?? null,
      allDay: false,
      recurrence: { kind: 'weekly', interval: 1, weekdays: item.weekdays, until },
      reminder: null,
      location: item.location?.trim() || null,
    }));
}

export interface Clash {
  item: EventDraftItem;
  /** "Ginásio (seg 18:00)" */
  with: string;
}

const SHORT_DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Um evento sem hora de fim conta como uma hora — é o que a agenda desenha. */
function span(start: string, end: string | null): [number, number] | null {
  const from = toMinutes(start);
  if (from == null) return null;
  const to = end ? toMinutes(end) : null;
  return [from, to != null && to > from ? to : from + 60];
}

/**
 * O que já estava marcado e se sobrepõe ao horário, na primeira semana.
 *
 * Só se mostra. Decidir o que fica — a aula, o ginásio, ou os dois — é de quem
 * vive o dia, e não de uma regra.
 */
export function clashes(
  items: EventDraftItem[],
  existing: CalendarEvent[],
  from: DayKey,
): Clash[] {
  const found: Clash[] = [];

  for (const item of groupEventItems(items)) {
    const mine = span(item.startTime, item.endTime);
    if (!mine) continue;

    for (const day of item.weekdays) {
      const date = firstDateOn(from, [day]);
      for (const event of existing) {
        if (event.allDay) continue;
        if (!occursOn(event.recurrence, event.date, date)) continue;
        const theirs = span(event.startTime, event.endTime);
        if (!theirs) continue;
        if (mine[0] < theirs[1] && theirs[0] < mine[1]) {
          found.push({ item, with: `${event.title} (${SHORT_DAYS[day]} ${event.startTime})` });
        }
      }
    }
  }
  return found;
}
