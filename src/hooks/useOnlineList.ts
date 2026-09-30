import { useCallback, useContext, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppError } from '@app/appResult';
import { OFFLINE_MESSAGE, toOnlineError } from '@app/onlineErrors';
import { offlineError } from '@app/appResult';
import { ToastContext } from '../ui/common/useToast';
import { useAuth } from './useAuth';

export interface OnlineStatus {
  loading: boolean;
  error: AppError | null;
  readError: AppError | null;
  offline: boolean;
}

export function useOnlineAccount(): { online: boolean; userId: string | null; settled: boolean } {
  const auth = useAuth();
  const userId = auth.user?.id ?? null;
  return {
    online: !!auth.isSupabaseConfigured && !!userId,
    userId,
    settled: auth.state?.kind !== 'initializing',
  };
}

export function useOnlineList<T>(options: {
  enabled: boolean;
  queryKey: readonly unknown[];
  fetch: () => Promise<T[]>;
}) {
  const queryClient = useQueryClient();
  const toasts = useContext(ToastContext);
  const [writeError, setWriteError] = useState<AppError | null>(null);
  const query = useQuery({
    queryKey: options.queryKey,
    queryFn: options.fetch,
    enabled: options.enabled,
  });
  const keyHash = JSON.stringify(options.queryKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryKey = useMemo(() => options.queryKey, [keyHash]);

  const report = useCallback(
    (error: AppError) => {
      setWriteError(error);
      toasts?.push(error.message, 'error');
    },
    [toasts],
  );

  const write = useCallback(
    async <R>(apply: (list: T[]) => T[], persist: () => Promise<R>): Promise<R | null> => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        report(offlineError(OFFLINE_MESSAGE).error);
        return null;
      }
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<T[]>(queryKey);
      queryClient.setQueryData<T[]>(queryKey, (list) => apply(list ?? []));
      try {
        const result = await persist();
        setWriteError(null);
        return result;
      } catch (error) {
        queryClient.setQueryData<T[]>(queryKey, previous);
        report(toOnlineError(error));
        return null;
      } finally {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    [queryClient, queryKey, report],
  );

  const readError = query.error ? toOnlineError(query.error) : null;
  const error = writeError ?? readError;
  const status: OnlineStatus = {
    loading: options.enabled && query.isPending,
    error,
    readError,
    offline: error?.kind === 'offline_unavailable',
  };

  return {
    data: options.enabled ? (query.data ?? []) : [],
    status,
    write,
    refresh: () => queryClient.invalidateQueries({ queryKey }),
    setData: (updater: (list: T[]) => T[]) =>
      queryClient.setQueryData<T[]>(queryKey, (list) => updater(list ?? [])),
  };
}
