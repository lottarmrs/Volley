import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { Toast, ToastVariant } from '../../hooks/useToasts';

const VARIANT: Record<ToastVariant, { cls: string; Icon: typeof Info }> = {
  success: { cls: 'alert-success', Icon: CheckCircle },
  error: { cls: 'alert-error', Icon: AlertCircle },
  info: { cls: 'alert-info', Icon: Info },
};

interface ToastViewportProps {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast toast-top toast-end z-50">
      {toasts.map((toast) => {
        const { cls, Icon } = VARIANT[toast.variant];
        return (
          <div
            key={toast.id}
            className={`alert ${cls} alert-soft text-sm shadow-lg max-w-sm`}
            role="alert"
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="btn btn-ghost btn-xs btn-square"
              aria-label="Fechar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
