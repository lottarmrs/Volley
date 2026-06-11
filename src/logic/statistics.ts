import { Player, PointEvent, Game, Team, Session, Fault } from '../types';
import { isCreditedPoint } from './match';

export interface PlayerStats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPoints: number;
  aces: number;
  /** Cortadas + largadas + contra-ataques (compatível com o consumo anterior). */
  kills: number;
  cortadas: number;
  tips: number;
  defenses: number;
  blocks: number;
  /** Total de erros atribuídos ao jogador. */
  errors: number;
  /** Erros do jogador discriminados por tipo de falta. */
  errorsByType: Partial<Record<Fault, number>>;
  /** Saldo individual: pontos conquistados − erros cometidos. */
  balance: number;
  /** Percentual dos pontos do time conquistados por este jogador. */
  pointsContribution: number;
}

// Detecção por fundamento, preferindo a taxonomia nova e caindo para o reason legado.
const isAce = (p: PointEvent) => p.skill === 'saque' || (!p.skill && p.reason === 'serve_ace');
const isCortada = (p: PointEvent) => p.skill === 'ataque' || (!p.skill && p.reason === 'attack');
const isBlock = (p: PointEvent) => p.skill === 'bloqueio' || (!p.skill && p.reason === 'block');
const isDefense = (p: PointEvent) =>
  p.skill === 'defesa' || (!p.skill && p.reason === 'defense_counterattack');
// "Largada" não tem habilidade dedicada na taxonomia nova; vem do reason legado.
const isTip = (p: PointEvent) => !p.skill && p.reason === 'tip';

export function calculatePlayerStats(
  player: Player,
  allGames: Game[],
  allPoints: PointEvent[],
  allTeams: Team[],
  allSessions: Session[] = [],
): PlayerStats {
  const registeredSessionIds = new Set(
    allSessions.filter((session) => session.status === 'finished').map((session) => session.id),
  );
  const registeredGames = allGames.filter(
    (game) => game.status === 'finished' && registeredSessionIds.has(game.sessionId),
  );
  const registeredGameIds = new Set(registeredGames.map((game) => game.id));
  const playerTeams = allTeams.filter((t) => t.playerIds.includes(player.id));
  const playerTeamIds = new Set(playerTeams.map((t) => t.id));

  const playerGames = registeredGames.filter(
    (g) => playerTeamIds.has(g.teamAId) || playerTeamIds.has(g.teamBId),
  );

  const wins = playerGames.filter((g) => {
    const isTeamA = playerTeamIds.has(g.teamAId);
    return isTeamA ? g.winnerTeamId === g.teamAId : g.winnerTeamId === g.teamBId;
  }).length;

  const registeredPoints = allPoints.filter((p) => registeredGameIds.has(p.gameId));
  const playerPoints = registeredPoints.filter((p) => p.playerId === player.id);

  // Pontos conquistados (creditados) pelo jogador.
  const creditedPoints = playerPoints.filter(isCreditedPoint);
  const totalPoints = creditedPoints.length;

  const aces = creditedPoints.filter(isAce).length;
  const cortadas = creditedPoints.filter(isCortada).length;
  const blocks = creditedPoints.filter(isBlock).length;
  const defenses = creditedPoints.filter(isDefense).length;
  const tips = creditedPoints.filter(isTip).length;

  // Erros atribuídos ao jogador (taxonomia nova: pointType 'error' com o jogador
  // como autor; legado: ponto concedido pelo time do jogador por erro próprio).
  const errorPoints = registeredPoints.filter((p) => {
    if (p.playerId !== player.id) return false;
    if (p.pointType) return p.pointType === 'error';
    return p.reason === 'opponent_error' && playerTeamIds.has(p.concedingTeamId);
  });

  const errorsByType: Partial<Record<Fault, number>> = {};
  for (const p of errorPoints) {
    if (p.fault) errorsByType[p.fault] = (errorsByType[p.fault] ?? 0) + 1;
  }
  const errors = errorPoints.length;

  // Contribuição: pontos do jogador ÷ pontos conquistados pelo seu time.
  const teamCreditedPoints = registeredPoints.filter(
    (p) => isCreditedPoint(p) && playerTeamIds.has(p.scoringTeamId),
  ).length;
  const pointsContribution =
    teamCreditedPoints > 0 ? (totalPoints / teamCreditedPoints) * 100 : 0;

  return {
    gamesPlayed: playerGames.length,
    wins,
    losses: playerGames.length - wins,
    winRate: playerGames.length > 0 ? (wins / playerGames.length) * 100 : 0,
    totalPoints,
    aces,
    kills: cortadas + defenses + tips,
    cortadas,
    tips,
    defenses,
    blocks,
    errors,
    errorsByType,
    balance: totalPoints - errors,
    pointsContribution,
  };
}
