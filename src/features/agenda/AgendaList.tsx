/**
 * The list of everything happening on one day.
 *
 * Completion is one tap on the row — the whole row, not a small checkbox — and
 * a counted habit advances by one per tap rather than jumping to done.
 */

import type { ReactElement } from 'react';
import { fromMinutes } from '../../core/scheduling';
import type { DayKey } from '../../core/types';
import { Icon } from '../../ui/Icon';
import { Card } from '../../ui/primitives';
import type { AgendaItem, DayAgenda } from '../../services/agenda';

export function AgendaList({
  agenda, onComplete, onFill, onOpen,
}: {
  agenda: DayAgenda;
  onComplete: (item: AgendaItem, date: DayKey) => void;
  onFill: (item: AgendaItem, date: DayKey) => void;
  onOpen: (item: AgendaItem) => void;
}): ReactElement {
  const isEmpty = agenda.timed.length === 0 && agenda.untimed.length === 0;

  if (isEmpty) {
    return (
      <div className="day-empty">
        <p className="t-h2">Nada marcado</p>
        <p className="t-sm">Toca em + para criar um evento, tarefa ou hábito.</p>
      </div>
    );
  }

  return (
    <div className="stack stack-5">
      {agenda.timed.length > 0 ? (
        <section className="agenda-group">
          <Card variant="flush">
            <div className="rows">
              {agenda.timed.map((item) => (
                <AgendaRow
                  key={item.key}
                  item={item}
                  date={agenda.date}
                  onComplete={onComplete}
                  onFill={onFill}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </Card>
        </section>
      ) : null}

      {agenda.untimed.length > 0 ? (
        <section className="agenda-group">
          <p className="t-eyebrow" style={{ marginBottom: 'var(--s-2)' }}>
            Sem hora
          </p>
          <Card variant="flush">
            <div className="rows">
              {agenda.untimed.map((item) => (
                <AgendaRow
                  key={item.key}
                  item={item}
                  date={agenda.date}
                  onComplete={onComplete}
                  onFill={onFill}
                  onOpen={onOpen}
                />
              ))}
            </div>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

export function AgendaRow({
  item, date, onComplete, onFill, onOpen,
}: {
  item: AgendaItem;
  date: DayKey;
  onComplete: (item: AgendaItem, date: DayKey) => void;
  onFill: (item: AgendaItem, date: DayKey) => void;
  onOpen: (item: AgendaItem) => void;
}): ReactElement {
  const completable = item.done !== null;

  return (
    <div className="row-item" data-done={String(item.done === true)} data-hue={item.hue}>
      <span className="agenda-kind" aria-hidden="true" />
      {item.startMinutes != null ? (
        <span className="agenda-time">{fromMinutes(item.startMinutes)}</span>
      ) : null}

      {completable ? (
        <button
          type="button"
          className="tick"
          aria-label={item.done ? `Desmarcar ${item.title}` : `Concluir ${item.title}`}
          aria-pressed={!!item.done}
          onClick={() => onComplete(item, date)}
        >
          <Icon name="check" />
        </button>
      ) : (
        <span className="lead" aria-hidden="true">
          <Icon name="calendar" />
        </span>
      )}

      <button type="button" className="grow agenda-open" onClick={() => onOpen(item)}>
        <span className="title">
          {item.title}
          {item.essential ? <i className="essential-dot" aria-label="essencial" /> : null}
        </span>
        {item.subtitle ? <span className="sub">{item.subtitle}</span> : null}
        {item.kind === 'habit' && item.ratio > 0 && item.ratio < 1 ? (
          <span className="row-meter" aria-hidden="true">
            <i style={{ width: `${Math.round(item.ratio * 100)}%` }} />
          </span>
        ) : null}
      </button>

      {item.target > 1 && !item.done ? (
        <button
          type="button"
          className="fill-all"
          onClick={() => onFill(item, date)}
          aria-label={`Concluir tudo: ${item.title}`}
        >
          Tudo
        </button>
      ) : null}
    </div>
  );
}
