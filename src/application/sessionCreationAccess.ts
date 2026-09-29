export type SessionCreationAccess = 'pending' | 'allowed' | 'blocked';

export function resolveSessionCreationAccess(input: {
  pending: boolean;
  allowed: boolean;
}): SessionCreationAccess {
  if (input.pending) return 'pending';
  return input.allowed ? 'allowed' : 'blocked';
}
