import { QueryClient } from '@tanstack/react-query';
import { isPermissionError } from '@app/onlineErrors';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        retry: (failures, error) => failures < 2 && !isPermissionError(error),
        staleTime: 30_000,
      },
    },
  });
}

export const queryClient = createQueryClient();
