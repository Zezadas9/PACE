/** A labelled toggle row. The whole row is the hit target. */

import type { ReactElement } from 'react';

export function Switch({
  checked, onChange, title, subtitle, disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  subtitle?: string;
  disabled?: boolean;
}): ReactElement {
  return (
    <button
      type="button"
      className="switch-row"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={disabled ? { opacity: 0.45 } : undefined}
    >
      <span className="grow">
        <span className="title">{title}</span>
        {subtitle ? <span className="sub">{subtitle}</span> : null}
      </span>
      <span className="switch" aria-hidden="true" data-checked={String(checked)}>
        <i />
      </span>
    </button>
  );
}
