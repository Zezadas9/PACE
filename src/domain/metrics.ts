/**
 * PACE — Body metrics.
 *
 * Pure functions over metric values. No DOM, no storage, no formatting: this is
 * the layer a backend, a native health integration or a future AI feature can
 * reuse verbatim.
 *
 * BMI is a population-level estimate. It ignores body composition, and the app
 * presents it as an indicator only — never as a diagnosis.
 */

import { BMI_BANDS, type BmiBand } from '../core/constants';
import type { DayKey, Gender, User } from '../core/types';
import { ageFromBirthDate } from '../core/utils/date';

export const LIMITS = {
  MIN_HEIGHT_CM: 80,
  MAX_HEIGHT_CM: 260,
  MIN_WEIGHT_KG: 20,
  MAX_WEIGHT_KG: 400,
} as const;

/** BMI rounded to one decimal, or null when the inputs are unusable. */
export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg == null || heightCm == null) return null;
  const w = Number(weightKg);
  const h = Number(heightCm);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  if (h < LIMITS.MIN_HEIGHT_CM || h > LIMITS.MAX_HEIGHT_CM) return null;
  if (w < LIMITS.MIN_WEIGHT_KG || w > LIMITS.MAX_WEIGHT_KG) return null;
  const meters = h / 100;
  return Math.round((w / (meters * meters)) * 10) / 10;
}

export function bmiBand(value: number | null): BmiBand | null {
  if (value == null) return null;
  return BMI_BANDS.find((band) => value >= band.min && value < band.max) ?? null;
}

/** Position of a BMI on a 15–40 visual scale, clamped to 0..1. */
export function bmiScalePosition(value: number | null): number | null {
  if (value == null) return null;
  return Math.min(1, Math.max(0, (value - 15) / (40 - 15)));
}

export interface WeightRange {
  minKg: number;
  maxKg: number;
}

/** The weight range that would land inside the normal band, for reference. */
export function healthyWeightRangeKg(heightCm: number | null): WeightRange | null {
  if (heightCm == null) return null;
  const meters = Number(heightCm) / 100;
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return {
    minKg: Math.round(18.5 * meters * meters * 10) / 10,
    maxKg: Math.round(24.9 * meters * meters * 10) / 10,
  };
}

export function age(birthDate: DayKey | null, reference?: Date): number | null {
  return ageFromBirthDate(birthDate, reference);
}

/**
 * Mifflin-St Jeor resting energy expenditure. Present so nutrition targets have
 * somewhere to come from later; no screen calls it yet.
 */
export function basalMetabolicRate(
  weightKg: number | null,
  heightCm: number | null,
  ageYears: number | null,
  gender: Gender,
): number | null {
  if (weightKg == null || heightCm == null || ageYears == null) return null;
  const value = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  if (gender === 'male') return Math.round(value + 5);
  if (gender === 'female') return Math.round(value - 161);
  return Math.round(value - 78);
}

export interface ProfileMetrics {
  ageYears: number | null;
  heightCm: number | null;
  weightKg: number | null;
  bmi: number | null;
  bmiBand: BmiBand | null;
  bmiLabel: string | null;
  bmiScalePosition: number | null;
  healthyWeightRangeKg: WeightRange | null;
}

/** Everything the profile and the dashboard need, derived from one user. */
export function profileMetrics(user: User | null): ProfileMetrics | null {
  if (!user) return null;
  const value = bmi(user.body.weightKg, user.body.heightCm);
  const band = bmiBand(value);
  return {
    ageYears: age(user.birthDate),
    heightCm: user.body.heightCm,
    weightKg: user.body.weightKg,
    bmi: value,
    bmiBand: band,
    bmiLabel: band?.label ?? null,
    bmiScalePosition: bmiScalePosition(value),
    healthyWeightRangeKg: healthyWeightRangeKg(user.body.heightCm),
  };
}
