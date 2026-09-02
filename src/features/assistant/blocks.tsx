/**
 * PACE — como uma resposta do assistente aparece no ecrã.
 *
 * Cada tipo de bloco tem uma forma própria de propósito. Um aviso clínico não
 * pode parecer um parágrafo qualquer, e uma lista de fontes tem de ser
 * visivelmente uma lista de fontes — é isso que separa "a app disse" de "isto
 * vem daqui, vai lá ver".
 */

import type { ReactElement, ReactNode } from 'react';
import type { CoachBlock } from '../../domain/coach/types';
import { citation, referencesByIds } from '../../domain/coach/references';
import { Icon } from '../../ui/Icon';

/** Negrito com **asteriscos**, e nada mais: não há HTML de fora aqui. */
function rich(value: string): ReactNode {
  return value.split(/(\*\*[^*]+\*\*)/).map((part, index) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : <span key={index}>{part}</span>
  ));
}

export function Block({ block }: { block: CoachBlock }): ReactElement | null {
  switch (block.kind) {
    case 'text':
      return <p className="coach-text">{rich(block.text)}</p>;

    case 'list':
      return (
        <ul className="coach-list">
          {block.items.map((item, index) => <li key={index}>{rich(item)}</li>)}
        </ul>
      );

    case 'metrics':
      return (
        <div className="coach-metrics">
          {block.items.map((item) => (
            <div key={item.label}>
              <span className="value">{item.value}</span>
              <span className="label">{item.label}</span>
              {item.note ? <span className="note">{item.note}</span> : null}
            </div>
          ))}
        </div>
      );

    case 'notice':
      return (
        <div className="coach-notice" data-tone={block.tone}>
          <Icon name={block.tone === 'medical' ? 'heart' : 'sparkle'} />
          <span>{block.text}</span>
        </div>
      );

    case 'caveat':
      return (
        <div className="coach-caveat">
          <span className="tag">Sem evidência forte</span>
          <span>{block.text}</span>
        </div>
      );

    case 'references': {
      const references = referencesByIds(block.ids);
      if (references.length === 0) return null;
      return (
        <details className="coach-refs">
          <summary>
            {references.length === 1 ? '1 fonte' : `${references.length} fontes`}
          </summary>
          <ul>
            {references.map((reference) => (
              <li key={reference.id}>
                <a href={reference.url} target="_blank" rel="noreferrer noopener">
                  {citation(reference)}
                </a>
                <span className="what">{reference.supports}</span>
              </li>
            ))}
          </ul>
        </details>
      );
    }

    default:
      return null;
  }
}

export function Blocks({ blocks }: { blocks: CoachBlock[] }): ReactElement {
  return (
    <>
      {blocks.map((block, index) => <Block key={index} block={block} />)}
    </>
  );
}
