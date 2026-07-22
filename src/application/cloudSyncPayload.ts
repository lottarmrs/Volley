import { normalizeGames, normalizeSessions } from '../logic/migrations';
import type {
  Community,
  CommunityPresence,
  CommunityRules,
  Game,
  GameReport,
  Player,
  PlayerLinkProposal,
  PointEvent,
  Session,
  SessionReport,
  Team,
  WhatsAppListDraft,
  WhatsAppListTemplate,
} from '../types';
import type { LocalSyncPayload } from './cloudSyncUseCases';

export interface CloudSyncPayloadCollections {
  communities: Community[];
  players: Player[];
  rules: CommunityRules[];
  templates: WhatsAppListTemplate[];
  drafts: WhatsAppListDraft[];
  sessions: Session[];
  teams: Team[];
  games: Game[];
  pointEvents: PointEvent[];
  gameReports: GameReport[];
  sessionReports: SessionReport[];
  presenceRecords: CommunityPresence[];
  linkProposals: PlayerLinkProposal[];
}

export function buildLocalSyncPayload(collections: CloudSyncPayloadCollections): LocalSyncPayload {
  return {
    communities: collections.communities,
    players: collections.players,
    rules: collections.rules,
    templates: collections.templates,
    sessions: collections.sessions,
    teams: collections.teams,
    games: collections.games,
    pointEvents: collections.pointEvents,
    gameReports: collections.gameReports,
    sessionReports: collections.sessionReports,
    presenceRecords: collections.presenceRecords,
    drafts: collections.drafts,
    linkProposals: collections.linkProposals,
  };
}

export function normalizeCloudSyncResultPayload(result: LocalSyncPayload): LocalSyncPayload {
  return {
    ...result,
    sessions: normalizeSessions(result.sessions),
    games: normalizeGames(result.games),
  };
}
