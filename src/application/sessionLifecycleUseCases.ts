import type {
  Community,
  CommunityRules,
  FreePlayConfig,
  Session,
  TournamentConfig,
} from '../types';
import { formatLocalDateInput } from '../logic/date';

export function buildFreePlayConfigFromCommunityRules(rules: CommunityRules): FreePlayConfig {
  const teamCount = Math.max(3, rules.freePlay?.teamCount ?? 3);
  return {
    type: 'free_play',
    teamCount,
    maxPoints: rules.freePlay?.maxPoints ?? 15,
    tieBreakMethod: rules.freePlay?.tieBreakMethod ?? 'win_by_2',
    hardPointCap: rules.freePlay?.hardPointCap ?? null,
    rotationSystem: rules.freePlay?.rotationSystem ?? 'winner_stays',
    maxConsecutiveGames: rules.freePlay?.maxConsecutiveGames ?? 3,
    initialCourtTeams: ['', ''],
    initialQueue: [],
    queuePolicy: 'fifo',
    balanceMode: rules.freePlay?.balanceMode ?? 'balanced',
    balanceSpeed: rules.freePlay?.balanceSpeed ?? 'advanced',
    balanceConstraints: rules.freePlay?.balanceConstraints,
  };
}

export function buildTournamentConfigFromCommunityRules(rules: CommunityRules): TournamentConfig {
  return {
    type: 'tournament',
    format: rules.tournament?.format ?? 'round_robin',
    teamCount: Math.max(2, rules.tournament?.teamCount ?? 3),
    useGroupStage: rules.tournament?.useGroupStage ?? false,
    groups: rules.tournament?.groups,
    qualifiedPerGroup: rules.tournament?.qualifiedPerGroup,
    roundTrip: rules.tournament?.roundTrip ?? false,
    maxPoints: rules.tournament?.maxPoints ?? 15,
    tieBreakMethod: rules.tournament?.tieBreakMethod ?? 'direct_3',
    victoryRule: rules.tournament?.victoryRule ?? rules.tournament?.tieBreakMethod ?? 'direct_3',
    hardPointCap: rules.tournament?.hardPointCap ?? null,
    hasFinal: rules.tournament?.hasFinal ?? true,
    hasThirdPlaceMatch: rules.tournament?.hasThirdPlaceMatch ?? true,
    classificationPoints: {
      win: rules.tournament?.classificationPoints?.win ?? 3,
      loss: rules.tournament?.classificationPoints?.loss ?? 0,
      walkoverWin: rules.tournament?.classificationPoints?.walkoverWin ?? 3,
      walkoverLoss: rules.tournament?.classificationPoints?.walkoverLoss ?? 0,
    },
    standingsRules: rules.tournament?.standingsRules ?? [
      'classificationPoints',
      'wins',
      'pointDifference',
      'pointsFor',
      'headToHead',
      'pointsAgainst',
    ],
    balanceMode: rules.tournament?.balanceMode ?? 'balanced',
    balanceSpeed: rules.tournament?.balanceSpeed ?? 'advanced',
    balanceConstraints: rules.tournament?.balanceConstraints,
  };
}

export function buildSessionFromCommunity(input: {
  community: Community;
  playerIds: string[];
  rules: CommunityRules;
  now: Date;
  createId: () => string;
}): { session: Session; nextWizardStep: number } {
  const type = input.rules.defaultFormat || input.community.defaultFormat || 'free_play';
  const selectedPlayerIds = Array.from(new Set(input.playerIds)).filter(Boolean);
  const config =
    type === 'tournament'
      ? buildTournamentConfigFromCommunityRules(input.rules)
      : buildFreePlayConfigFromCommunityRules(input.rules);
  const session: Session = {
    id: input.createId(),
    communityId: input.community.id,
    name: `${input.community.name} - ${input.now.toLocaleDateString('pt-BR')}`,
    date: formatLocalDateInput(input.now),
    location: input.rules.defaultLocation || input.community.defaultLocation || null,
    notes: input.rules.notes || null,
    status: 'draft',
    type,
    selectedPlayerIds,
    teamIds: [],
    config,
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
  };
  return {
    session,
    nextWizardStep: selectedPlayerIds.length > 0 ? 2 : 0,
  };
}
