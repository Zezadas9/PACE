/**
 * Day / month / year, as three explicit controls.
 *
 * Replaces `<input type="date">`, which was the cause of a real bug: its
 * rendering and typing rules differ per browser and per platform, the year
 * segment is easy to skip on a phone, and a half-typed value silently reports
 * itself as empty. A birth year is the one field a user must be able to type
 * directly, so it gets its own numeric input rather than a picker.
 *
 * Emits a "YYYY-MM-DD" key only when all three parts form a real date, and
 * `null` otherwise — a 31 February never escapes this component.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { MONTHS_LONG } from '../core/utils/date';
import type { DayKey } from '../core/types';

interface Parts {
  day: string;
  month: string;
  year: string;
}

function split(value: DayKey | null): Parts {
  if (!value) return { day: '', month: '', year: '' };
  const [year = '', month = '', day = ''] = value.split('-');
  return { day: String(Number(day) || ''), month: String(Number(month) || ''), year };
}

/** Combines the parts only when they describe a date that actually exists. */
function join(parts: Parts): DayKey | null {
  const day = Number(parts.day);
  const month = Number(parts.month);
  const year = Number(parts.year);
  if (!day || !month || !year) return null;
  if (parts.year.length !== 4) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  // Rolled over (31 April, 29 February in a common year): not a real date.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function DateField({
  value, onChange, invalid, idPrefix = 'date',
}: {
  value: DayKey | null;
  onChange: (value: DayKey | null) => void;
  invalid?: boolean;
  idPrefix?: string;
}): ReactElement {
  const [parts, setParts] = useState<Parts>(() => split(value));

  // Follow the model when it changes from outside (loading an existing profile).
  useEffect(() => {
    const next = split(value);
    setParts((current) => (join(current) === value ? current : next));
  }, [value]);

  const update = (patch: Partial<Parts>): void => {
    const next = { ...parts, ...patch };
    setParts(next);
    onChange(join(next));
  };

  const digits = (raw: string, max: number): string =>
    raw.replace(/\D/g, '').slice(0, max);

  return (
    <div className="date-field" aria-invalid={invalid || undefined}>
      <input
        id={`${idPrefix}-day`}
        className="input"
        inputMode="numeric"
        placeholder="Dia"
        aria-label="Dia"
        value={parts.day}
        maxLength={2}
        onChange={(event) => update({ day: digits(event.target.value, 2) })}
      />
      <select
        id={`${idPrefix}-month`}
        className="input"
        aria-label="Mês"
        value={parts.month}
        onChange={(event) => update({ month: event.target.value })}
      >
        <option value="">Mês</option>
        {MONTHS_LONG.map((name, index) => (
          <option key={name} value={index + 1}>{name}</option>
        ))}
      </select>
      <input
        id={`${idPrefix}-year`}
        className="input"
        inputMode="numeric"
        placeholder="Ano"
        aria-label="Ano"
        value={parts.year}
        maxLength={4}
        onChange={(event) => update({ year: digits(event.target.value, 4) })}
      />
    </div>
  );
}
