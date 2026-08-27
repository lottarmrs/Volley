export type ProductErrorCode =
  | 'permission_denied'
  | 'not_authenticated'
  | 'not_found'
  | 'invalid_input'
  | 'conflict'
  | 'guest_player_cannot_be_linked'
  | 'cloud_unavailable'
  | 'invalid_username'
  | 'username_unavailable'
  | 'email_not_confirmed'
  | 'mfa_required';

export interface AppIssue {
  code: ProductErrorCode;
  message: string;
  recoverable: boolean;
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

export interface ValidationAppError {
  kind: 'validation';
  field: string;
  message: string;
  recoverable: false;
}
export interface AuthorizationAppError {
  kind: 'authorization';
  required?: 'owner' | 'admin' | 'aal2' | 'master' | 'programmer';
  message: string;
  recoverable: false;
}
export interface ConflictAppError {
  kind: 'conflict';
  resource: string;
  message: string;
  recoverable: false;
}
export interface OfflineAppError {
  kind: 'offline_unavailable';
  message: string;
  recoverable: true;
}
export interface UnexpectedAppError {
  kind: 'unexpected';
  correlationId: string;
  message: string;
  recoverable: true;
}

export type AppError =
  | ProductAppError
  | TechnicalAppError
  | ValidationAppError
  | AuthorizationAppError
  | ConflictAppError
  | OfflineAppError
  | UnexpectedAppError;

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

export function terminalIssue(code: ProductErrorCode, message: string, cause?: unknown): AppIssue {
  return { code, message, recoverable: false, cause };
}

export function isAppOk<T>(result: AppResult<T>): result is AppOkResult<T> {
  return result.ok;
}

export function validationError(field: string, message: string): AppErrorResult {
  return { ok: false, error: { kind: 'validation', field, message, recoverable: false } };
}
export function authorizationError(
  required: 'owner' | 'admin' | 'aal2' | 'master' | 'programmer',
  message: string,
): AppErrorResult {
  return { ok: false, error: { kind: 'authorization', required, message, recoverable: false } };
}
export function conflictError(resource: string, message: string): AppErrorResult {
  return { ok: false, error: { kind: 'conflict', resource, message, recoverable: false } };
}
export function offlineError(message: string): AppErrorResult {
  return { ok: false, error: { kind: 'offline_unavailable', message, recoverable: true } };
}
export function unexpectedError(message: string): AppErrorResult {
  return {
    ok: false,
    error: {
      kind: 'unexpected',
      message,
      correlationId: crypto.randomUUID(),
      recoverable: true,
    },
  };
}
