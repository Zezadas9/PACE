import { describe, expect, it } from 'vitest';
import { createActivityGoal, createActivitySession } from '../core/factories';
import type { ActivitySession, ActivityTrackPoint } from '../core/types';
import {
  elapsedSec, goalProgress, goalWindow, haversineM, history, isRunning,
  metricsOf, paceSecPerKm, shouldRecordPoint, speedKmh, totals,
  trackDistanceM, trackElevationGainM, weeklyBuckets,
} from './activity';

const TODAY = '2026-08-31';

function point(lat: number, lon: number, t = 0, altitudeM: number | null = null): ActivityTrackPoint {
  return { lat, lon, t, altitudeM };
}

function done(partial: Partial<ActivitySession> = {}): ActivitySession {
  return createActivitySession({
    date: TODAY,
    startedAt: '2026-08-31T08:00:00.000Z',
    endedAt: '2026-08-31T08:30:00.000Z',
    durationSec: 1800,
    ...partial,
  });
}

describe('haversineM', () => {
  it('measures a known distance', () => {
    // One degree of latitude is about 111 km anywhere on the globe.
    expect(haversineM(point(0, 0), point(1, 0))).toBeCloseTo(111195, -2);
  });

  it('shrinks a degree of longitude with latitude', () => {
    const atEquator = haversineM(point(0, 0), point(0, 1));
    const atLisbon = haversineM(point(38.7, 0), point(38.7, 1));
    expect(atLisbon).toBeLessThan(atEquator);
    expect(atLisbon / atEquator).toBeCloseTo(Math.cos((38.7 * Math.PI) / 180), 2);
  });

  it('is zero for the same point', () => {
    expect(haversineM(point(38.7, -9.1), point(38.7, -9.1))).toBe(0);
  });
});

describe('trackDistanceM', () => {
  it('sums the legs', () => {
    const track = [point(38.7, -9.1), point(38.701, -9.1), point(38.702, -9.1)];
    const total = trackDistanceM(track);
    expect(total).toBeGreaterThan(200);
    expect(total).toBeLessThan(230);
  });

  it('is zero for fewer than two points', () => {
    expect(trackDistanceM([])).toBe(0);
    expect(trackDistanceM([point(38.7, -9.1)])).toBe(0);
  });
});

describe('trackElevationGainM', () => {
  it('counts climbs and ignores the descent', () => {
    const track = [
      point(0, 0, 0, 100), point(0, 0, 1, 110), point(0, 0, 2, 105),
      point(0, 0, 3, 120),
    ];
    // +10 from 100, then the dip resets the reference at 105, then +15.
    expect(trackElevationGainM(track)).toBe(25);
  });

  it('ignores wobble below the threshold', () => {
    const flat = [
      point(0, 0, 0, 100), point(0, 0, 1, 101.5), point(0, 0, 2, 99),
      point(0, 0, 3, 100.5),
    ];
    expect(trackElevationGainM(flat)).toBe(0);
  });

  it('is zero without altitude data', () => {
    expect(trackElevationGainM([point(0, 0), point(0, 1)])).toBe(0);
  });
});

describe('shouldRecordPoint', () => {
  it('always records the first fix', () => {
    expect(shouldRecordPoint([], point(38.7, -9.1))).toBe(true);
  });

  it('rejects fixes that are standing still', () => {
    const track = [point(38.7, -9.1)];
    expect(shouldRecordPoint(track, point(38.70001, -9.1))).toBe(false);
    expect(shouldRecordPoint(track, point(38.7002, -9.1))).toBe(true);
  });
});

describe('pace and speed', () => {
  it('computes minutes per kilometre', () => {
    // 5 km in 25 minutes is 5:00 per km.
    expect(paceSecPerKm(5000, 1500)).toBe(300);
  });

  it('computes kilometres per hour', () => {
    expect(speedKmh(20000, 3600)).toBe(20);
  });

  it('refuses to divide by nothing', () => {
    expect(paceSecPerKm(0, 600)).toBeNull();
    expect(paceSecPerKm(5000, 0)).toBeNull();
    expect(speedKmh(null, 600)).toBeNull();
  });
});

describe('elapsedSec', () => {
  it('reports the stored duration once finished', () => {
    expect(elapsedSec(done({ durationSec: 1800 }), new Date())).toBe(1800);
  });

  it('measures from the clock while running', () => {
    const session = createActivitySession({
      startedAt: '2026-08-31T08:00:00.000Z', endedAt: null, durationSec: null,
    });
    expect(elapsedSec(session, new Date('2026-08-31T08:12:30.000Z'))).toBe(750);
  });

  it('excludes time spent paused', () => {
    const session = createActivitySession({
      startedAt: '2026-08-31T08:00:00.000Z', endedAt: null, durationSec: null,
      pausedTotalSec: 120,
    });
    expect(elapsedSec(session, new Date('2026-08-31T08:10:00.000Z'))).toBe(480);
  });

  it('stops counting while paused', () => {
    const session = createActivitySession({
      startedAt: '2026-08-31T08:00:00.000Z', endedAt: null, durationSec: null,
      pausedAt: '2026-08-31T08:05:00.000Z',
    });
    // Five minutes later the clock still reads five minutes.
    expect(elapsedSec(session, new Date('2026-08-31T08:10:00.000Z'))).toBe(300);
  });

  it('is zero before the session starts', () => {
    expect(elapsedSec(createActivitySession({ startedAt: null, durationSec: null }))).toBe(0);
  });
});

describe('isRunning', () => {
  it('is true only between start and end', () => {
    expect(isRunning(createActivitySession({ startedAt: null }))).toBe(false);
    expect(isRunning(createActivitySession({ startedAt: 'x', endedAt: null }))).toBe(true);
    expect(isRunning(done())).toBe(false);
  });
});

describe('metricsOf', () => {
  it('derives pace and speed from distance and time', () => {
    const m = metricsOf(done({ type: 'run', distanceM: 5000, durationSec: 1500 }));
    expect(m.paceSecPerKm).toBe(300);
    expect(m.speedKmh).toBe(12);
    expect(m.paceMode).toBe('pace');
  });

  it('reads a ride by speed rather than pace', () => {
    expect(metricsOf(done({ type: 'ride' })).paceMode).toBe('speed');
  });

  it('prefers an average the device reported over one we computed', () => {
    const m = metricsOf(done({ distanceM: 5000, durationSec: 1500, avgPaceSecPerKm: 288 }));
    expect(m.paceSecPerKm).toBe(288);
  });

  it('falls back to the track when no distance was stored', () => {
    const session = done({
      distanceM: null,
      track: [point(38.7, -9.1), point(38.71, -9.1)],
    });
    expect(metricsOf(session).distanceM).toBeGreaterThan(1000);
  });
});

describe('goalWindow', () => {
  it('is the day for a daily goal', () => {
    const goal = createActivityGoal({ period: 'day' });
    expect(goalWindow(goal, TODAY)).toEqual({ from: TODAY, to: TODAY });
  });

  it('is Monday to Sunday for a weekly goal', () => {
    const goal = createActivityGoal({ period: 'week' });
    // 2026-08-31 is a Monday.
    expect(goalWindow(goal, TODAY)).toEqual({ from: '2026-08-31', to: '2026-09-06' });
    expect(goalWindow(goal, '2026-09-06')).toEqual({ from: '2026-08-31', to: '2026-09-06' });
  });
});

describe('goalProgress', () => {
  const sessions = [
    done({ type: 'run', date: '2026-08-31', distanceM: 8000, durationSec: 2400 }),
    done({ type: 'run', date: '2026-09-02', distanceM: 6000, durationSec: 1800 }),
    done({ type: 'ride', date: '2026-09-03', distanceM: 20000, durationSec: 3600 }),
    // Still running: must not count.
    createActivitySession({ type: 'run', date: '2026-09-04', distanceM: 5000, endedAt: null }),
    // Last week: outside the window.
    done({ type: 'run', date: '2026-08-24', distanceM: 10000 }),
  ];

  it('counts distance for one type inside the week', () => {
    const goal = createActivityGoal({
      activityType: 'run', metric: 'distance', target: 20000, period: 'week',
    });
    const p = goalProgress(goal, sessions, TODAY);
    expect(p.current).toBe(14000);
    expect(p.remaining).toBe(6000);
    expect(p.complete).toBe(false);
    expect(p.ratio).toBeCloseTo(0.7, 5);
  });

  it('counts sessions', () => {
    const goal = createActivityGoal({
      activityType: 'ride', metric: 'sessions', target: 3, period: 'week',
    });
    expect(goalProgress(goal, sessions, TODAY).current).toBe(1);
  });

  it('counts duration for a daily goal', () => {
    const goal = createActivityGoal({
      activityType: null, metric: 'duration', target: 1800, period: 'day',
    });
    const p = goalProgress(goal, sessions, '2026-08-31');
    expect(p.current).toBe(2400);
    expect(p.complete).toBe(true);
    expect(p.ratio).toBe(1);
  });

  it('accepts any type when none is set', () => {
    const goal = createActivityGoal({ metric: 'sessions', target: 10, period: 'week' });
    expect(goalProgress(goal, sessions, TODAY).current).toBe(3);
  });
});

describe('weeklyBuckets', () => {
  it('buckets by Monday and weights pace by distance', () => {
    const sessions = [
      done({ date: '2026-08-31', distanceM: 5000, durationSec: 1500 }),
      done({ date: '2026-09-02', distanceM: 5000, durationSec: 1800 }),
    ];
    const buckets = weeklyBuckets(sessions, 1, TODAY);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]?.start).toBe('2026-08-31');
    expect(buckets[0]?.sessions).toBe(2);
    expect(buckets[0]?.distanceM).toBe(10000);
    // 3300 s over 10 km is 5:30 per km, not the mean of 5:00 and 6:00 by session.
    expect(buckets[0]?.paceSecPerKm).toBe(330);
  });

  it('returns an empty bucket per week with nothing in it', () => {
    expect(weeklyBuckets([], 4, TODAY).map((b) => b.sessions)).toEqual([0, 0, 0, 0]);
  });
});

describe('totals and history', () => {
  const sessions = [
    done({ date: '2026-08-29', distanceM: 5000, durationSec: 1500, elevationGainM: 40 }),
    done({ date: '2026-08-31', distanceM: 12000, durationSec: 3600, elevationGainM: 80 }),
    // Too short to count toward a personal best pace.
    done({ date: '2026-08-30', distanceM: 400, durationSec: 60 }),
    createActivitySession({ date: '2026-08-31', endedAt: null, distanceM: 9000 }),
  ];

  it('sums only finished sessions', () => {
    const t = totals(sessions);
    expect(t.sessions).toBe(3);
    expect(t.distanceM).toBe(17400);
    expect(t.elevationGainM).toBe(120);
    expect(t.longestDistanceM).toBe(12000);
  });

  it('ignores sprints when picking the best pace', () => {
    // The 400 m at 2:30/km would otherwise win.
    expect(totals(sessions).bestPaceSecPerKm).toBe(300);
  });

  it('lists history newest first', () => {
    expect(history(sessions).map((s) => s.date)).toEqual(['2026-08-31', '2026-08-30', '2026-08-29']);
    expect(history(sessions, 2)).toHaveLength(2);
  });
});

describe('goalWindow — períodos novos', () => {
  it('abre um mês inteiro', () => {
    const goal = createActivityGoal({ period: 'month' });
    expect(goalWindow(goal, '2026-08-14')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('não fecha um objetivo total', () => {
    const goal = createActivityGoal({ period: 'total' });
    const window = goalWindow(goal, TODAY);
    expect(window.to).toBe(TODAY);
    expect(window.from < '2000-01-01').toBe(true);
  });
});

describe('goalProgress — ritmo e velocidade', () => {
  it('devolve null enquanto não houver nada medido', () => {
    const goal = createActivityGoal({ metric: 'pace', period: 'week', target: 300 });
    const progress = goalProgress(goal, [], TODAY);
    expect(progress.current).toBeNull();
    expect(progress.complete).toBe(false);
    expect(progress.sessions).toBe(0);
  });

  it('cumpre um objetivo de ritmo quando fica abaixo do alvo', () => {
    const goal = createActivityGoal({ metric: 'pace', period: 'week', target: 300 });
    const progress = goalProgress(goal, [done({ distanceM: 5000, durationSec: 1400 })], TODAY);
    expect(progress.lowerIsBetter).toBe(true);
    expect(progress.current).toBe(280);
    expect(progress.complete).toBe(true);
    expect(progress.remaining).toBe(0);
  });

  it('mede o que falta ao ritmo quando ainda está acima', () => {
    const goal = createActivityGoal({ metric: 'pace', period: 'week', target: 300 });
    const progress = goalProgress(goal, [done({ distanceM: 5000, durationSec: 1650 })], TODAY);
    expect(progress.current).toBe(330);
    expect(progress.complete).toBe(false);
    expect(progress.remaining).toBe(30);
  });

  it('guarda a velocidade em décimas de km/h', () => {
    const goal = createActivityGoal({ metric: 'speed', period: 'week', target: 100 });
    const progress = goalProgress(goal, [done({ distanceM: 12000, durationSec: 3600 })], TODAY);
    expect(progress.current).toBe(120); // 12 km/h
    expect(progress.lowerIsBetter).toBe(false);
    expect(progress.complete).toBe(true);
  });
});

describe('totals — melhor ritmo', () => {
  it('ignora atividades que se medem por velocidade', () => {
    const result = totals([
      done({ type: 'ride', distanceM: 24000, durationSec: 3600 }),
      done({ type: 'run', distanceM: 5000, durationSec: 1500 }),
    ]);
    expect(result.bestPaceSecPerKm).toBe(300);
  });

  it('devolve null quando só houve bicicleta', () => {
    const result = totals([done({ type: 'ride', distanceM: 24000, durationSec: 3600 })]);
    expect(result.bestPaceSecPerKm).toBeNull();
  });
});
