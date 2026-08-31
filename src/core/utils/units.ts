/**
 * Unit conversion.
 * Storage is metric. These functions exist so a display unit can never leak
 * into a stored value.
 */

import type { DistanceUnit, HeightUnit, WeightUnit } from '../types';

const KG_PER_LB = 0.45359237;
const CM_PER_IN = 2.54;
const M_PER_MI = 1609.344;

export function round(value: number, places = 0): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export const mass = {
  kgToLb: (kg: number): number => kg / KG_PER_LB,
  lbToKg: (lb: number): number => lb * KG_PER_LB,
  /** Metric value -> the number shown in the given unit. */
  fromKg(kg: number | null, unit: WeightUnit): number | null {
    if (kg == null) return null;
    return unit === 'lb' ? round(mass.kgToLb(kg), 1) : round(kg, 1);
  },
  /** Number typed in the given unit -> the metric value we store. */
  toKg(value: number | null, unit: WeightUnit): number | null {
    if (value == null) return null;
    return unit === 'lb' ? round(mass.lbToKg(value), 2) : round(value, 2);
  },
};

export interface FeetInches {
  feet: number;
  inches: number;
}

export const length = {
  cmToIn: (cm: number): number => cm / CM_PER_IN,
  inToCm: (inches: number): number => inches * CM_PER_IN,
  /** 178 cm -> { feet: 5, inches: 10 } */
  cmToFtIn(cm: number): FeetInches {
    const totalInches = Math.round(length.cmToIn(cm));
    return { feet: Math.floor(totalInches / 12), inches: totalInches % 12 };
  },
  ftInToCm(feet: number, inches: number): number {
    return round(length.inToCm((feet || 0) * 12 + (inches || 0)), 1);
  },
};

export const distance = {
  mToKm: (m: number): number => m / 1000,
  mToMi: (m: number): number => m / M_PER_MI,
  fromMeters(meters: number | null, unit: DistanceUnit): number | null {
    if (meters == null) return null;
    return unit === 'mi' ? round(distance.mToMi(meters), 2) : round(distance.mToKm(meters), 2);
  },
  toMeters(value: number | null, unit: DistanceUnit): number | null {
    if (value == null) return null;
    return unit === 'mi' ? round(value * M_PER_MI, 1) : round(value * 1000, 1);
  },
};

/** The height unit that belongs with a chosen weight unit. */
export function heightUnitFor(weightUnit: WeightUnit): HeightUnit {
  return weightUnit === 'lb' ? 'ft_in' : 'cm';
}
