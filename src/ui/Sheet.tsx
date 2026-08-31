/**
 * Bottom sheet.
 *
 * The app's one modal surface for anything longer than a confirmation: create
 * pickers and entry forms. Native-safe by construction — no browser dialog, and
 * the body scrolls inside the sheet so the iOS keyboard cannot push the whole
 * page around.
 */

import { useEffect, useRef, type ReactElement, type ReactNode } from 'react';
import { Icon } from './Icon';

export function Sheet({
  title, subtitle, onClose, children, footer,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}): ReactElement {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    // The page behind must not scroll while a sheet is open.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        tabIndex={-1}
        ref={panel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <div className="grow">
            <h2 className="t-h1" id="sheet-title">{title}</h2>
            {subtitle ? <p className="t-sm muted-2">{subtitle}</p> : null}
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Fechar">
            <Icon name="close" />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer ? <div className="sheet-foot">{footer}</div> : null}
      </div>
    </div>
  );
}
