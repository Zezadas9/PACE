/**
 * Agenda.
 *
 * One screen, four scales. The anchor date is the single piece of state that
 * matters; every view is derived from it, and switching scale keeps the day you
 * were looking at.
 */

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { AGENDA_VIEW_OPTIONS, type AgendaView } from '../../core/constants';
import type { DayKey } from '../../core/types';
import {
  addDaysToKey, addMonthsToKey, addYearsToKey, mediumDate, monthLabel, todayKey,
  weekLabel, yearOf,
} from '../../core/utils/date';
import {
  completeItem, dayAgenda, monthAgenda, setHabitDone, weekAgenda, yearAgenda,
  type AgendaItem,
} from '../../services/agenda';
import { useApp, useFeedback, useStoreVersion } from '../../app/providers/appContext';
import { Screen } from '../../app/navigation/Screen';
import { DateNavigator } from '../../ui/calendar';
import { Fab } from '../../ui/Fab';
import { Segmented } from '../../ui/form';
import { AgendaList } from './AgendaList';
import { CreatePicker, type CreateKind } from './CreatePicker';
import { MonthView, WeekView, YearView } from './views';
import { AgendaSheets, type SheetState } from './AgendaSheets';
import { AskPace } from '../assistant/AskPace';

export function AgendaScreen(): ReactElement {
  const { repos } = useApp();
  const feedback = useFeedback();
  const version = useStoreVersion();

  const [view, setView] = useState<AgendaView>('day');
  const [anchor, setAnchor] = useState<DayKey>(() => todayKey());
  const [sheet, setSheet] = useState<SheetState>(null);

  const today = todayKey();

  const day = useMemo(() => dayAgenda(repos, anchor), [repos, anchor, version]);
  const week = useMemo(
    () => (view === 'week' ? weekAgenda(repos, anchor) : null),
    [repos, anchor, view, version],
  );
  const month = useMemo(
    () => (view === 'month' ? monthAgenda(repos, anchor) : null),
    [repos, anchor, view, version],
  );
  const year = useMemo(
    () => (view === 'year' ? yearAgenda(repos, yearOf(anchor)) : null),
    [repos, anchor, view, version],
  );

  const shift = useCallback(
    (direction: 1 | -1) => {
      setAnchor((current) => {
        switch (view) {
          case 'day': return addDaysToKey(current, direction);
          case 'week': return addDaysToKey(current, 7 * direction);
          case 'month': return addMonthsToKey(current, direction);
          case 'year': return addYearsToKey(current, direction);
          default: return current;
        }
      });
    },
    [view],
  );

  const label = useMemo(() => {
    switch (view) {
      case 'day': return anchor === today ? 'Hoje' : mediumDate(anchor);
      case 'week': return weekLabel(anchor);
      case 'month': return monthLabel(anchor);
      case 'year': return String(yearOf(anchor));
      default: return '';
    }
  }, [view, anchor, today]);

  const onComplete = useCallback(
    (item: AgendaItem, date: DayKey) => {
      const finishes = !item.done && item.value + 1 >= item.target;
      completeItem(repos, item, date);
      if (finishes) feedback.play('complete');
      else feedback.touch();
    },
    [repos, feedback],
  );

  /** Straight to the target, for the habits that would otherwise take eight taps. */
  const onFill = useCallback(
    (item: AgendaItem, date: DayKey) => {
      if (item.kind !== 'habit') return;
      setHabitDone(repos, item.sourceId, date, true);
      feedback.play('complete');
    },
    [repos, feedback],
  );

  const onOpen = useCallback(
    (item: AgendaItem) => {
      if (item.kind === 'event') {
        const existing = repos.events.byId(item.sourceId);
        if (existing) setSheet({ kind: 'event', existing });
      } else if (item.kind === 'task') {
        const existing = repos.tasks.byId(item.sourceId);
        if (existing) setSheet({ kind: 'task', existing });
      } else if (item.kind === 'habit') {
        const existing = repos.habits.byId(item.sourceId);
        if (existing) setSheet({ kind: 'habit', existing });
      }
    },
    [repos],
  );

  const pick = useCallback((kind: CreateKind) => {
    setSheet({ kind } as SheetState);
  }, []);

  return (
    <>
      <Screen>
        <header className="page-head">
          <p className="t-eyebrow">Agenda</p>
          <Segmented
            ariaLabel="Escala da agenda"
            value={view}
            options={AGENDA_VIEW_OPTIONS}
            onChange={setView}
          />
        </header>

        <DateNavigator
          label={label}
          onPrev={() => shift(-1)}
          onNext={() => shift(1)}
          onToday={() => setAnchor(today)}
          showToday={anchor !== today}
        />

        {view === 'day' ? (
          <AgendaList agenda={day} onComplete={onComplete} onFill={onFill} onOpen={onOpen} />
        ) : null}

        {view === 'week' && week ? (
          <WeekView
            week={week}
            selected={anchor}
            onSelect={(date) => { setAnchor(date); setView('day'); }}
          />
        ) : null}

        {view === 'month' && month ? (
          <>
            <MonthView month={month} selected={anchor} onSelect={setAnchor} />
            <AgendaList agenda={day} onComplete={onComplete} onFill={onFill} onOpen={onOpen} />
          </>
        ) : null}

        {view === 'year' && year ? (
          <YearView
            year={year}
            onSelectMonth={(monthAnchor) => { setAnchor(monthAnchor); setView('month'); }}
          />
        ) : null}

        <AskPace questions={[
          'Organiza-me a semana à volta do que já está marcado',
          'Onde tenho tempo livre esta semana?',
          'Passa o treino de sexta para sábado',
        ]} />
      </Screen>

      <Fab label="Adicionar" onClick={() => setSheet({ kind: 'picker' })} />

      {sheet?.kind === 'picker' ? (
        <CreatePicker onPick={pick} onClose={() => setSheet(null)} />
      ) : null}

      <AgendaSheets sheet={sheet} date={anchor} onClose={() => setSheet(null)} />
    </>
  );
}

export type { CreateKind };
