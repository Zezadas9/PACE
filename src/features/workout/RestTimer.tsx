/**
 * Rest countdown.
 *
 * Appears on its own after a set and disappears when it reaches zero or when
 * the user skips it. Deliberately not a modal: resting is not a state you
 * should have to dismiss before you can look at anything else.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { clock } from './useTicker';

export function RestTimer({
  seconds, onDone,
}: {
  seconds: number;
  onDone: () => void;
}): ReactElement {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    setLeft(seconds);
    const id = window.setInterval(() => {
      setLeft((current) => {
        if (current <= 1) {
          window.clearInterval(id);
          onDone();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [seconds, onDone]);

  const ratio = seconds === 0 ? 0 : left / seconds;

  return (
    <div className="rest-timer" role="timer" aria-live="off">
      <div className="rest-fill" style={{ width: `${Math.round(ratio * 100)}%` }} aria-hidden="true" />
      <span className="rest-label">Descanso</span>
      <span className="rest-clock t-num">{clock(left)}</span>
      <button type="button" className="rest-skip" onClick={onDone}>
        Saltar
      </button>
    </div>
  );
}
