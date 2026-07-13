import {
  normalizeCommunities,
  normalizeGames,
  normalizeSessionDraft,
  normalizeSessions,
  sanitizeAndConsolidateImportedBackup,
} from '../logic/migrations';

export function prepareImportedBackup(rawData: unknown) {
  const data = sanitizeAndConsolidateImportedBackup(rawData);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;

  const backup = data as Record<string, unknown>;

  return {
    ...backup,
    communities:
      backup.communities !== undefined
        ? normalizeCommunities(backup.communities as any[])
        : undefined,
    sessions:
      backup.sessions !== undefined ? normalizeSessions(backup.sessions as any[]) : undefined,
    games: backup.games !== undefined ? normalizeGames(backup.games as any[]) : undefined,
    activeSession:
      backup.activeSession !== undefined ? normalizeSessions([backup.activeSession])[0] : undefined,
    sessionDraft:
      backup.sessionDraft !== undefined ? normalizeSessionDraft(backup.sessionDraft) : undefined,
  };
}
