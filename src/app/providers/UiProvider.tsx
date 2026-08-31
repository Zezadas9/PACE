import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { UiContext, type ConfirmOptions, type UiServices } from './uiContext';
import { ConfirmDialog } from '../../ui/ConfirmDialog';
import { ToastHost, type ToastItem } from '../../ui/Toast';

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

export function UiProvider({ children }: { children: ReactNode }): ReactNode {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const nextId = useRef(0);

  const toast = useCallback((message: string, durationMs = 2400) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current, { id, message }]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, durationMs);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    [],
  );

  const settle = useCallback(
    (result: boolean) => {
      pending?.resolve(result);
      setPending(null);
    },
    [pending],
  );

  const services = useMemo<UiServices>(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <UiContext.Provider value={services}>
      {children}
      <ToastHost toasts={toasts} />
      {pending ? (
        <ConfirmDialog
          title={pending.title}
          body={pending.body}
          confirmLabel={pending.confirmLabel}
          cancelLabel={pending.cancelLabel}
          danger={pending.danger}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      ) : null}
    </UiContext.Provider>
  );
}
