import { Community, Game, Session, TournamentConfig } from '../types';

const DEFAULT_TOURNAMENT_CONFIG: TournamentConfig = {
  type: 'tournament',
  format: 'round_robin',
  teamCount: 3,
  useGroupStage: false,
  roundTrip: false,
  maxPoints: 15,
  tieBreakMethod: 'direct_3',
  victoryRule: 'direct_3',
  hasFinal: false,
  hasThirdPlaceMatch: false,
  classificationPoints: { win: 3, loss: 0, walkoverWin: 3, walkoverLoss: 0 },
  standingsRules: [
    'classificationPoints',
    'wins',
    'pointDifference',
    'pointsFor',
    'headToHead',
    'pointsAgainst',
  ],
};

export function normalizeTournamentConfig(config: any): TournamentConfig {
  return {
    ...DEFAULT_TOURNAMENT_CONFIG,
    ...config,
    type: 'tournament',
    format: config?.format || (config?.roundTrip ? 'double_round_robin' : 'round_robin'),
    victoryRule:
      config?.victoryRule || config?.tieBreakMethod || DEFAULT_TOURNAMENT_CONFIG.tieBreakMethod,
    tieBreakMethod:
      config?.tieBreakMethod || config?.victoryRule || DEFAULT_TOURNAMENT_CONFIG.tieBreakMethod,
    classificationPoints: {
      ...DEFAULT_TOURNAMENT_CONFIG.classificationPoints,
      ...(config?.classificationPoints || {}),
    },
    standingsRules: config?.standingsRules?.length
      ? config.standingsRules
      : DEFAULT_TOURNAMENT_CONFIG.standingsRules,
  };
}

export function normalizeSession(session: any): Session {
  if (!session) return session;
  const isTournament =
    session.type === 'championship' ||
    session.type === 'tournament' ||
    session.config?.type === 'championship' ||
    session.config?.type === 'tournament';

  if (!isTournament) {
    return {
      ...session,
      communityId: session.communityId ?? null,
    };
  }

  return {
    ...session,
    communityId: session.communityId ?? null,
    type: 'tournament',
    config: normalizeTournamentConfig(session.config),
  };
}

export function normalizeSessions(sessions: any[]): Session[] {
  return Array.isArray(sessions) ? sessions.map(normalizeSession) : [];
}

export function normalizeGame(game: any): Game {
  if (!game) return game;
  return {
    ...game,
    type: game.type === 'championship' ? 'tournament' : game.type,
  };
}

export function normalizeGames(games: any[]): Game[] {
  return Array.isArray(games) ? games.map(normalizeGame) : [];
}

export function normalizeSessionDraft(draft: any) {
  if (!draft?.session) return draft;
  return {
    ...draft,
    session: normalizeSession(draft.session),
  };
}

export function normalizeCommunity(community: any): Community {
  const now = new Date().toISOString();
  return {
    id: community?.id || `community-${Date.now()}`,
    name: community?.name || 'Comunidade',
    description: community?.description || '',
    defaultLocation: community?.defaultLocation || '',
    defaultDay: community?.defaultDay || '',
    defaultStartTime: community?.defaultStartTime || '',
    defaultEndTime: community?.defaultEndTime || '',
    defaultFormat: community?.defaultFormat || 'free_play',
    color: community?.color || 'primary',
    icon: community?.icon || 'volleyball',
    archived: Boolean(community?.archived),
    createdAt: community?.createdAt || now,
    updatedAt: community?.updatedAt || now,
  };
}

export function normalizeCommunities(communities: any[]): Community[] {
  return Array.isArray(communities) ? communities.map(normalizeCommunity) : [];
}
