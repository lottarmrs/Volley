import type { CloudSyncStatus } from './sync';
import type { Attributes, Gender, Position, RotationType } from './player';

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
  sets?: { scoreA: number; scoreB: number }[];
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
    errors?: number;
    highlights?: number;
    rating?: number;
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
    errors?: number;
    highlights?: number;
    rating?: number;
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
  championshipTeamId?: string;
  strengthSnapshot: TeamStrengthSnapshot;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt?: string;
}

export interface ChampionshipRecurrenceRule {
  daysOfWeek: number[];
  time: string;
  startDate: string;
  endDate?: string | null;
}

export interface Championship {
  id: string;
  communityId: string;
  name: string;
  format: 'round_robin' | 'double_round_robin';
  classificationPoints: {
    win: number;
    loss: number;
    walkoverWin?: number;
    walkoverLoss?: number;
  };
  recurrenceRule: ChampionshipRecurrenceRule;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChampionshipTeam {
  id: string;
  championshipId: string;
  name: string;
  playerIds: string[];
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  updatedAt?: string;
}

export interface ChampionshipRound {
  id: string;
  championshipId: string;
  round: number;
  teamAId: string; // ChampionshipTeam.id
  teamBId: string; // ChampionshipTeam.id
  scheduledDate: string;
  skipped: boolean;
  sessionId?: string;
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
  'round_robin' | 'double_round_robin' | 'knockout' | 'group_stage' | 'groups_knockout';

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
  roundRobinPlayoffs?: boolean;
  playoffSetTargets?: number[];
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
  rotationType?: RotationType;
  playerPositions?: Record<string, Position>;
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
  rotationType?: RotationType;
  playerPositions?: Record<string, Position>;
  repetitionWeight?: number;
  balanceSeed?: number;
}

export type SessionConfig = TournamentConfig | FreePlayConfig;

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
  config?: SessionConfig;
  createdAt: string;
  updatedAt: string;
  cloudId?: string;
  syncStatus?: CloudSyncStatus;
  lastSyncedAt?: string;
  deletedAt?: string;
  /** Quem está com o controle desta sessão. Preenchido pelo download. */
  controlledByUserId?: string | null;
  controlClaimedAt?: string | null;
  controlDeviceId?: string | null;
  /** Nome de exibição de quem controla, resolvido no download para a tela poder nomear. */
  controlHolderName?: string | null;
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
  sets?: { scoreA: number; scoreB: number }[];
  setTargets?: number[];
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
  'attack' | 'block' | 'serve_ace' | 'opponent_error' | 'defense_counterattack' | 'tip' | 'unknown';

export type PointType = 'winner' | 'error';

export type Skill =
  'saque' | 'recepcao' | 'levantamento' | 'ataque' | 'bloqueio' | 'defesa' | 'largada';

export type ErrorCategory =
  | 'serve'
  | 'reception'
  | 'setting'
  | 'attack'
  | 'block'
  | 'defense'
  | 'ball_handling'
  | 'net_invasion'
  | 'position_rotation'
  | 'libero'
  | 'substitution'
  | 'delay_admin'
  | 'conduct'
  | 'other';

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
  | 'posicao_rotacao'
  | 'serve_out'
  | 'serve_net'
  | 'serve_no_cross'
  | 'serve_foot_fault'
  | 'serve_wrong_order'
  | 'serve_screen'
  | 'reception_floor'
  | 'reception_out'
  | 'reception_net'
  | 'reception_double'
  | 'reception_catch'
  | 'reception_communication'
  | 'setting_double'
  | 'setting_catch'
  | 'setting_out'
  | 'setting_net'
  | 'setting_too_low'
  | 'setting_too_close'
  | 'attack_out'
  | 'attack_net'
  | 'attack_blocked'
  | 'attack_antenna'
  | 'attack_back_row_fault'
  | 'attack_opponent_serve'
  | 'attack_catch'
  | 'tip_catch'
  | 'tip_out'
  | 'block_out'
  | 'block_net'
  | 'block_invasion'
  | 'block_before_attack'
  | 'block_serve'
  | 'block_back_row'
  | 'block_antenna'
  | 'defense_floor'
  | 'defense_out'
  | 'defense_net'
  | 'defense_tip_missed'
  | 'defense_coverage_error'
  | 'defense_communication'
  | 'four_touches'
  | 'double_contact'
  | 'catch'
  | 'assisted_hit'
  | 'net_touch'
  | 'antenna_touch'
  | 'over_net_fault'
  | 'under_net_interference'
  | 'center_line_full_foot'
  | 'opponent_interference'
  | 'position_fault'
  | 'rotation_fault'
  | 'wrong_server'
  | 'libero_attack'
  | 'libero_serve'
  | 'libero_block'
  | 'libero_block_attempt'
  | 'libero_front_zone_set_attack'
  | 'libero_illegal_replacement'
  | 'libero_late_replacement'
  | 'libero_wrong_zone_replacement'
  | 'illegal_substitution'
  | 'unauthorized_substitution_request'
  | 'substitution_limit_exceeded'
  | 'delay_restart'
  | 'delay_regular_interruption'
  | 'improper_request'
  | 'rude_conduct'
  | 'offensive_conduct'
  | 'aggression'
  | 'team_error'
  | 'unknown_error'
  | 'manual_error';

export type GameWinner = 'A' | 'B' | null;

export type EventKind = 'point' | 'highlight';

export interface PointEvent {
  id: string;
  sessionId: string;
  gameId: string;
  sequenceNumber: number;
  scoringTeamId: string;
  concedingTeamId: string;
  playerId?: string | null;
  reason?: PointReason;
  pointType?: PointType;
  skill?: Skill;
  fault?: Fault;
  eventKind?: EventKind;
  assistPlayerId?: string | null;
  playerTeamId?: string | null;
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
  /** Marca de conflito de placar concorrente. Ausente = sem conflito. */
  conflictStatus?: 'pending_decision' | 'resolved_keep_mine' | 'resolved_keep_theirs';
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
  lockedPlayerIdxs?: Record<string, number>;
  pairsTogether?: [string, string][];
  pairsSeparated?: [string, string][];
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
  // Nulos de verdade: jogador criado junto com a conta nasce sem genero e sem
  // posicao. Todos os consumidores comparam por igualdade ('M'/'F', 'central'...),
  // entao um nulo simplesmente nao entra em nenhuma contagem — que e o comportamento
  // correto, o mesmo de SessionSetupSummary.
  gender: Gender | null;
  position: string | null;
  secondaryPositions?: string[];
  isInjured: boolean;
  currentForm: number;
  isEstimated: boolean;
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
  averageForm: number;
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
  genderSpread: number;
  injuredPenalty: number;
  injuredSpread: number;
  formSpread: number;
  roleCoveragePenalty: number;
  teamSizePenalty: number;
  warnings: string[];
}

export interface Division {
  teams: Team[];
  penalty: number;
  score: number;
  explanation?: string[];
  diagnostics?: BalanceDiagnostics;
  algorithm?: string;
  seed?: number;
  iterations?: number;
  runtimeMillis?: number;
  qualityLabel?: string;
  rawSolution?: TeamSolution;
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

export interface ShareBlock {
  id: string;
  label: string;
  text: string;
}
