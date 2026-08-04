import {
  normalizeCommunities,
  normalizeGames,
  normalizeSessionDraft,
  normalizeSessions,
  sanitizeAndConsolidateImportedBackup,
} from '../logic/migrations';
import type { SessionDraft } from '../logic/sessionDraft';
import type {
  Community,
  CommunityPresence,
  CommunityRules,
  Championship,
  ChampionshipRound,
  ChampionshipTeam,
  Game,
  GameReport,
  Player,
  PointEvent,
  Session,
  SessionReport,
  Team,
  WhatsAppListDraft,
  WhatsAppListTemplate,
} from '../types';

export function buildBackupFileName(exportedAt: Date): string {
  return `panelinha_backup_${exportedAt.toISOString().slice(0, 10)}.json`;
}

export function buildBackupPayload(input: {
  players: Player[];
  sessions: Session[];
  teams: Team[];
  games: Game[];
  pointEvents: PointEvent[];
  gameReports: GameReport[];
  sessionReports: SessionReport[];
  communities: Community[];
  communityPresence: CommunityPresence[];
  whatsAppListTemplates: WhatsAppListTemplate[];
  whatsAppListDrafts: WhatsAppListDraft[];
  communityRules: CommunityRules[];
  championships: Championship[];
  championshipTeams: ChampionshipTeam[];
  championshipRounds: ChampionshipRound[];
  activeSession: Session | null;
  sessionDraft: SessionDraft | null;
  lastSelectedPlayerIds: string[] | null;
  lastSessionConfig: unknown;
}) {
  return {
    players: input.players,
    sessions: input.sessions,
    teams: input.teams,
    games: input.games,
    pointEvents: input.pointEvents,
    gameReports: input.gameReports,
    sessionReports: input.sessionReports,
    communities: input.communities,
    communityPresence: input.communityPresence,
    whatsAppListTemplates: input.whatsAppListTemplates,
    whatsAppListDrafts: input.whatsAppListDrafts,
    communityRules: input.communityRules,
    championships: input.championships,
    championshipTeams: input.championshipTeams,
    championshipRounds: input.championshipRounds,
    activeSession: input.activeSession,
    sessionDraft: input.sessionDraft,
    lastSelectedPlayerIds: input.lastSelectedPlayerIds,
    lastSessionConfig: input.lastSessionConfig,
  };
}

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

type ImportPersistenceAction<T> =
  | { kind: 'ignore' }
  | { kind: 'save'; value: T }
  | { kind: 'clear' };

export function buildImportedBackupPersistencePlan(input: {
  sessionDraft?: SessionDraft | null;
  lastSelectedPlayerIds?: string[] | null;
  lastSessionConfig?: unknown;
}): {
  sessionDraft: ImportPersistenceAction<SessionDraft>;
  lastSelectedPlayerIds: ImportPersistenceAction<string[]>;
  lastSessionConfig: ImportPersistenceAction<unknown>;
} {
  return {
    sessionDraft: toImportPersistenceAction(input.sessionDraft),
    lastSelectedPlayerIds: toImportPersistenceAction(input.lastSelectedPlayerIds),
    lastSessionConfig: toImportPersistenceAction(input.lastSessionConfig),
  };
}

function toImportPersistenceAction<T>(value: T | null | undefined): ImportPersistenceAction<T> {
  if (value === undefined) return { kind: 'ignore' };
  if (value) return { kind: 'save', value };
  return { kind: 'clear' };
}
