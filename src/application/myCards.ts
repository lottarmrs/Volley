import type { Attributes, Community, Player } from '@shared/types';
import {
  buildVutCard,
  editionHistory,
  type Achievement,
  type BuildVutCardContext,
  type EditionEntry,
  type VutCard,
} from '@logic/futCards';

export interface MyCard {
  community: Community;
  card: VutCard;
  achievements: { unlocked: Achievement[]; near: Achievement[]; locked: Achievement[] };
  editions: EditionEntry[];
  lastPlayedAt: string | null;
  loading: boolean;
}

type History = Omit<BuildVutCardContext, 'skillValues' | 'partnershipMatrix'>;

function daComunidade(history: History, communityId: string): History {
  const sessions = history.sessions.filter((s) => s.communityId === communityId);
  const ids = new Set(sessions.map((s) => s.id));
  return {
    ...history,
    sessions,
    teams: history.teams.filter((t) => ids.has(t.sessionId)),
    games: history.games.filter((g) => ids.has(g.sessionId)),
    pointEvents: history.pointEvents.filter((p) => ids.has(p.sessionId)),
    sessionReports: history.sessionReports.filter((r) => ids.has(r.sessionId)),
  };
}

function ultimaJogada(player: Player, history: History): string | null {
  const datas = history.sessions
    .filter((s) => s.status === 'finished')
    .filter((s) =>
      history.teams.some((t) => t.sessionId === s.id && t.playerIds.includes(player.id)),
    )
    .map((s) => s.date)
    .sort();
  return datas.length ? datas[datas.length - 1] : null;
}

export function buildMyCards(input: {
  player: Player;
  communities: Community[];
  history: History;
  skillValuesByCommunity: Map<string, Map<string, Partial<Attributes>> | undefined>;
}): MyCard[] {
  const { player, communities, history, skillValuesByCommunity } = input;
  const minhas = communities.filter((c) => (player.communityIds ?? []).includes(c.id));
  const cartas = minhas.map((community) => {
    const historico = daComunidade(history, community.id);
    const skillValues = skillValuesByCommunity.get(community.id);
    const card = buildVutCard(player, { ...historico, skillValues: skillValues ?? new Map() });
    const unlocked = card.achievements.filter((a) => a.unlocked);
    const near = card.achievements
      .filter((a) => !a.unlocked && a.target > 0 && a.current > 0)
      .sort((a, b) => b.current / b.target - a.current / a.target);
    const nearIds = new Set(near.map((a) => a.id));
    const locked = card.achievements.filter((a) => !a.unlocked && !nearIds.has(a.id));
    return {
      community,
      card,
      achievements: { unlocked, near, locked },
      editions: editionHistory(player, historico),
      lastPlayedAt: ultimaJogada(player, historico),
      loading: skillValuesByCommunity.has(community.id) && skillValues === undefined,
    };
  });
  return cartas.sort((a, b) => {
    if (a.lastPlayedAt && b.lastPlayedAt) return b.lastPlayedAt.localeCompare(a.lastPlayedAt);
    if (a.lastPlayedAt) return -1;
    if (b.lastPlayedAt) return 1;
    return a.community.name.localeCompare(b.community.name, 'pt-BR');
  });
}
