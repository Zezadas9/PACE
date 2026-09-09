/**
 * O primeiro dia.
 *
 * Uma aplicação acabada de instalar não tem nada para mostrar, e mostrar cinco
 * caixas vazias a dizer isso é a pior maneira de o dizer: o ecrã fica cheio de
 * ausências e nenhuma delas indica por onde se começa.
 *
 * Este cartão substitui-as por um caminho. Desaparece sozinho no momento em
 * que existir a primeira coisa — não é um ecrã de boas-vindas que se despede,
 * é o que fica enquanto não há mais nada.
 */

import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../../ui/primitives';
import { Row, Rows } from '../../ui/data';
import { BrandIcon } from '../../ui/BrandIcon';

export function FirstRunCard({ name }: { name: string | null }): ReactElement {
  const navigate = useNavigate();

  return (
    <section>
      <Card>
        <div className="row">
          <BrandIcon name="sequencia" size={40} float />
          <div className="grow" style={{ marginLeft: 'var(--s-3)' }}>
            <p className="t-h2">
              {name ? `Hoje começa, ${name}.` : 'Hoje começa a tua jornada.'}
            </p>
            <p className="t-sm muted" style={{ marginTop: '0.3rem' }}>
              A PACE está vazia porque ainda é tua. Escolhe uma coisa para hoje — o
              resto vem depois.
            </p>
          </div>
        </div>
      </Card>

      <Card variant="flush" className="first-run-steps">
        <Rows>
          <Row
            brand="agenda"
            title="Criar o primeiro hábito"
            sub="Beber água, alongar, ler. Algo que queiras repetir."
            chevron
            onClick={() => navigate('/agenda')}
          />
          <Row
            brand="treinos"
            title="Montar um treino"
            sub="Ou pede um à PACE e ela monta-o por ti."
            chevron
            onClick={() => navigate('/treino')}
          />
          <Row
            brand="corrida"
            title="Registar uma atividade"
            sub="Uma corrida, uma caminhada, um passeio de bicicleta."
            chevron
            onClick={() => navigate('/atividade')}
          />
        </Rows>
      </Card>
    </section>
  );
}
