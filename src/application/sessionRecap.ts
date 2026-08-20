import type { SessionReport } from '@shared/types';

export interface RecapStanding {
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  pointDifference: number;
}

export interface RecapHighlight {
  playerId: string;
  playerName: string;
  totalPoints: number;
  aces: number;
  blocks: number;
}

export interface SessionRecap {
  sessionId: string;
  sessionName: string;
  date: string;
  totalGames: number;
  totalPoints: number;
  totalPlayers: number;
  champion: RecapStanding | null;
  standings: RecapStanding[];
  highlights: RecapHighlight[];
}

const HIGHLIGHT_LIMIT = 3;

function byPerformance(a: RecapStanding, b: RecapStanding): number {
  if (b.wins !== a.wins) return b.wins - a.wins;
  return b.pointDifference - a.pointDifference;
}

export function selectLatestSessionReport(reports: SessionReport[]): SessionReport | null {
  const live = reports.filter((report) => !report.deletedAt);
  if (live.length === 0) return null;

  return live.reduce((latest, report) =>
    report.generatedAt > latest.generatedAt ? report : latest,
  );
}

export function buildSessionRecap(report: SessionReport | null): SessionRecap | null {
  if (!report) return null;

  const standings: RecapStanding[] = report.teamStandings
    .map((standing) => ({
      teamId: standing.teamId,
      teamName: standing.teamName,
      wins: standing.wins,
      losses: standing.losses,
      pointDifference: standing.pointDifference,
    }))
    .sort(byPerformance);

  // Um campeão só existe se alguém venceu alguma coisa: uma pelada encerrada
  // antes da primeira partida não tem vencedor, tem um começo interrompido.
  const leader = standings[0];
  const champion = leader && leader.wins > 0 ? leader : null;

  const highlights: RecapHighlight[] = [...report.playerRanking]
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, HIGHLIGHT_LIMIT)
    .filter((player) => player.totalPoints > 0)
    .map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      totalPoints: player.totalPoints,
      aces: player.aces,
      blocks: player.blocks,
    }));

  return {
    sessionId: report.sessionId,
    sessionName: report.sessionName,
    date: report.date,
    totalGames: report.totalGames,
    totalPoints: report.totalPoints,
    totalPlayers: report.playerRanking.length,
    champion,
    standings,
    highlights,
  };
}
