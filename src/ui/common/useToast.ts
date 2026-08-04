import { createContext, useContext } from 'react';
import { type Toast, type ToastVariant } from '../../hooks/useToasts';

export type ToastApi = {
  toasts: Toast[];
  push: (message: string, variant?: ToastVariant) => number;
  dismiss: (id: number) => void;
};

export const ToastContext = createContext<ToastApi | null>(null);

/**
 * Access the app-wide toast store provided by {@link ToastProvider}.
 * Throws when used outside a provider.
 */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  return ctx;
}
