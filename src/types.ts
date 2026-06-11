/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Gender = 'M' | 'F';

export interface Attributes {
  saque: number;
  recepcao: number;
  levantamento: number;
  ataque: number;
  bloqueio: number;
  defesa: number;
  velocidade: number;
  resistencia: number;
  leituraDeJogo: number;
  regularidade: number;
  controleEmocional: number;
}

export type Position = 'levantador' | 'oposto' | 'ponteiro' | 'central' | 'libero' | 'all-rounder';

export type RotationType = '6x0' | '5x1';

/** Composição alvo por papel para uma equipe (usada no 5x1). */
export interface RoleComposition {
  levantador: number; // 1
  ponteiro: number; // 2
  oposto: number; // 1
  central: number; // 1 (ou 2 no fallback)
  libero: number; // 1 (ou 0 no fallback)
}

export interface Player {
  id: string;
  /** Globally unique, human-readable handle for the athlete (slug of the name). */
  username?: string;
  nome: string;
  apelido: string;
  genero: Gender;
  ativo: boolean;
  posicaoPrincipal: Position;
  posicoesSecundarias: Position[];
  alturaCm?: number;
  maoDominante: 'direita' | 'esquerda';
  atributos: Attributes;
  perfil: {
    nivel: number;
    classe: string;
    arquetipo: string;
    especialidade: string;
    fraqueza: string;
  };
  formaAtual: {
    valor: number;
    observacao: string;
    ultimasPartidas: number[];
  };
  status: {
    lesionado: boolean;
    limitacaoFisica: string | null;
    presencaFrequente: boolean;
  };
  metadata: {
    criadoEm: string;
    atualizadoEm: string;
  };
  communityIds?: string[];
  isGuest?: boolean;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt?: string;
}

export interface TeamStrengthSnapshot {
  overall: number;
  attack: number;
  reception: number;
  setting: number;
  defense: number;
  block: number;
  serve: number;
  regularity: number;
  stamina: number;
  gameReading: number;
  averageHeight?: number | null;
  netPresence: number;
  maleCount: number;
  femaleCount: number;
}

export interface GameReport {
  id: string;
  sessionId: string;
  gameId: string;
  sequenceNumber: number;
  generatedAt: string;

  teamA: {
    id: string;
    name: string;
    playerIds: string[];
    playerNames: string[];
    score: number;
  };

  teamB: {
    id: string;
    name: string;
    playerIds: string[];
    playerNames: string[];
    score: number;
  };

  winnerTeamId: string;
  winnerTeamName: string;
  loserTeamId: string;
  loserTeamName: string;

  startedAt?: string | null;
  finishedAt?: string | null;

  totalPoints: number;

  playerStats: {
    playerId: string;
    playerName: string;
    teamId: string;
    teamName: string;
    totalPoints: number;
    attacks: number;
    blocks: number;
    aces: number;
    tips: number;
    counterAttacks: number;
  }[];
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt?: string;
}

export interface SessionReport {
  id: string;
  sessionId: string;
  generatedAt: string;

  sessionName: string;
  date: string;
  type: SessionType;
  rules: {
    maxPoints: number;
    tieBreakMethod: string;
    rotationSystem?: string;
    maxConsecutiveGames?: number | null;
  };

  totalGames: number;
  totalPoints: number;

  teamStandings: {
    teamId: string;
    teamName: string;
    wins: number;
    losses: number;
    classificationPoints?: number;
    pointsFor: number;
    pointsAgainst: number;
    pointDifference: number;
    winRate?: number;
  }[];

  playerRanking: {
    playerId: string;
    playerName: string;
    totalPoints: number;
    attacks: number;
    blocks: number;
    aces: number;
    tips: number;
    counterAttacks: number;
  }[];

  games: GameReport[];
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt?: string;
}

export type OverallMetric = keyof Attributes | 'altura';
export type PositionWeights = Partial<Record<OverallMetric, number>>;

export interface Team {
  id: string;
  sessionId: string;
  name: string;
  color?: string;
  playerIds: string[];
  generatedByAlgorithm: boolean;
  locked: boolean;
  strengthSnapshot: TeamStrengthSnapshot;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt?: string;
}

export type StandingRule =
  | 'wins'
  | 'classificationPoints'
  | 'pointDifference'
  | 'pointsFor'
  | 'headToHead'
  | 'pointsAgainst';

export type TournamentFormat =
  | 'round_robin'
  | 'double_round_robin'
  | 'knockout'
  | 'group_stage'
  | 'groups_knockout';

export interface TournamentGroup {
  id: string;
  name: string;
  teamIds: string[];
}

export interface TournamentConfig {
  type: 'tournament';
  format: TournamentFormat;
  teamCount: number;
  useGroupStage: boolean;
  groups?: TournamentGroup[];
  qualifiedPerGroup?: number;
  roundTrip: boolean;
  maxPoints: number;
  tieBreakMethod: 'direct_3' | 'win_by_2';
  victoryRule?: 'direct_3' | 'win_by_2';
  hardPointCap?: number | null;
  hasFinal: boolean;
  hasThirdPlaceMatch: boolean;
  classificationPoints: {
    win: number;
    loss: number;
    walkoverWin?: number;
    walkoverLoss?: number;
  };
  standingsRules: StandingRule[];
  balanceMode?: 'balanced' | 'competitive' | 'social' | 'mixed';
  balanceSpeed?: 'fast' | 'normal' | 'advanced';
  balanceConstraints?: BalanceConstraints;
  rotationType?: RotationType; // default '6x0'
  repetitionWeight?: number;
  balanceSeed?: number;
}

export interface FreePlayConfig {
  type: 'free_play';
  teamCount: number;
  maxPoints: number;
  tieBreakMethod: 'direct_3' | 'win_by_2';
  hardPointCap?: number | null;
  rotationSystem: 'winner_stays' | 'max_consecutive_games';
  maxConsecutiveGames?: number | null;
  initialCourtTeams: [string, string];
  initialQueue: string[];
  queuePolicy: 'fifo';
  balanceMode?: 'balanced' | 'competitive' | 'social' | 'mixed';
  balanceSpeed?: 'fast' | 'normal' | 'advanced';
  balanceConstraints?: BalanceConstraints;
  rotationType?: RotationType; // default '6x0'
  repetitionWeight?: number;
  balanceSeed?: number;
}

export type SessionStatus =
  | 'draft'
  | 'players_selected'
  | 'configured'
  | 'teams_generated'
  | 'active'
  | 'paused'
  | 'finished'
  | 'cancelled';

export type SessionType = 'tournament' | 'free_play';

export interface Session {
  id: string;
  communityId?: string | null;
  name: string;
  date: string;
  location?: string | null;
  notes?: string | null;
  status: SessionStatus;
  type?: SessionType;
  selectedPlayerIds: string[];
  teamIds: string[];
  config?: TournamentConfig | FreePlayConfig;
  createdAt: string;
  updatedAt: string;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
}

export type GameStatus = 'scheduled' | 'active' | 'paused' | 'finished' | 'cancelled' | 'walkover';

export interface Game {
  id: string;
  sessionId: string;
  type: SessionType;
  sequenceNumber: number;
  round?: number;
  stage?: 'group' | 'semifinal' | 'final' | 'third_place' | 'free_play';
  groupId?: string | null;
  teamAId: string;
  teamBId: string;
  scoreA: number;
  scoreB: number;
  winnerTeamId?: string | null;
  loserTeamId?: string | null;
  status: GameStatus;
  startedAt?: string | null;
  finishedAt?: string | null;
  finishReason?: 'auto' | 'manual' | 'walkover' | null;
  pointIds: string[];
  metadata?: {
    court?: string | null;
    notes?: string | null;
    originalTeamAId?: string | null;
    originalTeamBId?: string | null;
  };
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt?: string;
}

export type PointReason =
  | 'attack'
  | 'block'
  | 'serve_ace'
  | 'opponent_error'
  | 'defense_counterattack'
  | 'tip'
  | 'unknown';

// ─── Event taxonomy (nomenclatura do vôlei) ───────────────────────────────────

export type PointType = 'winner' | 'error';

export type Skill =
  | 'saque'
  | 'recepcao'
  | 'levantamento'
  | 'ataque'
  | 'bloqueio'
  | 'defesa'
  | 'posicionamento';

export type Fault =
  | 'saque_fora'
  | 'saque_rede'
  | 'ataque_fora'
  | 'ataque_rede'
  | 'dois_toques'
  | 'conducao'
  | 'quatro_toques'
  | 'toque_apoiado'
  | 'toque_rede'
  | 'invasao_quadra'
  | 'invasao_rede'
  | 'ataque_linha_ataque'
  | 'libero_ataque'
  | 'libero_levantamento_frente'
  | 'libero_bloqueio'
  | 'libero_saque'
  | 'bloqueio_fora_antena'
  | 'posicao_rotacao';

export type GameWinner = 'A' | 'B' | null;

export interface PointEvent {
  id: string;
  sessionId: string;
  gameId: string;
  sequenceNumber: number;
  scoringTeamId: string;
  concedingTeamId: string;
  playerId?: string | null;
  reason?: PointReason; // legado (mantido para retrocompat de leitura)
  pointType?: PointType; // novo
  skill?: Skill; // novo (quando pointType === 'winner')
  fault?: Fault; // novo (quando pointType === 'error')
  playerTeamId?: string | null; // time do autor (crédito/débito correto)
  scoreBefore: {
    teamA: number;
    teamB: number;
  };
  scoreAfter: {
    teamA: number;
    teamB: number;
  };
  timestamp: string;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt?: string;
}

export interface BalanceWeights {
  overall: number;
  attack: number;
  defense: number;
  setting: number;
  block: number;
  reception: number;
  serve: number;
  height: number;
  gender: number;
  injured: number;
  teamSize: number;
  roleCoverage: number;
  consistency: number;
  emotionalControl: number;
  netPresence: number;
  repetition?: number;
}

export interface BalanceConstraints {
  lockedPlayerIdxs?: Record<string, number>; // playerId -> teamIndex (0-indexed)
  pairsTogether?: [string, string][]; // pairs of playerIds that must be in the same team
  pairsSeparated?: [string, string][]; // pairs of playerIds that must be in different teams
}

export interface AthleteVector {
  id: string;
  name: string;
  overall: number;
  attack: number;
  defense: number;
  serve: number;
  reception: number;
  setting: number;
  block: number;
  speed: number;
  stamina: number;
  gameVision: number;
  consistency: number;
  emotionalControl: number;
  heightCm: number | null;
  gender: 'M' | 'F';
  position: string;
  secondaryPositions?: string[];
  isInjured: boolean;
  currentForm: number;
}

export interface TeamMetrics {
  teamIndex: number;
  size: number;
  overall: number;
  attack: number;
  defense: number;
  serve: number;
  reception: number;
  setting: number;
  block: number;
  speed: number;
  stamina: number;
  gameVision: number;
  consistency: number;
  emotionalControl: number;
  averageHeight: number;
  maleCount: number;
  femaleCount: number;
  injuredCount: number;
  hasSetter: boolean;
  hasStrongAttacker: boolean;
  hasDefensiveReference: boolean;
  netPresence: number;
}

export interface TeamSolution {
  teams: AthleteVector[][];
}

export type BalanceQuality = 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'UNBALANCED';

export interface BalanceDiagnostics {
  objectiveScore: number;
  qualityLabel: BalanceQuality;
  overallSpread: number;
  attackSpread: number;
  defenseSpread: number;
  settingSpread: number;
  blockSpread: number;
  receptionSpread: number;
  heightSpread: number;
  genderBalancePenalty: number;
  injuredPenalty: number;
  roleCoveragePenalty: number;
  teamSizePenalty: number;
  warnings: string[];
}

export interface Division {
  teams: Team[];
  penalty: number;
  score: number; // Final imbalance score
  explanation?: string[];
  diagnostics?: BalanceDiagnostics;
  algorithm?: string;
  seed?: number;
  iterations?: number;
  runtimeMillis?: number;
  qualityLabel?: string;
  rawSolution?: TeamSolution;
}

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

export interface WhatsAppListTemplate {
  id: string;
  communityId: string;
  name: string;
  title: string;
  category?: string;
  defaultLocation?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultValue?: number;
  pixKey?: string;
  pixHolder?: string;
  pixBank?: string;
  paymentDeadline?: string;
  paymentNote?: string;
  settersCount: number;
  mainSlotsCount: number;
  reserveSlotsCount: number;
  settersSectionTitle: string;
  reserveSectionTitle: string;
  showLockIcon: boolean;
  paymentSymbol: string;
  extraText?: string;
  createdAt: string;
  updatedAt: string;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
}

export interface WhatsAppListSlot {
  index: number;
  playerId?: string;
  displayName?: string;
  note?: string;
  paid?: boolean;
}

export interface WhatsAppListDraft {
  id: string;
  communityId: string;
  templateId?: string;
  title: string;
  date: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  value?: number;
  pixKey?: string;
  pixHolder?: string;
  pixBank?: string;
  paymentDeadline?: string;
  paymentNote?: string;
  setters: WhatsAppListSlot[];
  mainSlots: WhatsAppListSlot[];
  reserveSlots: WhatsAppListSlot[];
  settersSectionTitle: string;
  reserveSectionTitle: string;
  showLockIcon: boolean;
  paymentSymbol: string;
  extraText?: string;
  createdAt: string;
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
}

export interface CommunityRanking {
  filter: CommunityRankingFilter;
  rows: CommunityRankingRow[];
}

export interface ShareBlock {
  id: string;
  label: string;
  text: string;
}

export type CloudSyncStatus = 'local' | 'pending' | 'synced' | 'conflict' | 'error';

export type AuthRole = 'admin' | 'organizer';

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  role: AuthRole;
  createdAt: string;
  updatedAt: string;
}

export type CommunityMemberRole = 'owner' | 'admin' | 'organizer';

export interface CommunityMember {
  id: string;
  communityId: string;
  userId: string;
  role: CommunityMemberRole;
  name?: string | null;
  email?: string | null;
  createdAt: string;
  updatedAt: string;
}
