import type { PointEvent, Player, Position, ChampionshipRecurrenceRule } from '../types';
import type { AwardWinner } from './tournament';
import { isCreditedPoint } from './match';

export function generateRoundDates(rule: ChampionshipRecurrenceRule, roundCount: number): string[] {
  const dates: string[] = [];
  const sortedDays = [...rule.daysOfWeek].sort((a, b) => a - b);
  if (sortedDays.length === 0 || roundCount <= 0) return dates;

  const endBoundary = rule.endDate ? new Date(`${rule.endDate}T23:59:59`) : null;
  const cursor = new Date(`${rule.startDate}T00:00:00`);

  while (dates.length < roundCount) {
    if (endBoundary && cursor > endBoundary) break;
    if (sortedDays.includes(cursor.getDay())) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const d = String(cursor.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}T${rule.time}`);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

const POSITIONS: Position[] = ['levantador', 'oposto', 'ponteiro', 'central', 'libero'];

export function calculateAwardsByPosition(
  pointEvents: PointEvent[],
  players: Player[],
): Partial<Record<Position, AwardWinner>> {
  const counts: Record<string, number> = {};
  const acesByPlayer: Record<string, number> = {};
  const blocksByPlayer: Record<string, number> = {};

  for (const point of pointEvents) {
    if (!point.playerId || !isCreditedPoint(point)) continue;
    counts[point.playerId] = (counts[point.playerId] || 0) + 1;
    if (point.skill === 'saque')
      acesByPlayer[point.playerId] = (acesByPlayer[point.playerId] || 0) + 1;
    if (point.skill === 'bloqueio')
      blocksByPlayer[point.playerId] = (blocksByPlayer[point.playerId] || 0) + 1;
  }

  const playerById = new Map(players.map((p) => [p.id, p]));
  const result: Partial<Record<Position, AwardWinner>> = {};

  for (const position of POSITIONS) {
    const candidates = Object.entries(counts).filter(
      ([playerId]) => playerById.get(playerId)?.posicaoPrincipal === position,
    );
    if (candidates.length === 0) continue;

    const [topPlayerId, topValue] = candidates.sort(
      (a, b) =>
        b[1] - a[1] ||
        (acesByPlayer[b[0]] || 0) - (acesByPlayer[a[0]] || 0) ||
        (blocksByPlayer[b[0]] || 0) - (blocksByPlayer[a[0]] || 0),
    )[0];

    const player = playerById.get(topPlayerId);
    result[position] = {
      playerId: topPlayerId,
      playerName: player?.apelido || player?.nome || 'Atleta',
      value: topValue,
    };
  }

  return result;
}

export function remapTeamIdsForChampionship<
  T extends {
    teamAId: string;
    teamBId: string;
    winnerTeamId?: string | null;
    loserTeamId?: string | null;
  },
>(games: T[], championshipTeamIdByLocal: Map<string, string>): T[] {
  const remap = (id: string | null | undefined) =>
    id ? (championshipTeamIdByLocal.get(id) ?? id) : id;

  return games.map((game) => ({
    ...game,
    teamAId: remap(game.teamAId) as string,
    teamBId: remap(game.teamBId) as string,
    winnerTeamId: remap(game.winnerTeamId),
    loserTeamId: remap(game.loserTeamId),
  }));
}
