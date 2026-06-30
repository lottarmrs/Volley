export type ProductErrorCode =
  | 'permission_denied'
  | 'not_authenticated'
  | 'not_found'
  | 'invalid_input'
  | 'guest_player_cannot_be_linked'
  | 'cloud_unavailable';

export interface AppIssue {
  code: ProductErrorCode;
  message: string;
  recoverable: true;
  cause?: unknown;
}

export interface ProductAppError {
  kind: 'product';
  code: ProductErrorCode;
  message: string;
  recoverable: false;
}

export interface TechnicalAppError {
  kind: 'technical';
  code: 'technical_error';
  message: string;
  recoverable: true;
  cause?: unknown;
}

export type AppError = ProductAppError | TechnicalAppError;

export interface AppOkResult<T> {
  ok: true;
  value: T;
  issues?: AppIssue[];
}

export interface AppErrorResult {
  ok: false;
  error: AppError;
}

export type AppResult<T> = AppOkResult<T> | AppErrorResult;

export function appOk<T>(value: T, issues?: AppIssue[]): AppOkResult<T> {
  return issues && issues.length > 0 ? { ok: true, value, issues } : { ok: true, value };
}

export function productError(code: ProductErrorCode, message: string): AppErrorResult {
  return {
    ok: false,
    error: { kind: 'product', code, message, recoverable: false },
  };
}

export function technicalError(message: string, cause?: unknown): AppErrorResult {
  return {
    ok: false,
    error: { kind: 'technical', code: 'technical_error', message, recoverable: true, cause },
  };
}

export function recoverableIssue(
  code: ProductErrorCode,
  message: string,
  cause?: unknown,
): AppIssue {
  return { code, message, recoverable: true, cause };
}

export function isAppOk<T>(result: AppResult<T>): result is AppOkResult<T> {
  return result.ok;
}
