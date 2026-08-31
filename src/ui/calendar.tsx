/**
 * Calendar surfaces.
 *
 * Pure presentation: every cell arrives pre-computed by the agenda service, so
 * these components only decide how a day looks, never whether it was perfect.
 */

import type { ReactElement } from 'react';
import { MONTHS_SHORT, WEEKDAYS_SHORT } from '../core/utils/date';
import type { DayKey } from '../core/types';
import type { DaySummary } from '../domain/progress';
import type { MonthCell, YearMonth } from '../services/agenda';

const WEEK_HEADS = [1, 2, 3, 4, 5, 6, 0] as const; // Monday-first

/** The seven-day strip used on Today and above the day view. */
export function WeekStrip({
  days, selected, onSelect,
}: {
  days: DaySummary[];
  selected?: DayKey;
  onSelect?: (date: DayKey) => void;
}): ReactElement {
  return (
    <div className="week">
      {days.map((day) => {
        const content = (
          <>
            <span>{day.label}</span>
            <span className="pip">{day.day}</span>
          </>
        );
        if (!onSelect) {
          return (
            <div key={day.date} className="day" data-state={day.state}>
              {content}
            </div>
          );
        }
        return (
          <button
            key={day.date}
            type="button"
            className="day"
            data-state={day.state}
            data-selected={String(day.date === selected)}
            onClick={() => onSelect(day.date)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export function MonthGrid({
  weeks, selected, onSelect,
}: {
  weeks: MonthCell[][];
  selected: DayKey;
  onSelect: (date: DayKey) => void;
}): ReactElement {
  return (
    <div className="month-grid">
      <div className="month-heads" aria-hidden="true">
        {WEEK_HEADS.map((index, i) => (
          <span key={i}>{WEEKDAYS_SHORT[index]}</span>
        ))}
      </div>
      {weeks.map((week, weekIndex) => (
        <div className="month-week" key={week[0]?.date ?? weekIndex}>
          {week.map((cell) => (
            <button
              key={cell.date}
              type="button"
              className="month-cell"
              data-state={cell.state}
              data-outside={String(!cell.inMonth)}
              data-selected={String(cell.date === selected)}
              onClick={() => onSelect(cell.date)}
              aria-label={cell.date}
            >
              <span className="num">{cell.day}</span>
              <span className="marks" aria-hidden="true">
                {cell.hasEvents ? <i className="mark mark-event" /> : null}
                {cell.hasTasks ? <i className="mark mark-task" /> : null}
                {cell.hasHabits ? <i className="mark mark-habit" /> : null}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Twelve mini-months. Each day is a square whose tone says nothing happened,
 * something happened, or the day was perfect — a year at a glance.
 */
export function YearGrid({
  months, onSelectMonth,
}: {
  months: YearMonth[];
  onSelectMonth: (anchor: DayKey) => void;
}): ReactElement {
  return (
    <div className="year-grid">
      {months.map((month) => (
        <button
          key={month.index}
          type="button"
          className="year-month"
          onClick={() => onSelectMonth(month.anchor)}
        >
          <div className="row row-between">
            <span className="t-eyebrow">{MONTHS_SHORT[month.index]}</span>
            <span className="t-sm muted-2">{month.perfectDays}</span>
          </div>
          <div className="year-days" aria-hidden="true">
            {month.intensity.map((level, dayIndex) => (
              <i key={dayIndex} data-level={level} />
            ))}
          </div>
        </button>
      ))}
    </div>
  );
}

/** Prev / label / next, plus a jump back to today. */
export function DateNavigator({
  label, onPrev, onNext, onToday, showToday,
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  showToday: boolean;
}): ReactElement {
  return (
    <div className="date-nav">
      <button type="button" className="btn-icon" onClick={onPrev} aria-label="Anterior">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
      </button>
      <div className="date-nav-label">
        <span className="t-h2">{label}</span>
      </div>
      <button type="button" className="btn-icon" onClick={onNext} aria-label="Seguinte">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
      </button>
      <button
        type="button"
        className="date-nav-today"
        onClick={onToday}
        style={{ visibility: showToday ? 'visible' : 'hidden' }}
      >
        Hoje
      </button>
    </div>
  );
}
