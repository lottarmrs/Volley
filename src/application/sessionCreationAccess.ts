export type SessionCreationAccess = 'pending' | 'allowed' | 'blocked';

export function resolveSessionCreationAccess(input: {
  membersResolved: boolean;
  canCreateSession: boolean;
}): SessionCreationAccess {
  if (!input.membersResolved) return 'pending';
  return input.canCreateSession ? 'allowed' : 'blocked';
}
