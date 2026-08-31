/**
 * The scrolling surface for one route.
 *
 * Remounted per route, which is what replays the entry transition. `stagger`
 * is removed after the first frame so a later re-render does not re-animate a
 * list the user is already reading.
 */

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

export function Screen({ children }: { children: ReactNode }): ReactElement {
  const [staggered, setStaggered] = useState(true);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setStaggered(false), 600);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="screen" data-state="entering" ref={host}>
      <div className={`stack stack-8${staggered ? ' stagger' : ''}`}>{children}</div>
    </div>
  );
}
