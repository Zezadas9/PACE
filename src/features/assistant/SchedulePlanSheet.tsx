/**
 * A proposta de semana, antes de entrar na agenda.
 *
 * É aqui que "aceitar, editar ou rejeitar" deixa de ser uma frase e passa a ser
 * um ecrã: cada linha pode mudar de dia, mudar de hora ou sair da proposta, e
 * só o botão de confirmar escreve alguma coisa. O que já estava marcado aparece
 * em baixo, para se ver que continua lá.
 */

import { useMemo, useState, type ReactElement } from 'react';
import type { ScheduleDraft, ScheduleDraftItem } from '../../domain/coach/types';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/primitives';
import { TimeField } from '../../ui/TimeField';
import { IconButton } from '../../ui/primitives';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

const KIND_LABEL: Record<ScheduleDraftItem['kind'], string> = {
  workout: 'Treino',
  run: 'Corrida',
  walk: 'Caminhada',
  water: 'Água',
};

function countLine(items: ScheduleDraftItem[]): string {
  const counts = new Map<ScheduleDraftItem['kind'], number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);

  const plural: Record<ScheduleDraftItem['kind'], [string, string]> = {
    workout: ['treino', 'treinos'],
    run: ['corrida', 'corridas'],
    walk: ['caminhada', 'caminhadas'],
    water: ['hábito de água', 'hábitos de água'],
  };

  return [...counts.entries()]
    .map(([kind, count]) => `${count} ${count === 1 ? plural[kind][0] : plural[kind][1]}`)
    .join(', ');
}

export function SchedulePlanSheet({
  draft, onConfirm, onClose,
}: {
  draft: ScheduleDraft;
  onConfirm: (draft: ScheduleDraft) => void;
  onClose: () => void;
}): ReactElement {
  const [items, setItems] = useState<ScheduleDraftItem[]>(draft.items);

  const resumo = useMemo(() => countLine(items), [items]);

  const patch = (index: number, changes: Partial<ScheduleDraftItem>): void => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...changes } : item)));
  };

  return (
    <Sheet
      title="Proposta para a semana"
      subtitle={items.length === 0 ? 'Sem nada para adicionar.' : `Vou adicionar: ${resumo}.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" label="Cancelar" onClick={onClose} />
          <Button
            variant="primary"
            label="Confirmar"
            disabled={items.length === 0}
            onClick={() => onConfirm({ ...draft, items })}
          />
        </>
      }
    >
      <div className="stack stack-5">
        <div className="stack stack-3">
          {items.map((item, index) => (
            <div className="plan-row" key={`${item.kind}-${index}`}>
              <div className="row row-between">
                <span className="title">{item.label || KIND_LABEL[item.kind]}</span>
                <IconButton
                  icon="trash"
                  label={`Tirar ${item.label} da proposta`}
                  onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                />
              </div>

              {item.kind === 'water' ? (
                <p className="t-sm muted-2">Todos os dias, sem hora marcada.</p>
              ) : (
                <>
                  <div className="weekday-picker">
                    {ORDER.map((weekday) => (
                      <button
                        key={weekday}
                        type="button"
                        aria-pressed={item.weekday === weekday}
                        aria-label={WEEKDAYS[weekday]}
                        onClick={() => patch(index, { weekday })}
                      >
                        {SHORT[weekday]}
                      </button>
                    ))}
                  </div>
                  <div className="plan-time">
                    <TimeField
                      value={item.time ?? ''}
                      placeholder="18:00"
                      ariaLabel={`Hora de ${item.label}`}
                      onChange={(time) => patch(index, { time: time || null })}
                    />
                    {item.durationMin ? (
                      <span className="t-sm muted-2">{item.durationMin} min</span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {draft.untouched.length > 0 ? (
          <div className="stack stack-2">
            <p className="t-eyebrow">Fica como está</p>
            <ul className="coach-list">
              {draft.untouched.slice(0, 8).map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        ) : null}

        {draft.unplaced.length > 0 ? (
          <p className="t-sm muted-2">
            Sem espaço para: {draft.unplaced.join(', ')}.
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}
