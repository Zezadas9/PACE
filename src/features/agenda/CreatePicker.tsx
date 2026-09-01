/** The sheet that asks what kind of thing you want to add. */

import type { ReactElement } from 'react';
import { Sheet } from '../../ui/Sheet';
import { BrandIconTile } from '../../ui/BrandIcon';

export type CreateKind = 'event' | 'task' | 'habit';

export function CreatePicker({
  onPick, onClose,
}: {
  onPick: (kind: CreateKind) => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Sheet title="Adicionar" onClose={onClose}>
      <div className="pick-list">
        <button type="button" className="pick-item" onClick={() => onPick('event')}>
          <BrandIconTile name="agenda" size={34} />
          <span className="grow">
            <span className="title">Evento</span>
            <span className="sub">Algo que acontece a uma hora — reunião, consulta, aula</span>
          </span>
        </button>
        <button type="button" className="pick-item" onClick={() => onPick('task')}>
          <BrandIconTile name="objetivos" size={34} />
          <span className="grow">
            <span className="title">Tarefa</span>
            <span className="sub">Algo para fazer num dia, com ou sem hora</span>
          </span>
        </button>
        <button type="button" className="pick-item" onClick={() => onPick('habit')}>
          <BrandIconTile name="progresso" size={34} />
          <span className="grow">
            <span className="title">Hábito</span>
            <span className="sub">Algo que se repete — beber água, caminhar, ler</span>
          </span>
        </button>
      </div>
      <p className="t-sm muted-2" style={{ marginTop: 'var(--s-4)' }}>
        Só os itens marcados como essenciais contam para a sequência.
      </p>
    </Sheet>
  );
}
