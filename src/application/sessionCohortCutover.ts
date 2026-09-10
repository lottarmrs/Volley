export function isTargetCohortSession(session: { authorityModel?: string }): boolean {
  return session.authorityModel === 'target';
}
