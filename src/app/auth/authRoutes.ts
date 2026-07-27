import type { AuthSessionState } from '@app/authSession';

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
