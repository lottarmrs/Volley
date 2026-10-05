import type { Player, Session } from '@shared/types';
import {
  buildVutCard,
  type Achievement,
  type BuildVutCardContext,
  type VutCard,
} from '@logic/futCards';
import { calculatePlayerStats } from '@logic/statistics';
import { calculateSessionRating } from '@logic/rating';

export interface AthleteNight {
  sessionId: string;
  card: VutCard;
  specialEdition: boolean;
  newAchievements: Achievement[];
  nearAchievements: Achievement[];
  tierUp: boolean;
  games: number;
  wins: number;
  points: number;
  rating: number | null;
}

const TIER_ORDER = ['bronze', 'silver', 'gold', 'elite'];

function withoutSession(history: BuildVutCardContext, sessionId: string): BuildVutCardContext {
  return {
    ...history,
    partnershipMatrix: undefined,
    sessions: history.sessions.filter((s) => s.id !== sessionId),
    teams: history.teams.filter((t) => t.sessionId !== sessionId),
    games: history.games.filter((g) => g.sessionId !== sessionId),
    pointEvents: history.pointEvents.filter((p) => p.sessionId !== sessionId),
    sessionReports: history.sessionReports.filter((r) => r.sessionId !== sessionId),
  };
}

export function buildAthleteNight(input: {
  player: Player;
  session: Session;
  history: BuildVutCardContext;
}): AthleteNight | null {
  const { player, session, history } = input;
  const teams = history.teams.filter((t) => t.sessionId === session.id);
  if (!teams.some((t) => t.playerIds.includes(player.id))) return null;
  const games = history.games.filter((g) => g.sessionId === session.id);
  const points = history.pointEvents.filter((p) => p.sessionId === session.id);

  const before = buildVutCard(player, withoutSession(history, session.id));
  const after = buildVutCard(player, history);

  const unlockedBefore = new Set(before.achievements.filter((a) => a.unlocked).map((a) => a.id));
  const newAchievements = after.achievements.filter((a) => a.unlocked && !unlockedBefore.has(a.id));
  const nearAchievements = after.achievements
    .filter((a) => !a.unlocked && a.target > 0 && a.current > 0)
    .sort((a, b) => b.current / b.target - a.current / a.target)
    .slice(0, 2);

  const stats = calculatePlayerStats(player, games, points, teams, [session]);

  return {
    sessionId: session.id,
    card: after,
    specialEdition: after.edition.kind !== 'base',
    newAchievements,
    nearAchievements,
    tierUp:
      before.stats.rated &&
      after.stats.rated &&
      TIER_ORDER.indexOf(after.stats.tier) > TIER_ORDER.indexOf(before.stats.tier),
    games: stats.gamesPlayed,
    wins: stats.wins,
    points: stats.totalPoints,
    rating: calculateSessionRating({ player, sessionGames: games, sessionPoints: points, teams }),
  };
}
