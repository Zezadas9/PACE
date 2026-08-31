/**
 * App-level UI services: toasts and confirmation.
 *
 * This exists to keep `window.confirm` and `window.alert` out of the codebase.
 * Inside a WKWebView those render as system alerts titled with the origin
 * ("localhost says…"), which reads as a bug on a shipped app — and they block
 * the JavaScript thread, which the native bridge does not appreciate.
 */

import { createContext, useContext } from 'react';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Renders the confirm action as destructive. */
  danger?: boolean;
}

export interface UiServices {
  toast(message: string, durationMs?: number): void;
  confirm(options: ConfirmOptions): Promise<boolean>;
}

export const UiContext = createContext<UiServices | null>(null);

export function useUi(): UiServices {
  const value = useContext(UiContext);
  if (!value) throw new Error('useUi must be used inside <UiProvider>');
  return value;
}
