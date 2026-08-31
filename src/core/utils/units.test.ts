import { describe, expect, it } from 'vitest';
import { distance, heightUnitFor, length, mass } from './units';

describe('mass', () => {
  it('round-trips kilograms through pounds', () => {
    expect(mass.toKg(160, 'lb')).toBe(72.57);
    expect(mass.fromKg(72.57, 'lb')).toBe(160);
    expect(mass.fromKg(72, 'kg')).toBe(72);
  });

  it('passes null through rather than coercing to zero', () => {
    expect(mass.toKg(null, 'lb')).toBeNull();
    expect(mass.fromKg(null, 'kg')).toBeNull();
  });
});

describe('length', () => {
  it('round-trips centimetres through feet and inches', () => {
    expect(length.ftInToCm(5, 10)).toBe(177.8);
    expect(length.cmToFtIn(177.8)).toEqual({ feet: 5, inches: 10 });
    expect(length.cmToFtIn(175.3)).toEqual({ feet: 5, inches: 9 });
  });
});

describe('distance', () => {
  it('converts metres to the display unit', () => {
    expect(distance.fromMeters(1609.344, 'mi')).toBe(1);
    expect(distance.fromMeters(2800, 'km')).toBe(2.8);
    expect(distance.toMeters(5, 'km')).toBe(5000);
  });
});

describe('heightUnitFor', () => {
  it('keeps the height system consistent with the weight system', () => {
    expect(heightUnitFor('kg')).toBe('cm');
    expect(heightUnitFor('lb')).toBe('ft_in');
  });
});
