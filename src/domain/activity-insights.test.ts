import { describe, expect, it } from 'vitest';
import { createActivitySession } from '../core/factories';
import type { ActivitySession } from '../core/types';
import {
  estimateCalories, frequencyStats, insights, personalRecords, sessionsInPeriod, summarizePeriod,
} from './activity-insights';

const TODAY = '2026-08-31'; // uma segunda-feira

function done(date: string, partial: Partial<ActivitySession> = {}): ActivitySession {
  return createActivitySession({
    date,
    startedAt: `${date}T08:00:00.000Z`,
    endedAt: `${date}T08:30:00.000Z`,
    durationSec: 1800,
    ...partial,
  });
}

const format = {
  distance: (m: number) => `${(m / 1000).toFixed(1)} km`,
  duration: (s: number) => `${Math.round(s / 60)} min`,
  pace: (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
};

describe('estimateCalories', () => {
  it('needs a weight to say anything', () => {
    expect(estimateCalories({ type: 'run', durationSec: 1800, distanceM: 5000 }, null)).toBeNull();
  });

  it('ignora sessões demasiado curtas', () => {
    expect(estimateCalories({ type: 'run', durationSec: 30, distanceM: 100 }, 70)).toBeNull();
  });

  it('estima a partir do peso e da duração', () => {
    const estimate = estimateCalories({ type: 'walk', durationSec: 3600, distanceM: null }, 70);
    expect(estimate?.kcal).toBe(245); // 3.5 MET × 70 kg × 1 h
    expect(estimate?.basis).toBe('peso e duração');
  });

  it('afina com o ritmo quando há distância', () => {
    const lento = estimateCalories({ type: 'run', durationSec: 3600, distanceM: 8000 }, 70);
    const rapido = estimateCalories({ type: 'run', durationSec: 3600, distanceM: 14000 }, 70);
    expect(rapido!.kcal).toBeGreaterThan(lento!.kcal);
    expect(rapido?.basis).toBe('peso, duração e ritmo');
  });
});

describe('sessionsInPeriod', () => {
  const sessions = [
    done('2026-08-30'),
    done('2026-08-10'),
    done('2026-01-05'),
    createActivitySession({ date: TODAY }), // a decorrer, não conta
  ];

  it('corta pelos últimos 7 dias', () => {
    expect(sessionsInPeriod(sessions, '7d', TODAY)).toHaveLength(1);
  });

  it('corta pelos últimos 30 dias', () => {
    expect(sessionsInPeriod(sessions, '30d', TODAY)).toHaveLength(2);
  });

  it('devolve tudo o que está terminado', () => {
    expect(sessionsInPeriod(sessions, 'all', TODAY)).toHaveLength(3);
  });
});

describe('summarizePeriod', () => {
  it('devolve null onde não há dados, e não zero', () => {
    const summary = summarizePeriod([done('2026-08-30')]);
    expect(summary.sessions).toBe(1);
    expect(summary.distanceM).toBeNull();
    expect(summary.paceSecPerKm).toBeNull();
    expect(summary.elevationM).toBeNull();
  });

  it('pondera o ritmo pela distância', () => {
    const summary = summarizePeriod([
      done('2026-08-30', { distanceM: 10000, durationSec: 3000 }), // 5:00/km
      done('2026-08-29', { distanceM: 1000, durationSec: 240 }), // 4:00/km
    ]);
    expect(summary.distanceM).toBe(11000);
    // A média ponderada fica perto do ritmo da tirada longa, não a meio.
    expect(summary.paceSecPerKm).toBe(295);
  });
});

describe('frequencyStats', () => {
  it('lida com um histórico vazio', () => {
    const stats = frequencyStats([], TODAY);
    expect(stats.total).toBe(0);
    expect(stats.daysSinceLast).toBeNull();
    expect(stats.weeks).toHaveLength(8);
  });

  it('conta a semana atual e os dias desde a última', () => {
    const stats = frequencyStats([done(TODAY), done('2026-08-26'), done('2026-08-24')], TODAY);
    expect(stats.thisWeek).toBe(1);
    expect(stats.daysSinceLast).toBe(0);
    expect(stats.total).toBe(3);
  });

  it('não dilui a média por semanas anteriores ao primeiro registo', () => {
    const stats = frequencyStats([done('2026-08-25'), done('2026-08-27'), done(TODAY)], TODAY);
    // Duas semanas com registo, três sessões.
    expect(stats.weeklyAverage).toBeCloseTo(1.5, 1);
  });
});

describe('personalRecords', () => {
  it('não inventa recordes sem dados', () => {
    expect(personalRecords([], null, format)).toEqual([]);
  });

  it('ignora ritmos abaixo de um quilómetro', () => {
    const records = personalRecords(
      [done('2026-08-30', { distanceM: 400, durationSec: 60, avgPaceSecPerKm: 150 })],
      null,
      format,
    );
    expect(records.find((record) => record.id === 'fastest')).toBeUndefined();
  });

  it('encontra a maior distância e o ritmo mais rápido', () => {
    const records = personalRecords(
      [
        done('2026-08-30', { distanceM: 10000, durationSec: 3000, avgPaceSecPerKm: 300 }),
        done('2026-08-28', { distanceM: 5000, durationSec: 1200, avgPaceSecPerKm: 240 }),
      ],
      null,
      format,
    );
    expect(records.find((record) => record.id === 'longest')?.value).toBe('10.0 km');
    expect(records.find((record) => record.id === 'fastest')?.when).toBe('2026-08-28');
  });

  it('conta apenas dias seguidos a partir de dois', () => {
    const um = personalRecords([done('2026-08-30', { distanceM: 1000 })], null, format);
    expect(um.find((record) => record.id === 'streak')).toBeUndefined();

    const dois = personalRecords(
      [done('2026-08-30', { distanceM: 1000 }), done('2026-08-29', { distanceM: 1000 })],
      null,
      format,
    );
    expect(dois.find((record) => record.id === 'streak')?.value).toBe('2 dias');
  });

  it('filtra por tipo de atividade', () => {
    const sessions = [
      done('2026-08-30', { type: 'run', distanceM: 5000 }),
      done('2026-08-29', { type: 'ride', distanceM: 30000 }),
    ];
    expect(personalRecords(sessions, 'run', format).find((r) => r.id === 'longest')?.value)
      .toBe('5.0 km');
  });
});

describe('insights', () => {
  it('cala-se sem sessões que cheguem', () => {
    expect(insights([done('2026-08-30'), done('2026-08-29')], TODAY)).toEqual([]);
  });

  it('assinala uma pausa longa', () => {
    const sessions = ['2026-08-01', '2026-08-02', '2026-08-03'].map((date) => done(date));
    const gap = insights(sessions, TODAY).find((insight) => insight.id === 'gap');
    expect(gap?.tone).toBe('caution');
    expect(gap?.text).toContain('28 dias');
  });

  it('nota um esforço percebido alto', () => {
    const sessions = ['2026-08-30', '2026-08-28', '2026-08-26'].map((date) =>
      done(date, { perceivedEffort: 9 }));
    const effort = insights(sessions, TODAY).find((insight) => insight.id === 'effort-high');
    expect(effort?.tone).toBe('caution');
  });

  it('nunca devolve mais de quatro observações', () => {
    const sessions = Array.from({ length: 12 }, (_, i) =>
      done(`2026-08-${String(i + 15).padStart(2, '0')}`, { perceivedEffort: 9, distanceM: 5000, durationSec: 1800 }));
    expect(insights(sessions, TODAY).length).toBeLessThanOrEqual(4);
  });
});

describe('recordes e ritmo por tipo de atividade', () => {
  it('não deixa a bicicleta ganhar o recorde de ritmo', () => {
    const records = personalRecords(
      [
        done('2026-08-30', { type: 'ride', distanceM: 24000, durationSec: 3600, avgPaceSecPerKm: 150 }),
        done('2026-08-28', { type: 'run', distanceM: 5000, durationSec: 1500, avgPaceSecPerKm: 300 }),
      ],
      null,
      format,
    );
    expect(records.find((record) => record.id === 'fastest')?.when).toBe('2026-08-28');
  });
});

describe('summarizePeriod — ritmo e velocidade separados', () => {
  it('não deixa a bicicleta entrar no ritmo médio', () => {
    const summary = summarizePeriod([
      done('2026-08-30', { type: 'ride', distanceM: 24000, durationSec: 3600 }),
      done('2026-08-29', { type: 'run', distanceM: 5000, durationSec: 1500 }),
    ]);
    expect(summary.paceSecPerKm).toBe(300);
    expect(summary.speedKmh).toBeCloseTo(24, 1);
    // A distância total continua a somar tudo: isso não engana ninguém.
    expect(summary.distanceM).toBe(29000);
  });

  it('devolve null no ritmo quando só houve bicicleta', () => {
    const summary = summarizePeriod([
      done('2026-08-30', { type: 'ride', distanceM: 24000, durationSec: 3600 }),
    ]);
    expect(summary.paceSecPerKm).toBeNull();
  });
});
