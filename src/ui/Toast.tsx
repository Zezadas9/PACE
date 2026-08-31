import type { ReactElement } from 'react';

export interface ToastItem {
  id: number;
  message: string;
}

export function ToastHost({ toasts }: { toasts: ToastItem[] }): ReactElement {
  return (
    <div className="toast-host">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast" role="status">
          {toast.message}
        </div>
      ))}
    </div>
  );
}
