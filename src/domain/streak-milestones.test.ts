import { describe, expect, it } from 'vitest';
import { milestoneProgress, streakHeat } from './streak';

describe('calor da sequencia', () => {
  it('comeca frio e cresce depressa nos primeiros dias', () => {
    expect(streakHeat(0)).toBe(0);
    expect(streakHeat(1)).toBeGreaterThan(0);
    expect(streakHeat(7) - streakHeat(1)).toBeGreaterThan(0.3);
  });

  it('chega ao maximo ao fim de um mes e nao passa dele', () => {
    expect(streakHeat(30)).toBeCloseTo(1, 5);
    expect(streakHeat(365)).toBe(1);
  });
});

describe('caminho ate ao proximo marco', () => {
  it('conta a partir do marco anterior, nao do zero', () => {
    // Aos 31 dias, a caminho dos 60: esta no principio do troco, nao a meio.
    const progress = milestoneProgress(31, 60);
    expect(progress?.from).toBe(30);
    expect(progress?.ratio).toBeCloseTo(1 / 30, 5);
    expect(progress?.left).toBe(29);
  });

  it('antes do primeiro marco conta do zero', () => {
    expect(milestoneProgress(0, 3)).toEqual({ from: 0, to: 3, ratio: 0, left: 3 });
    expect(milestoneProgress(2, 3)?.ratio).toBeCloseTo(2 / 3, 5);
  });

  it('sem marco a frente nao ha caminho', () => {
    expect(milestoneProgress(400, null)).toBeNull();
  });
});
