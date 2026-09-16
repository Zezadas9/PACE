import { describe, expect, it } from 'vitest';
import { createCalendarEvent } from '../core/factories';
import type { EventDraftItem, EventsDraft } from './coach/types';
import {
  clashes, eventsFromDraft, firstDateOn, groupEventItems, weeklyCount,
} from './timetable';

// 2026-09-16 é uma quarta-feira.
const QUARTA = '2026-09-16';

const aula = (over: Partial<EventDraftItem>): EventDraftItem => ({
  title: 'Matemática',
  category: 'school',
  weekdays: [1],
  startTime: '09:00',
  endTime: '10:30',
  location: 'Sala 2',
  ...over,
});

const horario = (items: EventDraftItem[], over: Partial<EventsDraft> = {}): EventsDraft => ({
  title: 'Horário do 12.º B',
  items,
  startDate: null,
  until: null,
  unreadable: [],
  ...over,
});

describe('juntar as aulas', () => {
  it('a mesma aula em dias diferentes é um evento só', () => {
    const juntas = groupEventItems([
      aula({ weekdays: [3] }),
      aula({ weekdays: [1] }),
      aula({ title: 'Física', weekdays: [2], startTime: '11:00', endTime: '12:30' }),
    ]);
    expect(juntas).toHaveLength(2);
    expect(juntas[0]).toMatchObject({ title: 'Matemática', weekdays: [1, 3] });
    expect(juntas[1]).toMatchObject({ title: 'Física', weekdays: [2] });
  });

  it('a mesma disciplina a outra hora ou noutra sala é outra aula', () => {
    expect(groupEventItems([
      aula({ weekdays: [1] }),
      aula({ weekdays: [4], startTime: '14:00', endTime: '15:30' }),
      aula({ weekdays: [5], location: 'Sala 7' }),
    ])).toHaveLength(3);
  });

  it('ordena como um horário: segunda primeiro, domingo no fim, e por hora', () => {
    const juntas = groupEventItems([
      aula({ title: 'Domingo', weekdays: [0] }),
      aula({ title: 'Segunda tarde', weekdays: [1], startTime: '14:00', endTime: null }),
      aula({ title: 'Segunda manhã', weekdays: [1], startTime: '08:00', endTime: null }),
    ]);
    expect(juntas.map((item) => item.title)).toEqual(['Segunda manhã', 'Segunda tarde', 'Domingo']);
  });

  it('juntar duas vezes dá o mesmo', () => {
    const uma = groupEventItems([aula({ weekdays: [3] }), aula({ weekdays: [1] })]);
    expect(groupEventItems(uma)).toEqual(uma);
  });

  it('conta as marcações da semana', () => {
    expect(weeklyCount([aula({ weekdays: [1, 3] }), aula({ title: 'Física', weekdays: [2] })])).toBe(3);
  });
});

describe('os eventos', () => {
  it('ancoram no primeiro dia certo a partir de hoje, e repetem-se todas as semanas', () => {
    const [evento] = eventsFromDraft(horario([aula({ weekdays: [1, 3] })]), QUARTA);
    // Hoje é quarta, e há aula à quarta: começa hoje.
    expect(evento?.date).toBe(QUARTA);
    expect(evento?.recurrence).toEqual({ kind: 'weekly', interval: 1, weekdays: [1, 3], until: null });
    expect(evento).toMatchObject({
      title: 'Matemática', category: 'school', startTime: '09:00', endTime: '10:30', location: 'Sala 2',
    });
    expect(evento?.description).toContain('Horário do 12.º B');
  });

  it('uma aula só à segunda começa na segunda seguinte', () => {
    expect(firstDateOn(QUARTA, [1])).toBe('2026-09-21');
    const [evento] = eventsFromDraft(horario([aula({ weekdays: [1] })]), QUARTA);
    expect(evento?.date).toBe('2026-09-21');
  });

  it('nunca começa no passado, e respeita o fim do semestre', () => {
    const [evento] = eventsFromDraft(
      horario([aula({ weekdays: [1] })], { startDate: '2026-09-01', until: '2027-01-31' }),
      QUARTA,
    );
    expect(evento?.date).toBe('2026-09-21');
    expect(evento?.recurrence?.until).toBe('2027-01-31');
  });

  it('um fim antes do início não vale', () => {
    const [evento] = eventsFromDraft(horario([aula({})], { until: '2026-09-01' }), QUARTA);
    expect(evento?.recurrence?.until).toBeNull();
  });
});

describe('o que choca com a agenda', () => {
  const ginasio = createCalendarEvent({
    title: 'Ginásio',
    date: '2026-09-14',
    startTime: '10:00',
    endTime: '11:00',
    recurrence: { kind: 'weekly', interval: 1, weekdays: [1], until: null },
  });
  const jantar = createCalendarEvent({
    title: 'Jantar',
    date: '2026-09-21',
    startTime: '20:00',
    endTime: '22:00',
  });

  it('mostra a sobreposição, com o dia e a hora do que já lá estava', () => {
    const encontrados = clashes([aula({ weekdays: [1, 3] })], [ginasio, jantar], QUARTA);
    expect(encontrados).toHaveLength(1);
    expect(encontrados[0]?.with).toBe('Ginásio (seg 10:00)');
  });

  it('encostado não é sobreposto', () => {
    expect(clashes([aula({ weekdays: [1], startTime: '08:00', endTime: '10:00' })], [ginasio], QUARTA))
      .toHaveLength(0);
  });

  it('um evento de um dia só conta no dia dele', () => {
    expect(clashes([aula({ weekdays: [1], startTime: '21:00', endTime: '22:00' })], [jantar], QUARTA))
      .toHaveLength(1);
    expect(clashes([aula({ weekdays: [2], startTime: '21:00', endTime: '22:00' })], [jantar], QUARTA))
      .toHaveLength(0);
  });
});
