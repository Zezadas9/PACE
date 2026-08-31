import { describe, expect, it } from 'vitest';
import { bmi, bmiBand, bmiScalePosition, healthyWeightRangeKg } from './metrics';

describe('bmi', () => {
  it('computes from metric values', () => {
    expect(bmi(72, 178)).toBe(22.7);
    expect(bmi(95, 170)).toBe(32.9);
    expect(bmi(85, 180)).toBe(26.2);
  });

  it('refuses inputs it cannot trust', () => {
    expect(bmi(72, null)).toBeNull();
    expect(bmi(null, 178)).toBeNull();
    expect(bmi(72, 20)).toBeNull();
    expect(bmi(5, 178)).toBeNull();
    expect(bmi(Number.NaN, 178)).toBeNull();
  });
});

describe('bmiBand', () => {
  it('places values in the WHO bands', () => {
    expect(bmiBand(18.4)?.id).toBe('under');
    expect(bmiBand(18.5)?.id).toBe('normal');
    expect(bmiBand(24.9)?.id).toBe('normal');
    expect(bmiBand(25)?.id).toBe('over');
    expect(bmiBand(30)?.id).toBe('obese1');
    expect(bmiBand(35)?.id).toBe('obese2');
    expect(bmiBand(41)?.id).toBe('obese3');
  });

  it('has no gap at a boundary', () => {
    expect(bmiBand(29.999)?.id).toBe('over');
    expect(bmiBand(null)).toBeNull();
  });
});

describe('bmiScalePosition', () => {
  it('clamps to the visible 15..40 range', () => {
    expect(bmiScalePosition(15)).toBe(0);
    expect(bmiScalePosition(40)).toBe(1);
    expect(bmiScalePosition(10)).toBe(0);
    expect(bmiScalePosition(50)).toBe(1);
  });
});

describe('healthyWeightRangeKg', () => {
  it('brackets the normal band for a height', () => {
    expect(healthyWeightRangeKg(178)).toEqual({ minKg: 58.6, maxKg: 78.9 });
    expect(healthyWeightRangeKg(null)).toBeNull();
  });
});
