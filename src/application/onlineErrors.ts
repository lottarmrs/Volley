import { authorizationError, offlineError, unexpectedError, type AppError } from './appResult';

export const OFFLINE_MESSAGE = 'Sem conexão. Tente de novo quando o sinal voltar.';

const NETWORK_MESSAGES = ['failed to fetch', 'networkerror', 'load failed', 'fetch failed'];

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message ?? '');
  }
  return typeof error === 'string' ? error : '';
}

export function isPermissionError(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && (error as { code?: unknown }).code === '42501',
  );
}

export function isDefinitiveRefusal(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  return (
    code === '42501' ||
    code.startsWith('23') ||
    code.startsWith('22') ||
    code.startsWith('PGRST1') ||
    code.startsWith('PGRST2')
  );
}

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = errorMessage(error).toLowerCase();
  return NETWORK_MESSAGES.some((fragment) => message.includes(fragment));
}

export function toOnlineError(error: unknown): AppError {
  if (isNetworkError(error)) return offlineError(OFFLINE_MESSAGE).error;
  if (isPermissionError(error)) return authorizationError('admin', errorMessage(error)).error;
  return unexpectedError(errorMessage(error) || 'Algo deu errado. Tente de novo.').error;
}
