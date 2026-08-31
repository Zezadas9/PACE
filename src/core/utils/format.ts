/** Display formatting. Portuguese by default, unit-aware. */

import type { DistanceUnit, HeightUnit, WeightUnit } from '../types';
import { distance as distanceUnits, length, mass } from './units';

export function number(value: number | null | undefined, places?: number): string {
  if (value == null || Number.isNaN(value)) return '—';
  return Number(value).toLocaleString('pt-PT', {
    minimumFractionDigits: places ?? 0,
    maximumFractionDigits: places ?? 1,
  });
}

/** "72 kg" — one decimal only when it carries information. */
export function weight(kg: number | null, unit: WeightUnit, withUnit = true): string {
  if (kg == null) return '—';
  return number(mass.fromKg(kg, unit)) + (withUnit ? ` ${unit}` : '');
}

/** "178 cm" or "5 ft 10 in" */
export function height(cm: number | null, unit: HeightUnit): string {
  if (cm == null) return '—';
  if (unit === 'ft_in') {
    const { feet, inches } = length.cmToFtIn(cm);
    return `${feet} ft ${inches} in`;
  }
  return `${number(cm, 0)} cm`;
}

export function distance(meters: number | null, unit: DistanceUnit): string {
  if (meters == null) return '—';
  return `${number(distanceUnits.fromMeters(meters, unit), 1)} ${unit}`;
}

/** 5400 -> "1h 30m", 900 -> "15m" */
export function duration(seconds: number | null): string {
  if (seconds == null) return '—';
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

/** Seconds per km -> "5:24 /km" */
export function pace(secPerKm: number | null, unit: DistanceUnit = 'km'): string {
  if (secPerKm == null) return '—';
  const perUnit = unit === 'mi' ? secPerKm * 1.609344 : secPerKm;
  let minutes = Math.floor(perUnit / 60);
  let seconds = Math.round(perUnit % 60);
  if (seconds === 60) { minutes += 1; seconds = 0; }
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds} /${unit}`;
}

export function percent(ratio: number | null): string {
  if (ratio == null || Number.isNaN(ratio)) return '—';
  return `${Math.round(ratio * 100)}%`;
}

export function kcal(value: number | null): string {
  if (value == null) return '—';
  return `${number(Math.round(value), 0)} kcal`;
}

/** "Ana Maria" -> "AM" */
export function initials(name: string | null | undefined): string {
  if (!name) return '·';
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function firstName(name: string | null | undefined): string {
  if (!name) return '';
  return String(name).trim().split(/\s+/)[0] ?? '';
}
