import { Loader2, RotateCw, WifiOff, TriangleAlert } from 'lucide-react';
import type { AppError } from '@app/appResult';
import { OFFLINE_MESSAGE } from '@app/onlineErrors';

export function OnlineLoading({ label }: { label: string }) {
  return (
    <p role="status" className="flex items-center gap-2 px-1 py-3 text-sm text-text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </p>
  );
}

export function OnlineReadError({
  error,
  onRetry,
}: {
  error: AppError | null;
  onRetry: () => void;
}) {
  if (!error) return null;
  const offline = error.kind === 'offline_unavailable';
  const Icon = offline ? WifiOff : TriangleAlert;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/40 bg-base-200 px-4 py-3"
    >
      <Icon className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
      <p className="min-w-48 flex-1 text-sm">
        {offline ? OFFLINE_MESSAGE : 'Não deu para carregar. Tente de novo.'}
      </p>
      <button type="button" className="btn btn-sm min-h-11" onClick={onRetry}>
        <RotateCw className="h-4 w-4" aria-hidden="true" />
        Tentar de novo
      </button>
    </div>
  );
}
