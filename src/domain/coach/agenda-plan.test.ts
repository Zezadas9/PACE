import { describe, expect, it } from 'vitest';
import { createCalendarEvent, createHabit, createWorkout } from '../../core/factories';
import {
  freeWindows, formatMinutes, parseClock, planWeek, readCommitments, readExisting,
  spreadDays, subtractExisting, summarize,
  type PlanRequest,
} from './agenda-plan';

function request(overrides: Partial<PlanRequest> = {}): PlanRequest {
  return {
    workouts: 0,
    runs: 0,
    walksDaily: false,
    water: false,
    partOfDay: null,
    excludedWeekdays: [],
    workoutLabel: 'Musculação',
    ...overrides,
  };
}

function sources(overrides: Partial<Parameters<typeof readCommitments>[0]> = {}) {
  return { habits: [], workouts: [], events: [], tasks: [], ...overrides };
}

describe('leitura da agenda', () => {
  it('lê a hora de um hábito em cada dia em que ele acontece', () => {
    const commitments = readCommitments(sources({
      habits: [createHabit({
        title: 'Alongamentos', frequency: 'custom', weekdays: [1, 3], timeOfDay: '08:00',
        durationMin: 15,
      })],
    }));
    expect(commitments).toHaveLength(2);
    expect(commitments[0]).toMatchObject({ weekday: 1, startMin: 480, endMin: 495 });
  });

  it('lê um treino com hora e duração', () => {
    const commitments = readCommitments(sources({
      workouts: [createWorkout({
        title: 'Corpo inteiro', weekdays: [2], timeOfDay: '19:00', estimatedMin: 45,
      })],
    }));
    expect(commitments[0]).toMatchObject({ weekday: 2, startMin: 1140, endMin: 1185 });
  });

  it('ignora eventos de dia inteiro — não ocupam horas', () => {
    const commitments = readCommitments(sources({
      events: [createCalendarEvent({ title: 'Férias', date: '2026-09-07', allDay: true })],
    }));
    expect(commitments).toHaveLength(0);
  });

  it('deixa livre o que está entre compromissos', () => {
    const commitments = readCommitments(sources({
      habits: [createHabit({ frequency: 'daily', timeOfDay: '08:00', durationMin: 30 })],
    }));
    const segunda = freeWindows(commitments).find((day) => day.weekday === 1);
    expect(segunda?.free[0]).toEqual({ startMin: 360, endMin: 480 });
    expect(segunda?.free[1]).toEqual({ startMin: 510, endMin: 1320 });
  });
});

describe('spreadDays', () => {
  it('espalha quatro treinos em vez de os encostar', () => {
    const dias = spreadDays(4);
    expect(dias).toHaveLength(4);
    // Nenhum par de dias seguidos, que é o ponto de espalhar.
    const seguidos = dias.filter((day, i) => i > 0 && day === (dias[i - 1] ?? -9) + 1);
    expect(seguidos.length).toBeLessThanOrEqual(1);
  });

  it('respeita os dias excluídos', () => {
    expect(spreadDays(3, [3])).not.toContain(3);
  });

  it('devolve nada quando não há dias', () => {
    expect(spreadDays(0)).toEqual([]);
  });
});

describe('planWeek', () => {
  it('marca o que foi pedido, cada coisa no seu dia', () => {
    const plan = planWeek(
      request({ workouts: 4, runs: 2, walksDaily: true, water: true }),
      [],
    );
    const contar = (kind: string): number => plan.items.filter((i) => i.kind === kind).length;
    expect(contar('workout')).toBe(4);
    expect(contar('run')).toBe(2);
    expect(contar('walk')).toBe(7);
    expect(contar('water')).toBe(1);
  });

  it('nunca marca por cima do que já existe', () => {
    const commitments = readCommitments(sources({
      habits: [createHabit({
        title: 'Reunião semanal', frequency: 'custom', weekdays: [1], timeOfDay: '18:00',
        durationMin: 90,
      })],
    }));
    const plan = planWeek(request({ workouts: 3 }), commitments);
    const segunda = plan.items.find((item) => item.weekday === 1);
    if (segunda?.startMin != null) {
      // Ou fica antes das 18:00, ou depois das 19:30 — nunca por cima.
      const fim = segunda.startMin + (segunda.durationMin ?? 0);
      expect(fim <= 18 * 60 || segunda.startMin >= 19 * 60 + 30).toBe(true);
    }
  });

  it('devolve o que já estava marcado, para se poder mostrar intocado', () => {
    const commitments = readCommitments(sources({
      habits: [createHabit({ title: 'Ler', frequency: 'daily', timeOfDay: '21:00' })],
    }));
    const plan = planWeek(request({ workouts: 2 }), commitments);
    expect(plan.untouched).toHaveLength(7);
    expect(plan.untouched[0]?.label).toBe('Ler');
  });

  it('não propõe nada num dia excluído', () => {
    const plan = planWeek(request({ workouts: 4, excludedWeekdays: [3] }), []);
    expect(plan.items.every((item) => item.weekday !== 3)).toBe(true);
  });

  it('põe as corridas fora dos dias de treino, quando há espaço', () => {
    const plan = planWeek(request({ workouts: 3, runs: 2 }), []);
    const treinos = plan.items.filter((i) => i.kind === 'workout').map((i) => i.weekday);
    const corridas = plan.items.filter((i) => i.kind === 'run').map((i) => i.weekday);
    expect(corridas.some((day) => treinos.includes(day))).toBe(false);
  });

  it('respeita a altura do dia pedida', () => {
    const plan = planWeek(request({ workouts: 2, partOfDay: 'morning' }), []);
    for (const item of plan.items) {
      if (item.startMin != null) expect(item.startMin).toBeLessThan(12 * 60);
    }
  });

  it('diz o que não coube em vez de o encaixar à força', () => {
    // Um dia inteiro ocupado das 6 às 22.
    const cheio = readCommitments(sources({
      habits: [createHabit({ frequency: 'daily', timeOfDay: '06:00', durationMin: 16 * 60 })],
    }));
    const plan = planWeek(request({ workouts: 2 }), cheio);
    expect(plan.items).toHaveLength(0);
    expect(plan.unplaced.length).toBeGreaterThan(0);
  });

  it('a água entra sem hora nenhuma', () => {
    const plan = planWeek(request({ water: true }), []);
    expect(plan.items[0]).toMatchObject({ kind: 'water', startMin: null });
  });

  it('resume o que vai acrescentar', () => {
    const plan = planWeek(request({ workouts: 4, runs: 2, walksDaily: true }), []);
    expect(summarize(plan)).toEqual(['4 treinos', '2 corridas', '7 caminhadas']);
  });
});

describe('horas', () => {
  it('lê e escreve horas do mesmo modo', () => {
    expect(parseClock('07:30')).toBe(450);
    expect(formatMinutes(450)).toBe('07:30');
    expect(parseClock('25:00')).toBeNull();
    expect(parseClock(null)).toBeNull();
  });
});

describe('o que já existe', () => {
  it('reconhece a caminhada diária que a pessoa já tem', () => {
    const cover = readExisting(
      [createHabit({ title: 'Caminhar 30 minutos', frequency: 'daily', timeOfDay: '18:00' })],
      [],
    );
    expect(cover.walksDaily).toBe(true);
    expect(cover.labels[0]).toContain('18:00');
  });

  it('conta os dias de treino já marcados', () => {
    const cover = readExisting([], [createWorkout({ weekdays: [1, 3, 5] })]);
    expect(cover.workoutDays).toEqual([1, 3, 5]);
  });

  it('desconta do pedido o que já está feito', () => {
    const cover = readExisting(
      [createHabit({ title: 'Beber 2 L de água', frequency: 'daily' })],
      [createWorkout({ weekdays: [1, 3] })],
    );
    const falta = subtractExisting(
      request({ workouts: 4, runs: 2, walksDaily: true, water: true }),
      cover,
    );
    expect(falta.workouts).toBe(2);
    expect(falta.water).toBe(false);
    expect(falta.walksDaily).toBe(true);
    // Os dias que já têm treino não recebem outro.
    expect(falta.excludedWeekdays).toEqual(expect.arrayContaining([1, 3]));
  });

  it('não propõe nada quando já está tudo coberto', () => {
    const cover = readExisting(
      [
        createHabit({ title: 'Caminhar', frequency: 'daily' }),
        createHabit({ title: 'Beber água', frequency: 'daily' }),
      ],
      [createWorkout({ weekdays: [1, 3, 5] })],
    );
    const falta = subtractExisting(
      request({ workouts: 3, walksDaily: true, water: true }),
      cover,
    );
    const plan = planWeek(falta, []);
    expect(plan.items).toHaveLength(0);
  });
});
