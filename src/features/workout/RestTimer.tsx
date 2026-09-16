/**
 * Rest countdown.
 *
 * Appears on its own after a set and disappears when it reaches zero or when
 * the user skips it. Deliberately not a modal: resting is not a state you
 * should have to dismiss before you can look at anything else.
 *
 * O `onDone` vive numa ref. Estava nas dependências do efeito, e o ecrã do
 * treino passa-o escrito no JSX e re-renderiza a cada segundo por causa do
 * relógio — o efeito recomeçava a cada segundo e o descanso nunca descia do
 * valor inicial. A contagem depende agora só dos segundos pedidos.
 */

import { useEffect, useRef, useState, type ReactElement } from 'react';
import { clock } from './useTicker';

export function RestTimer({
  seconds, onDone,
}: {
  seconds: number;
  onDone: () => void;
}): ReactElement {
  const [left, setLeft] = useState(seconds);
  const done = useRef(onDone);
  done.current = onDone;
  const fired = useRef(false);

  useEffect(() => {
    setLeft(seconds);
    fired.current = false;
    const id = window.setInterval(() => {
      setLeft((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [seconds]);

  // O fim avisa-se aqui, e não dentro do `setLeft`: uma função de atualização
  // do estado pode correr duas vezes, e o aviso — que agora também fala — não.
  useEffect(() => {
    if (left > 0 || fired.current) return;
    fired.current = true;
    done.current();
  }, [left]);

  const skip = (): void => {
    if (fired.current) return;
    fired.current = true;
    done.current();
  };

  const ratio = seconds === 0 ? 0 : left / seconds;

  return (
    <div className="rest-timer" role="timer" aria-live="off">
      <div className="rest-fill" style={{ width: `${Math.round(ratio * 100)}%` }} aria-hidden="true" />
      <span className="rest-label">Descanso</span>
      <span className="rest-clock t-num">{clock(left)}</span>
      <button type="button" className="rest-skip" onClick={skip}>
        Saltar
      </button>
    </div>
  );
}
