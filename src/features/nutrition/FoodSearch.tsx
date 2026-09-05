/**
 * Procurar um alimento em vez de o escrever.
 *
 * Escrever cada alimento à mão é a razão por que as pessoas desistem de
 * registar refeições. Aqui os valores vêm de rótulos: o que a pessoa escolhe
 * entra com origem `database`, e não como estimativa de ninguém.
 *
 * A procura só aparece quando há backend configurado. Sem ele, este componente
 * não se mostra — e o formulário continua a funcionar como sempre funcionou.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { FoodResult } from '../../platform/types';
import { useApp } from '../../app/providers/appContext';
import { Card } from '../../ui/primitives';
import { Row, Rows } from '../../ui/data';
import { Field, Input } from '../../ui/form';

/** Tempo de sossego antes de perguntar. Uma letra de cada vez não é procura. */
const DEBOUNCE_MS = 450;

type State =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'results'; foods: FoodResult[] }
  | { kind: 'empty' }
  | { kind: 'offline' };

/** "349 kcal · 7,2 g proteína", saltando o que o rótulo não diz. */
export function summarize(food: FoodResult): string {
  const partes = [
    food.kcalPer100g != null ? `${Math.round(food.kcalPer100g)} kcal` : null,
    food.proteinPer100g != null ? `${food.proteinPer100g} g proteína` : null,
  ].filter(Boolean);
  return partes.length > 0 ? `${partes.join(' · ')} por 100 g` : 'Sem valores';
}

export function FoodSearch({
  initialQuery, onPick,
}: {
  initialQuery?: string;
  onPick: (food: FoodResult) => void;
}): ReactElement | null {
  const { platform } = useApp();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [query, setQuery] = useState(initialQuery ?? '');
  const [state, setState] = useState<State>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    void platform.foodDatabase.isAvailable().then((can) => {
      if (!cancelled) setAvailable(can);
    });
    return () => { cancelled = true; };
  }, [platform]);

  const run = useCallback((term: string) => {
    void (async () => {
      if (term.trim().length < 2) { setState({ kind: 'idle' }); return; }
      setState({ kind: 'searching' });
      const foods = await platform.foodDatabase.search(term);
      if (foods.length > 0) { setState({ kind: 'results', foods }); return; }
      // Sem resultados e sem rede são coisas diferentes, e a mensagem também.
      const online = await platform.foodDatabase.isAvailable();
      setState({ kind: online ? 'empty' : 'offline' });
    })();
  }, [platform]);

  useEffect(() => {
    const timer = setTimeout(() => run(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, run]);

  if (available === false) return null;

  return (
    <Field
      label="Procurar nos rótulos"
      hint="Os valores vêm do Open Food Facts, uma base de dados aberta."
    >
      <Input
        value={query}
        placeholder="Ex.: arroz agulha"
        maxLength={60}
        onChange={setQuery}
      />

      {state.kind === 'searching' ? (
        <p className="t-sm muted-2" style={{ marginTop: 'var(--s-2)' }}>A procurar…</p>
      ) : null}

      {state.kind === 'empty' ? (
        <p className="t-sm muted-2" style={{ marginTop: 'var(--s-2)' }}>
          Não encontrei esse alimento. Escreve os valores tu — leva menos tempo do que
          continuar a procurar.
        </p>
      ) : null}

      {state.kind === 'offline' ? (
        <p className="t-sm muted-2" style={{ marginTop: 'var(--s-2)' }}>
          Sem ligação à base de dados. Podes escrever os valores à mão.
        </p>
      ) : null}

      {state.kind === 'results' ? (
        <Card variant="flush" className="food-results">
          <Rows>
            {state.foods.slice(0, 8).map((food) => (
              <Row
                key={`${food.barcode ?? ''}-${food.name}`}
                title={food.brand ? `${food.name} — ${food.brand}` : food.name}
                sub={summarize(food)}
                chevron
                onClick={() => onPick(food)}
              />
            ))}
          </Rows>
        </Card>
      ) : null}
    </Field>
  );
}
