/** A labelled toggle row. The whole row is the hit target. */

import type { ReactElement } from 'react';
import { BrandIcon, type BrandIconName } from './BrandIcon';

export function Switch({
  checked, onChange, title, subtitle, disabled, brand,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  title: string;
  subtitle?: string;
  disabled?: boolean;
  /** Um ícone ilustrado à frente, onde existe um que seja mesmo esta linha. */
  brand?: BrandIconName;
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
      {brand ? (
        <span className="lead lead-brand">
          <BrandIcon name={brand} size={26} />
        </span>
      ) : null}
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
