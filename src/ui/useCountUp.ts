/**
 * Counts a number up to its target on mount, and animates between targets after.
 *
 * A statistic that simply appears is a statistic nobody reads. Rolling it up
 * takes half a second and makes the eye land on it — which is the entire job of
 * a dashboard number.
 */

import { useEffect, useRef, useState } from 'react';

const DEFAULT_MS = 620;

/** easeOutExpo: fast then settling, which reads as arriving rather than sliding. */
function ease(t: number): number {
  return t === 1 ? 1 : 1 - 2 ** (-10 * t);
}

export function useCountUp(target: number, durationMs = DEFAULT_MS): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const frame = useRef(0);
  const mounted = useRef(false);

  useEffect(() => {
    // The very first render animates from zero; later changes animate from
    // wherever the number already was.
    const start = mounted.current ? from.current : 0;
    mounted.current = true;

    if (start === target) {
      setValue(target);
      return;
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || durationMs <= 0) {
      from.current = target;
      setValue(target);
      return;
    }

    const t0 = performance.now();
    const step = (now: number): void => {
      const progress = Math.min(1, (now - t0) / durationMs);
      const next = start + (target - start) * ease(progress);
      setValue(next);
      from.current = next;
      if (progress < 1) frame.current = requestAnimationFrame(step);
      else from.current = target;
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target, durationMs]);

  return value;
}

/** The same, rounded — for counts that must never show a fraction. */
export function useCountUpInt(target: number, durationMs?: number): number {
  return Math.round(useCountUp(target, durationMs));
}
