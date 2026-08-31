/** The sheet that asks what kind of thing you want to add. */

import type { ReactElement } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Card } from '../../ui/primitives';
import { Row, Rows } from '../../ui/data';

export type CreateKind = 'event' | 'task' | 'habit';

export function CreatePicker({
  onPick, onClose,
}: {
  onPick: (kind: CreateKind) => void;
  onClose: () => void;
}): ReactElement {
  return (
    <Sheet title="Adicionar" onClose={onClose}>
      <Card variant="flush">
        <Rows>
          <Row
            icon="calendar"
            title="Evento"
            sub="Algo que acontece a uma hora — reunião, consulta, aula"
            chevron
            onClick={() => onPick('event')}
          />
          <Row
            icon="check"
            title="Tarefa"
            sub="Algo para fazer num dia, com ou sem hora"
            chevron
            onClick={() => onPick('task')}
          />
          <Row
            icon="repeat"
            title="Hábito"
            sub="Algo que se repete — beber água, caminhar, ler"
            chevron
            onClick={() => onPick('habit')}
          />
        </Rows>
      </Card>
      <p className="t-sm muted-2" style={{ marginTop: 'var(--s-4)' }}>
        Só os itens marcados como essenciais contam para a sequência.
      </p>
    </Sheet>
  );
}
