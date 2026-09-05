import { describe, expect, it } from 'vitest';
import { createSleepEntry } from '../core/factories';
import type { SleepEntry } from '../core/types';
import { durationOf, entryFor, inWindow, minutesBetween, stats } from './sleep';

const TODAY = '2026-09-05';

function night(date: string, partial: Partial<SleepEntry> = {}): SleepEntry {
  return createSleepEntry({ date, ...partial });
}

describe('minutesBetween', () => {
  it('atravessa a meia-noite', () => {
    expect(minutesBetween('23:30', '07:00')).toBe(450);
  });

  it('conta uma noite que começa depois da meia-noite', () => {
    expect(minutesBetween('01:00', '08:00')).toBe(420);
  });

  it('não inventa duração sem as duas horas', () => {
    expect(minutesBetween('23:00', null)).toBeNull();
    expect(minutesBetween(null, '07:00')).toBeNull();
  });

  it('recusa um intervalo impossível, que é quase de certeza um engano', () => {
    // Deitar às 08:00 e acordar às 07:00 dá 23 horas na cama.
    expect(minutesBetween('08:00', '07:00')).toBeNull();
  });
});

describe('durationOf', () => {
  it('usa o que foi escrito à mão quando existe', () => {
    expect(durationOf(night(TODAY, { durationMin: 400, bedtime: '23:00', wakeTime: '07:00' })))
      .toBe(400);
  });

  it('deriva das horas quando não há duração escrita', () => {
    expect(durationOf(night(TODAY, { bedtime: '23:00', wakeTime: '07:00' }))).toBe(480);
  });

  it('é null quando não há nada', () => {
    expect(durationOf(night(TODAY))).toBeNull();
  });
});

describe('stats', () => {
  it('não devolve médias sem noites', () => {
    const result = stats([]);
    expect(result.nights).toBe(0);
    expect(result.averageMin).toBeNull();
    expect(result.averageQuality).toBeNull();
    expect(result.bedtimeSpreadMin).toBeNull();
  });

  /**
   * Uma noite registada sem horas continua a ser uma noite registada — mas não
   * entra na média de duração. O denominador é `measured`, e é por isso que ele
   * existe.
   */
  it('conta as noites registadas e mede só as que têm duração', () => {
    const result = stats([
      night('2026-09-05', { durationMin: 480 }),
      night('2026-09-04', { quality: 3 }),
      night('2026-09-03', { durationMin: 420 }),
    ]);
    expect(result.nights).toBe(3);
    expect(result.measured).toBe(2);
    expect(result.averageMin).toBe(450);
  });

  it('conta as noites em que dormiu o recomendado', () => {
    const result = stats([
      night('2026-09-05', { durationMin: 480 }),
      night('2026-09-04', { durationMin: 360 }),
      night('2026-09-03', { durationMin: 420 }),
    ]);
    expect(result.goodNights).toBe(2);
  });

  it('mede a variação da hora de deitar, e trata a madrugada como noite tardia', () => {
    const result = stats([
      night('2026-09-05', { bedtime: '23:00' }),
      night('2026-09-04', { bedtime: '00:30' }),
      night('2026-09-03', { bedtime: '23:30' }),
    ]);
    // De 23:00 a 00:30 são noventa minutos, e não vinte e duas horas e meia.
    expect(result.bedtimeSpreadMin).toBe(90);
  });

  it('não fala de regularidade com menos de três noites', () => {
    const result = stats([
      night('2026-09-05', { bedtime: '23:00' }),
      night('2026-09-04', { bedtime: '01:00' }),
    ]);
    expect(result.bedtimeSpreadMin).toBeNull();
  });
});

describe('inWindow e entryFor', () => {
  const nights = [
    night('2026-09-05', { durationMin: 480 }),
    night('2026-09-01', { durationMin: 420 }),
    night('2026-08-20', { durationMin: 400 }),
  ];

  it('corta pela janela pedida', () => {
    expect(inWindow(nights, 7, TODAY)).toHaveLength(2);
    expect(inWindow(nights, 30, TODAY)).toHaveLength(3);
  });

  it('devolve as noites da mais recente para a mais antiga', () => {
    expect(inWindow(nights, 30, TODAY)[0]?.date).toBe('2026-09-05');
  });

  it('encontra a noite de um dia', () => {
    expect(entryFor(nights, '2026-09-01')?.durationMin).toBe(420);
    expect(entryFor(nights, '2026-09-02')).toBeNull();
  });
});
