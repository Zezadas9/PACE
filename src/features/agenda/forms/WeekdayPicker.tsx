/** Seven toggles, Monday-first, storing 0=Sunday..6=Saturday. */

import type { ReactElement } from 'react';
import { WEEKDAYS_SHORT } from '../../../core/utils/date';

const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function WeekdayPicker({
  value, onChange,
}: {
  value: number[];
  onChange: (weekdays: number[]) => void;
}): ReactElement {
  const toggle = (day: number): void => {
    onChange(
      value.includes(day)
        ? value.filter((candidate) => candidate !== day)
        : [...value, day].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)),
    );
  };

  return (
    <div className="weekday-picker">
      {ORDER.map((day) => (
        <button
          key={day}
          type="button"
          aria-pressed={value.includes(day)}
          onClick={() => toggle(day)}
        >
          {WEEKDAYS_SHORT[day]}
        </button>
      ))}
    </div>
  );
}
