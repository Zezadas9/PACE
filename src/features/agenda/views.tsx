/** The four agenda scales. Each receives a ready-made view-model. */

import type { ReactElement } from 'react';
import { MONTHS_LONG } from '../../core/utils/date';
import type { DayKey } from '../../core/types';
import { Card } from '../../ui/primitives';
import { MonthGrid, WeekStrip, YearGrid } from '../../ui/calendar';
import type {
  MonthAgenda, WeekAgenda, YearAgenda,
} from '../../services/agenda';

export function WeekView({
  week, selected, onSelect,
}: {
  week: WeekAgenda;
  selected: DayKey;
  onSelect: (date: DayKey) => void;
}): ReactElement {
  return (
    <div className="stack stack-5">
      <WeekStrip days={week.days} selected={selected} onSelect={onSelect} />
      <Card variant="flush">
        <div className="rows">
          {week.days.map((day) => (
            <button
              key={day.date}
              type="button"
              className="row-item"
              onClick={() => onSelect(day.date)}
            >
              <span className="agenda-time">{day.label}{day.day}</span>
              <span className="grow">
                <span className="title">{describeCounts(day)}</span>
                <span className="sub">
                  {day.isPerfectDay
                    ? 'Dia perfeito'
                    : day.essentialTotal > 0
                      ? `${day.essentialTotal} essenciais`
                      : 'Sem essenciais'}
                </span>
              </span>
              <span className="trail" data-state={day.state}>
                {day.state === 'perfect' ? '🔥' : `${Math.round(day.score * 100)}%`}
              </span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function describeCounts(day: {
  eventCount: number;
  taskCount: number;
  habitCount: number;
}): string {
  const parts: string[] = [];
  if (day.eventCount) parts.push(`${day.eventCount} evento${day.eventCount === 1 ? '' : 's'}`);
  if (day.taskCount) parts.push(`${day.taskCount} tarefa${day.taskCount === 1 ? '' : 's'}`);
  if (day.habitCount) parts.push(`${day.habitCount} hábito${day.habitCount === 1 ? '' : 's'}`);
  return parts.length > 0 ? parts.join(' · ') : 'Nada marcado';
}

export function MonthView({
  month, selected, onSelect,
}: {
  month: MonthAgenda;
  selected: DayKey;
  onSelect: (date: DayKey) => void;
}): ReactElement {
  return (
    <div className="stack stack-5">
      <MonthGrid weeks={month.weeks} selected={selected} onSelect={onSelect} />
      <Card variant="quiet">
        <div className="row row-between">
          <span className="t-sm muted">
            {MONTHS_LONG[month.month]} · {month.perfectDays} dia
            {month.perfectDays === 1 ? '' : 's'} perfeito{month.perfectDays === 1 ? '' : 's'}
          </span>
          <span className="legend" aria-hidden="true">
            <i className="mark mark-event" /> evento
            <i className="mark mark-task" /> tarefa
            <i className="mark mark-habit" /> hábito
          </span>
        </div>
      </Card>
    </div>
  );
}

export function YearView({
  year, onSelectMonth,
}: {
  year: YearAgenda;
  onSelectMonth: (anchor: DayKey) => void;
}): ReactElement {
  return (
    <div className="stack stack-5">
      <Card variant="quiet">
        <div className="grid-2">
          <div className="metric">
            <div className="value">{year.perfectDays}</div>
            <div className="label">Dias perfeitos</div>
          </div>
          <div className="metric">
            <div className="value">{year.activeDays}</div>
            <div className="label">Dias com essenciais</div>
          </div>
        </div>
      </Card>
      <YearGrid months={year.months} onSelectMonth={onSelectMonth} />
    </div>
  );
}
