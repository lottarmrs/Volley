import type { AuthSessionState } from '@app/authSession';
import { resolveAccessLevel } from '@app/guestAccess';

export function routeForAuthState(state: AuthSessionState): string | null {
  switch (state.kind) {
    case 'initializing':
      return '/auth/loading';
    case 'anonymous':
      return '/entrar';
    case 'email_verification':
      return '/verificar-email';
    case 'onboarding':
      return '/escolher-username';
    case 'mfa_required':
      return '/confirmar-mfa';
    case 'mfa_setup_required':
      return '/configurar-mfa';
    case 'recoverable_error':
      return '/auth/recuperar-sessao';
    case 'ready':
      return null;
  }
}

const AUTH_ONLY_PATH_PREFIXES = [
  '/entrar',
  '/cadastro',
  '/auth',
  '/verificar-email',
  '/escolher-username',
  '/configurar-mfa',
  '/confirmar-mfa',
  '/recuperar-senha',
];

export function isAuthOnlyPath(pathname: string): boolean {
  return AUTH_ONLY_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export interface RouteLocation {
  pathname: string;
  search?: string;
  hash?: string;
}

export function resolveTransitionDestination(
  state: AuthSessionState,
  from: RouteLocation | undefined,
): string | RouteLocation {
  // `anonymous` nao e mais um estado forcado: o convidado entra no app em modo
  // local. Só os estados intermediarios (verificacao, MFA, onboarding, erro)
  // continuam prendendo a navegacao numa rota de autenticacao.
  const forcedRoute = resolveAccessLevel(state) === 'blocked' ? routeForAuthState(state) : null;
  if (forcedRoute) return forcedRoute;
  if (from && !isAuthOnlyPath(from.pathname)) return from;
  return '/';
}
