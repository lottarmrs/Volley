import { type ReactNode } from 'react';
import { useToasts } from '../../hooks/useToasts';
import { ToastContext } from './useToast';

/**
 * Wraps the app with a single shared toast store. Descendants call
 * {@link useToast} instead of instantiating `useToasts` directly, so views
 * (including routed ones) emit toasts without prop-drilling.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const toasts = useToasts();
  return <ToastContext.Provider value={toasts}>{children}</ToastContext.Provider>;
}
