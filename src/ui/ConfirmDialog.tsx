/**
 * The in-app replacement for `window.confirm`.
 *
 * Native-safe: no blocking browser dialog, no origin in the title, and it looks
 * like the rest of the app on both platforms. Escape and the backdrop cancel,
 * which matches what a user expects from a sheet.
 */

import { useEffect, useRef, type ReactElement } from 'react';
import { Button } from './primitives';

export function ConfirmDialog({
  title, body, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger,
  onConfirm, onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactElement {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Move focus into the sheet so a keyboard or screen-reader user lands here.
    panel.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        tabIndex={-1}
        ref={panel}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="t-h1" id="dialog-title">
          {title}
        </h2>
        {body ? <p className="t-sm muted">{body}</p> : null}
        <div className="dialog-actions">
          <Button variant="outline" block label={cancelLabel} onClick={onCancel} />
          <Button
            variant={danger ? 'danger' : 'primary'}
            block
            label={confirmLabel}
            onClick={onConfirm}
          />
        </div>
      </div>
    </div>
  );
}
