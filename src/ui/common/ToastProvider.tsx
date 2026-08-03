import { createContext, useContext, type ReactNode } from 'react';
import { useToasts, type Toast, type ToastVariant } from '../../hooks/useToasts';

type ToastApi = {
  toasts: Toast[];
  push: (message: string, variant?: ToastVariant) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Wraps the app with a single shared toast store. Descendants call
 * {@link useToast} instead of instantiating `useToasts` directly, so views
 * (including routed ones) emit toasts without prop-drilling.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const toasts = useToasts();
  return <ToastContext.Provider value={toasts}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  return ctx;
}
