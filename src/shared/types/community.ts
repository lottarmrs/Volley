import type {
  BalanceWeights,
  FreePlayConfig,
  Session,
  SessionType,
  TournamentConfig,
} from '../../types';
import type { CloudSyncStatus } from './sync';

export interface Community {
  id: string;
  name: string;
  description?: string;
  defaultLocation?: string;
  defaultDay?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultFormat?: SessionType;
  color?: string;
  icon?: string;
  archived?: boolean;
  /** Privacidade da comunidade (Fase E: descoberta de publicas). */
  visibility?: 'private' | 'public';
  /** Codigo/link de convite compartilhavel (null quando desativado). */
  joinCode?: string | null;
  /**
   * Dono na nuvem (auth user id). Quando presente e diferente do usuario logado,
   * a comunidade e de outro dono (entrei como membro), entao o sync nao deve
   * tentar reenvia-la. undefined = comunidade local/propria.
   */
  cloudOwnerId?: string;
  createdAt: string;
  updatedAt: string;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
}

export type CommunityPresenceStatus = 'present' | 'absent' | 'maybe' | 'unmarked' | 'guest';

export interface CommunityPresenceItem {
  playerId?: string;
  temporaryName?: string;
  status: CommunityPresenceStatus;
  note?: string;
}

export interface CommunityPresence {
  communityId: string;
  date: string;
  items: CommunityPresenceItem[];
  updatedAt: string;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
}

export interface CommunityRules {
  communityId: string;
  defaultFormat: SessionType;
  defaultLocation?: string;
  defaultDay?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  notes?: string;
  freePlay?: Partial<FreePlayConfig>;
  tournament?: Partial<TournamentConfig>;
  balanceWeights?: Partial<BalanceWeights>;
  defaultTeamNames?: string[];
  defaultTeamColors?: string[];
  updatedAt: string;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
}

export interface CommunitySummary {
  totalAthletes: number;
  activeAthletes: number;
  totalSessions: number;
  totalMatches: number;
  totalPoints: number;
  lastSession?: Session;
  lastMvpName?: string;
  mostFrequentPlayerName?: string;
  mostUsedFormat?: SessionType;
}

export type CommunityRankingFilter = 'all' | 'month' | 'last5' | 'last10' | 'season';

export interface CommunityRankingRow {
  playerId: string;
  playerName: string;
  totalPoints: number;
  attendances: number;
  wins: number;
  mvpCount: number;
  aces: number;
  blocks: number;
  attacks: number;
  gamesPlayed: number;
  winRate: number;
  presenceRate: number;
  regularity: number;
  evolution: number;
  errors?: number;
  highlights?: number;
}

export interface CommunityRanking {
  filter: CommunityRankingFilter;
  rows: CommunityRankingRow[];
}

export type AuthRole = 'master' | 'programmer' | 'user';

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  role: AuthRole;
  createdAt: string;
  updatedAt: string;
}

export type CommunityMemberRole = 'owner' | 'admin' | 'moderator' | 'organizador' | 'member';

/**
 * Estado da filiacao. 'active' = membro pleno; 'pending' = pediu para entrar e
 * aguarda aprovacao; 'invited' = convidado, ainda nao aceitou; 'rejected' =
 * pedido recusado.
 */
export type CommunityMemberStatus = 'active' | 'pending' | 'invited' | 'rejected';

export interface CommunityMember {
  id: string;
  communityId: string;
  userId: string;
  role: CommunityMemberRole;
  status?: CommunityMemberStatus;
  invitedBy?: string | null;
  name?: string | null;
  email?: string | null;
  createdAt: string;
  updatedAt: string;
}
