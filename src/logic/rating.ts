import { Player, PointEvent, Game, Team, Attributes } from '../types';
import { RATING, CONSISTENCY } from './balancingConstants';
import {
  POSITION_CRITICAL,
  SKILL_TO_ATTRIBUTE,
  FAULT_TO_ATTRIBUTE,
  getConsistencyAttrs,
} from './progression';

const isHighlight = (p: PointEvent) => p.eventKind === 'highlight';
const isCriticalFor = (pos: string, attr: keyof Attributes) =>
  (POSITION_CRITICAL[pos] || []).includes(attr);

/**
 * Exposição (rallies) de um jogo, ciente de multi-set:
 * - set único: o próprio placar.
 * - multi-set em andamento: soma dos sets fechados + o set atual.
 * - multi-set finalizado: só os sets (o set final já está em `sets[]`, e
 *   `scoreA/scoreB` o duplicam — não somar de novo).
 */
export const gameExposure = (game: Game): number => {
  const hasSets = !!game.sets && game.sets.length > 0;
  const fromSets = (game.sets || []).reduce((sum, s) => sum + (s.scoreA || 0) + (s.scoreB || 0), 0);
  const current = (game.scoreA || 0) + (game.scoreB || 0);
  if (!hasSets) return current;
  return game.status === 'finished' ? fromSets : fromSets + current;
};

/**
 * Ajuste de consistência (facilitadores) para a nota: média do desvio de taxa
 * de erro dos fundamentos do papel vs. o baseline esperado, escalado e capado.
 * Espelha o motor de progressão — os erros desses fundamentos são tratados AQUI
 * (ficam fora do somatório de δ⁻, para não punir duas vezes).
 */
function consistencyAdjustment(
  player: Player,
  consistencyAttrs: (keyof Attributes)[],
  gamePoints: PointEvent[],
  exposure: number,
): number {
  if (consistencyAttrs.length === 0 || exposure <= 0) return 0;

  const confidence = Math.min(1, exposure / CONSISTENCY.eFull);
  let sumDev = 0;
  for (const attr of consistencyAttrs) {
    const errs = gamePoints.filter(
      (p) =>
        !isHighlight(p) &&
        p.playerId === player.id &&
        p.pointType === 'error' &&
        !!p.fault &&
        FAULT_TO_ATTRIBUTE[p.fault] === attr,
    ).length;
    const taxaOk = 1 - errs / exposure;
    const baseline = CONSISTENCY.baseline[attr] ?? 0.85;
    sumDev += taxaOk - baseline;
  }
  const avgDev = sumDev / consistencyAttrs.length;
  const adj = RATING.consistScale * avgDev * confidence;
  return Math.max(-RATING.consistCap, Math.min(RATING.consistCap, adj));
}

export interface MatchRatingParams {
  player: Player;
  game: Game;
  /** Eventos pertencentes a ESTE jogo. */
  gamePoints: PointEvent[];
  /** Time do jogador neste jogo (teamAId ou teamBId). */
  playerTeamId: string;
}

/** Nota 0.00–10.00 de um jogador num único jogo. */
export function calculateMatchRating({
  player,
  game,
  gamePoints,
  playerTeamId,
}: MatchRatingParams): number {
  const exposure = gameExposure(game);
  if (exposure <= 0) return RATING.baseline;

  const pos = player.posicaoPrincipal || 'all-rounder';
  const consistencyAttrs = getConsistencyAttrs(pos);

  let posCredit = 0;
  let errDebit = 0;

  for (const pt of gamePoints) {
    // Lance de destaque (🌟) — feito explícito positivo.
    if (isHighlight(pt)) {
      if (pt.playerId === player.id) posCredit += RATING.highlight;
      continue;
    }
    // Assistência de levantamento — crédito explícito ao maestro.
    if (pt.assistPlayerId === player.id) posCredit += RATING.assist;

    if (pt.playerId !== player.id) continue;

    if (pt.pointType === 'winner') {
      posCredit += pt.skill ? (RATING.pos[pt.skill] ?? RATING.posDefault) : RATING.posDefault;
    } else if (pt.pointType === 'error' && pt.fault) {
      const attr = FAULT_TO_ATTRIBUTE[pt.fault];
      // Erros de fundamento de consistência são tratados no consistencyAdjustment.
      if (attr && consistencyAttrs.includes(attr)) continue;
      const mult = attr && isCriticalFor(pos, attr) ? RATING.criticalMult : 1;
      errDebit += RATING.error * mult;
    }
  }

  const consistAdj = consistencyAdjustment(player, consistencyAttrs, gamePoints, exposure);

  let teamResult = 0;
  if (game.status === 'finished' && game.winnerTeamId) {
    teamResult = game.winnerTeamId === playerTeamId ? RATING.win : RATING.loss;
  }

  let netRaw = RATING.baseline + posCredit - errDebit + consistAdj + teamResult;

  // Retornos decrescentes acima do topo de conforto.
  if (netRaw > RATING.topCompressFrom) {
    netRaw = RATING.topCompressFrom + (netRaw - RATING.topCompressFrom) * RATING.topCompressFactor;
  }

  // Clamp e retração à média por baixa exposição.
  const clamped = Math.max(RATING.floor, Math.min(RATING.ceiling, netRaw));
  const confidence = Math.min(1, exposure / RATING.expFull);
  const shrunk = RATING.baseline + (clamped - RATING.baseline) * confidence;

  return Math.round(shrunk * 100) / 100;
}

export interface SessionRatingParams {
  player: Player;
  /** Jogos finalizados da sessão. */
  sessionGames: Game[];
  /** Eventos da sessão (de todos os jogos). */
  sessionPoints: PointEvent[];
  /** Times da sessão (para resolver o time do jogador em cada jogo). */
  teams: Team[];
}

/**
 * Nota da sessão: média das notas de jogo ponderada pela exposição (rallies).
 * Retorna null se o jogador não teve exposição suficiente em nenhum jogo.
 */
export function calculateSessionRating({
  player,
  sessionGames,
  sessionPoints,
  teams,
}: SessionRatingParams): number | null {
  const playerTeamIds = new Set(
    teams.filter((t) => t.playerIds.includes(player.id)).map((t) => t.id),
  );
  if (playerTeamIds.size === 0) return null;

  let weighted = 0;
  let totalExposure = 0;

  for (const game of sessionGames) {
    if (game.status !== 'finished') continue;
    const playerTeamId = [game.teamAId, game.teamBId].find((id) => playerTeamIds.has(id));
    if (!playerTeamId) continue;

    const exposure = gameExposure(game);
    if (exposure < RATING.expMinGame) continue;

    const gamePoints = sessionPoints.filter((p) => p.gameId === game.id);
    const rating = calculateMatchRating({ player, game, gamePoints, playerTeamId });

    weighted += rating * exposure;
    totalExposure += exposure;
  }

  if (totalExposure === 0) return null;
  return Math.round((weighted / totalExposure) * 100) / 100;
}

/**
 * Anexa a nota da sessão ao histórico de forma (`formaAtual.ultimasPartidas`),
 * mantendo as últimas `maxHistory`. NÃO mexe em `formaAtual.valor` — o override
 * manual do técnico continua existindo ao lado da forma automática.
 */
export function applySessionRatingToForm(
  players: Player[],
  sessionGames: Game[],
  sessionPoints: PointEvent[],
  teams: Team[],
  maxHistory = 10,
): Player[] {
  return players.map((player) => {
    const rating = calculateSessionRating({ player, sessionGames, sessionPoints, teams });
    if (rating == null) return player;

    const prev = player.formaAtual?.ultimasPartidas ?? [];
    const ultimasPartidas = [...prev, rating].slice(-maxHistory);

    return {
      ...player,
      formaAtual: { ...player.formaAtual, ultimasPartidas },
      syncStatus: 'pending',
      updatedAt: new Date().toISOString(),
    };
  });
}

/**
 * Notas ao vivo de todos os jogadores em quadra para o jogo corrente.
 * O resultado do time entra como 0 enquanto o jogo não acaba (calculateMatchRating
 * só aplica win/loss em jogo finalizado); cedo no jogo a baixa exposição puxa
 * todos para perto do baseline e as notas vão divergindo conforme o placar sobe.
 */
export function calculateLiveGameRatings(
  game: Game,
  gamePoints: PointEvent[],
  teams: Team[],
  players: Player[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const teamId of [game.teamAId, game.teamBId]) {
    const team = teams.find((t) => t.id === teamId);
    if (!team) continue;
    for (const pid of team.playerIds) {
      const player = players.find((p) => p.id === pid);
      if (!player) continue;
      out[pid] = calculateMatchRating({ player, game, gamePoints, playerTeamId: teamId });
    }
  }
  return out;
}

/** Forma automática = média das últimas notas de partida (null se sem histórico). */
export function autoFormFromHistory(player: Player): number | null {
  const hist = player.formaAtual?.ultimasPartidas ?? [];
  if (hist.length === 0) return null;
  const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
  return Math.round(avg * 100) / 100;
}
