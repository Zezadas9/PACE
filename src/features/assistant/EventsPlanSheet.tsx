/**
 * Um horário, antes de entrar na agenda.
 *
 * A IA leu uma fotografia ou um documento, e ler é onde se erra: uma hora
 * esborratada, uma disciplina cortada, uma célula que parecia outra. Por isso
 * nada entra sem passar por aqui. Cada aula pode sair da proposta; o que já
 * estava marcado e se sobrepõe aparece à vista; e o que a IA não conseguiu ler
 * é dito, em vez de ter sido inventado.
 *
 * O que já está na agenda nunca é alterado. Um horário novo só acrescenta.
 *
 * Depois de entrar, a folha não desaparece: fica a dizer o que ficou marcado,
 * com um botão para o ir ver. Um horário que some no instante em que se
 * confirma deixa quem o mandou sem saber onde ele foi parar.
 */

import { useMemo, useState, type ReactElement } from 'react';
import type { EventsDraft } from '../../domain/coach/types';
import { clashes, groupEventItems, weeklyCount } from '../../domain/timetable';
import { todayKey } from '../../core/utils/date';
import { useApp } from '../../app/providers/appContext';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/primitives';
import { Icon } from '../../ui/Icon';

const SHORT_DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const CATEGORY_LABEL: Record<string, string> = {
  school: 'Escola',
  work: 'Trabalho',
  appointment: 'Consulta',
  meeting: 'Reunião',
  commitment: 'Compromisso',
  personal: 'Pessoal',
};

function describeDays(weekdays: number[]): string {
  if (weekdays.length === 7) return 'todos os dias';
  if (weekdays.length === 5 && [1, 2, 3, 4, 5].every((day) => weekdays.includes(day))) {
    return 'dias úteis';
  }
  return weekdays.map((day) => SHORT_DAYS[day]).join(', ');
}

const pt = (date: string): string => date.split('-').reverse().join('/');

/** Onde se vai ver o que acabou de ficar marcado. */
export interface Placed {
  path: string | null;
}

export function EventsPlanSheet({
  draft, onClose, onConfirm, onView,
}: {
  draft: EventsDraft;
  onClose: () => void;
  /** Põe na agenda. Devolve o que ficou lá, ou `null` se não deu. */
  onConfirm: (edited: EventsDraft) => Placed | null;
  onView: (path: string) => void;
}): ReactElement {
  const { repos } = useApp();
  const grouped = useMemo(() => groupEventItems(draft.items), [draft]);
  const [left, setLeft] = useState<Set<number>>(() => new Set());
  const [placed, setPlaced] = useState<Placed | null>(null);

  const today = todayKey();
  const from = draft.startDate && draft.startDate > today ? draft.startDate : today;
  const chosen = grouped.filter((_, index) => !left.has(index));

  // As sobreposições contam só com o que fica na proposta.
  const overlaps = useMemo(
    () => clashes(chosen, repos.events.all(), from),
    [chosen, repos, from],
  );

  const confirm = (): void => {
    const result = onConfirm({ ...draft, items: chosen });
    if (!result) return;
    setPlaced(result);
  };

  const toggle = (index: number): void => {
    if (placed) return;
    setLeft((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const total = weeklyCount(chosen);

  return (
    <Sheet
      title={draft.title}
      subtitle={`${total} ${total === 1 ? 'marcação' : 'marcações'} por semana · a partir de ${pt(from)}`
        + (draft.until ? ` · até ${pt(draft.until)}` : '')}
      onClose={onClose}
      footer={placed ? (
        <>
          <Button variant="ghost" label="Fechar" onClick={onClose} />
          <Button
            variant="primary"
            icon="calendar"
            label="Ver na agenda"
            disabled={!placed.path}
            onClick={() => placed.path && onView(placed.path)}
          />
        </>
      ) : (
        <>
          <Button variant="outline" label="Cancelar" onClick={onClose} />
          <Button
            variant="primary"
            label={chosen.length === 0 ? 'Nada a pôr' : 'Pôr na agenda'}
            disabled={chosen.length === 0}
            onClick={confirm}
          />
        </>
      )}
    >
      <div className="stack stack-4">
        {placed ? (
          <div className="timetable-note" data-tone="done">
            <p className="t-sm">
              <strong>Está na agenda.</strong>{' '}
              {total === 1 ? 'Uma marcação' : `${total} marcações`} por semana, a
              repetir todas as semanas a partir de {pt(from)}.
            </p>
            <p className="t-sm muted">
              Aparece no dia de cada aula, à hora dela. Podes mudar ou apagar
              qualquer uma na agenda, como as outras.
            </p>
          </div>
        ) : (
          <p className="t-sm muted">
            Confirma se foi bem lido. Toca numa linha para a tirar — o que já está na
            tua agenda fica como está.
          </p>
        )}

        <ul className="timetable-list">
          {(placed ? chosen : grouped).map((item, index) => {
            const out = !placed && left.has(index);
            return (
              <li key={`${item.title}-${item.startTime}-${index}`}>
                <button
                  type="button"
                  className="timetable-row"
                  data-out={String(out)}
                  aria-pressed={placed ? undefined : !out}
                  disabled={!!placed}
                  onClick={() => toggle(index)}
                >
                  <span className="timetable-check" aria-hidden="true">
                    {out ? null : <Icon name="check" />}
                  </span>
                  <span className="grow">
                    <span className="timetable-title">{item.title}</span>
                    <span className="timetable-sub">
                      {describeDays(item.weekdays)} · {item.startTime}
                      {item.endTime ? `–${item.endTime}` : ''}
                      {item.location ? ` · ${item.location}` : ''}
                    </span>
                  </span>
                  <span className="timetable-tag">{CATEGORY_LABEL[item.category] ?? ''}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {overlaps.length > 0 && !placed ? (
          <div className="timetable-note" data-tone="caution">
            <p className="t-sm">
              <strong>Sobrepõe-se ao que já tens:</strong>
            </p>
            <ul>
              {overlaps.slice(0, 6).map((clash, index) => (
                <li key={index} className="t-sm">
                  {clash.item.title} com {clash.with}
                </li>
              ))}
            </ul>
            <p className="t-sm muted">Fica tudo marcado. Decides tu o que fazer com cada um.</p>
          </div>
        ) : null}

        {draft.unreadable.length > 0 && !placed ? (
          <div className="timetable-note">
            <p className="t-sm"><strong>Não consegui ler:</strong></p>
            <ul>
              {draft.unreadable.map((line, index) => <li key={index} className="t-sm">{line}</li>)}
            </ul>
            <p className="t-sm muted">Isto não entra. Podes acrescentá-lo à mão na agenda.</p>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
