import { describe, expect, it } from 'vitest';
import { duration, shortDuration } from './format';

describe('duracao curta', () => {
  it('nao arredonda ao minuto', () => {
    expect(shortDuration(90)).toBe('1 min 30 s');
    expect(shortDuration(60)).toBe('1 min');
    expect(shortDuration(45)).toBe('45 s');
    expect(shortDuration(300)).toBe('5 min');
  });

  it('ao contrario da duracao longa, que arredonda', () => {
    // O motivo de existir a curta: 90 s nao sao 2 minutos.
    expect(duration(90)).toBe('2m');
  });
});
