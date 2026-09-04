/**
 * O atalho para a PACE, em cada secção.
 *
 * A mesma peça em todos os ecrãs, com perguntas diferentes: quem está nos
 * treinos não quer perguntar sobre o jantar. As perguntas vão escritas por
 * inteiro em vez de etiquetas — chegam ao campo da IA prontas, e quem lá chega
 * ainda as pode mudar antes de as fazer.
 *
 * Não abre conversa nenhuma sozinho, nem responde aqui. É uma porta.
 */

import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp, useStoreVersion } from '../../app/providers/appContext';
import { aiSettings } from '../../services/coach';
import { Card } from '../../ui/primitives';
import { BrandIcon } from '../../ui/BrandIcon';

export function AskPace({
  questions, title = 'Perguntar à PACE',
}: {
  /** Perguntas inteiras, na voz do utilizador. Duas ou três, não mais. */
  questions: readonly string[];
  title?: string;
}): ReactElement | null {
  const { repos } = useApp();
  const navigate = useNavigate();
  const version = useStoreVersion();
  const settings = aiSettings(repos);
  void version;

  if (questions.length === 0) return null;

  // Com o assistente desligado isto seria um botão que leva a uma parede.
  // Leva-o antes ao sítio onde se liga, e diz porquê.
  const off = !settings.enabled;

  return (
    <Card variant="quiet">
      <div className="row">
        <BrandIcon name="ia" size={30} />
        <div className="grow" style={{ marginLeft: 'var(--s-3)' }}>
          <p className="t-eyebrow">{title}</p>
          {off ? (
            <p className="t-sm muted" style={{ marginTop: '0.2rem' }}>
              O assistente está desligado.
            </p>
          ) : null}
        </div>
      </div>

      <div className="chips-scroll" style={{ marginTop: 'var(--s-3)' }}>
        {off ? (
          <button type="button" className="chip" onClick={() => navigate('/ia/dados')}>
            <span className="dot" />
            <span>Ligar o assistente</span>
          </button>
        ) : (
          questions.map((question) => (
            <button
              key={question}
              type="button"
              className="chip"
              onClick={() => navigate(`/ia?pergunta=${encodeURIComponent(question)}`)}
            >
              <span className="dot" />
              <span>{question}</span>
            </button>
          ))
        )}
      </div>
    </Card>
  );
}
