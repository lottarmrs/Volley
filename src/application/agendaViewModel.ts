import type {
  Championship,
  ChampionshipRound,
  ChampionshipTeam,
  Community,
  Session,
} from '@shared/types';

export interface AgendaItem {
  id: string;
  kind: 'session' | 'round';
  refId: string;
  date: string;
  title: string;
  communityId: string;
  communityName: string;
}

export interface AgendaInput {
  today: string;
  communities: Community[];
  sessions: Session[];
  championships: Championship[];
  championshipTeams: ChampionshipTeam[];
  championshipRounds: ChampionshipRound[];
}

const CLOSED_STATUSES = new Set(['finished', 'cancelled']);

export function buildAgendaItems(input: AgendaInput): AgendaItem[] {
  const nameByCommunity = new Map(input.communities.map((c) => [c.id, c.name]));

  const sessionItems: AgendaItem[] = input.sessions
    .filter((session) => !!session && !session.deletedAt)
    .filter((session) => !!session.communityId && nameByCommunity.has(session.communityId))
    .filter((session) => !CLOSED_STATUSES.has(session.status))
    .filter((session) => !!session.date && session.date >= input.today)
    .map((session) => ({
      id: `session:${session.id}`,
      kind: 'session' as const,
      refId: session.id,
      date: session.date,
      title: session.name,
      communityId: session.communityId as string,
      communityName: nameByCommunity.get(session.communityId as string) as string,
    }));

  const championshipById = new Map(input.championships.map((c) => [c.id, c]));
  const teamById = new Map(input.championshipTeams.map((t) => [t.id, t]));

  const roundItems: AgendaItem[] = input.championshipRounds
    .filter((round) => !!round && !round.deletedAt && !round.skipped && !round.sessionId)
    .filter((round) => !!round.scheduledDate && round.scheduledDate >= input.today)
    .map((round): AgendaItem | null => {
      const championship = championshipById.get(round.championshipId);
      if (!championship || !nameByCommunity.has(championship.communityId)) return null;
      const teamA = teamById.get(round.teamAId)?.name ?? 'Time A';
      const teamB = teamById.get(round.teamBId)?.name ?? 'Time B';
      return {
        id: `round:${round.id}`,
        kind: 'round' as const,
        refId: round.id,
        date: round.scheduledDate,
        title: `${teamA} x ${teamB}`,
        communityId: championship.communityId,
        communityName: nameByCommunity.get(championship.communityId) as string,
      };
    })
    .filter((item): item is AgendaItem => item !== null);

  return [...sessionItems, ...roundItems].sort((a, b) => a.date.localeCompare(b.date));
}
