import type { AccountSnapshot } from './accountUseCases';

export type AuthSessionState =
  | { kind: 'initializing' }
  | { kind: 'anonymous' }
  | { kind: 'email_verification'; userId: string }
  | { kind: 'onboarding'; userId: string; playerId: string }
  | { kind: 'mfa_required'; userId: string; account: AccountSnapshot }
  | { kind: 'mfa_setup_required'; userId: string; account: AccountSnapshot }
  | { kind: 'ready'; userId: string; account: AccountSnapshot }
  | { kind: 'recoverable_error'; userId: string; message: string };

export interface SessionIdentity {
  userId: string;
  emailConfirmed: boolean;
}

export interface AssuranceLevel {
  current: 'aal1' | 'aal2' | null;
  next: 'aal1' | 'aal2' | null;
}

export function resolveAuthSessionState(input: {
  session: SessionIdentity | null;
  account?: AccountSnapshot | null;
  aal?: AssuranceLevel | null;
}): AuthSessionState {
  if (!input.session) return { kind: 'anonymous' };
  if (!input.session.emailConfirmed) {
    return { kind: 'email_verification', userId: input.session.userId };
  }
  if (!input.account || input.account.state === 'needs_username') {
    return {
      kind: 'onboarding',
      userId: input.session.userId,
      playerId: input.account?.playerId ?? '',
    };
  }
  if (input.aal?.next === 'aal2' && input.aal.current !== 'aal2') {
    return { kind: 'mfa_required', userId: input.session.userId, account: input.account };
  }
  if (input.account.requiresAal2 && input.aal?.next !== 'aal2') {
    return { kind: 'mfa_setup_required', userId: input.session.userId, account: input.account };
  }
  return { kind: 'ready', userId: input.session.userId, account: input.account };
}
