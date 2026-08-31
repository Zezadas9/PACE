/** Page chrome shared by the secondary tabs. */

import type { ReactElement } from 'react';
import { SectionHeader } from './primitives';

export function PageHeader({
  eyebrow, title, subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}): ReactElement {
  return (
    <header className="page-head">
      <p className="t-eyebrow">{eyebrow}</p>
      <h1 className="t-title">{title}</h1>
      {subtitle ? (
        <p className="muted" style={{ marginTop: '0.5rem' }}>
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}

/**
 * The "next phase" note. A quiet screen should read as deliberate, not broken —
 * saying what is coming is the difference.
 */
export function Upcoming({ items }: { items: string[] }): ReactElement {
  return (
    <section>
      <SectionHeader title="Em breve" />
      <div className="preview-list">
        {items.map((item) => (
          <div key={item} className="preview-item">
            <span className="dot" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
