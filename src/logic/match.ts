import { Game, PointEvent, PointReason, Skill, Fault, Team, Player } from '../types';

export const POINT_REASON_LABELS: Record<PointReason, string> = {
  attack: 'Ataque',
  block: 'Bloqueio',
  serve_ace: 'Ace',
  opponent_error: 'Erro adversário',
  defense_counterattack: 'Contra-ataque',
  tip: 'Largada',
  unknown: 'Não informado',
};

// Termos do vôlei para as ações positivas (ponto nosso).
export const SKILL_LABELS: Record<Skill, string> = {
  saque: 'Ace (Saque)',
  recepcao: 'Recepção',
  levantamento: 'Levantamento',
  ataque: 'Cortada (Ataque)',
  bloqueio: 'Bloqueio',
  defesa: 'Defesa',
  largada: 'Largada / Pingada',
};

// Termos do vôlei para os erros (faltas).
export const FAULT_LABELS: Record<Fault, string> = {
  // Legado
  saque_fora: 'Saque para fora',
  saque_rede: 'Saque na rede',
  ataque_fora: 'Ataque para fora',
  ataque_rede: 'Ataque na rede',
  dois_toques: 'Dois toques',
  conducao: 'Condução',
  quatro_toques: 'Quatro toques',
  toque_apoiado: 'Toque apoiado',
  toque_rede: 'Toque na rede',
  invasao_quadra: 'Invasão de quadra',
  invasao_rede: 'Invasão da rede',
  ataque_linha_ataque: 'Ataque atrás da linha de ataque',
  libero_ataque: 'Líbero atacando',
  libero_levantamento_frente: 'Líbero levantou à frente da linha',
  libero_bloqueio: 'Líbero bloqueando',
  libero_saque: 'Líbero sacando',
  bloqueio_fora_antena: 'Bloqueio fora da antena',
  posicao_rotacao: 'Erro de rodízio / posição',

  // Novos da taxonomia de erro de saque
  serve_out: 'Saque para fora',
  serve_net: 'Saque na rede',
  serve_no_cross: 'Saque não cruzou a rede',
  serve_foot_fault: 'Falta de pé no saque',
  serve_wrong_order: 'Saque fora da ordem',
  serve_screen: 'Barreira no saque',

  // Novos da recepção
  reception_floor: 'Recepção direta no chão',
  reception_out: 'Recepção para fora',
  reception_net: 'Recepção na rede',
  reception_double: 'Dois toques na recepção',
  reception_catch: 'Condução na recepção',
  reception_communication: 'Falha de comunicação na recepção',

  // Novos do levantamento
  setting_double: 'Dois toques no levantamento',
  setting_catch: 'Condução no levantamento',
  setting_out: 'Levantamento para fora',
  setting_net: 'Levantamento na rede',
  setting_too_low: 'Levantamento baixo demais',
  setting_too_close: 'Levantamento colado na rede',

  // Novos do ataque
  attack_out: 'Ataque para fora',
  attack_net: 'Ataque na rede',
  attack_blocked: 'Ataque bloqueado',
  attack_antenna: 'Ataque tocou antena',
  attack_back_row_fault: 'Ataque irregular do fundo',
  attack_opponent_serve: 'Ataque irregular em saque',
  attack_catch: 'Ataque conduzido',
  tip_catch: 'Largada conduzida',
  tip_out: 'Largada para fora',

  // Novos do bloqueio
  block_out: 'Bloqueio para fora',
  block_net: 'Toque na rede no bloqueio',
  block_invasion: 'Invasão no bloqueio',
  block_before_attack: 'Bloqueio antes do ataque',
  block_serve: 'Bloqueio do saque',
  block_back_row: 'Bloqueio irregular do fundo',
  block_antenna: 'Bloqueio por fora da antena',

  // Novos da defesa
  defense_floor: 'Defesa direta no chão',
  defense_out: 'Defesa para fora',
  defense_net: 'Defesa na rede',
  defense_tip_missed: 'Largada não defendida',
  defense_coverage_error: 'Erro de cobertura',
  defense_communication: 'Falha de comunicação na defesa',

  // Novos do toque/controle
  four_touches: 'Quatro toques',
  double_contact: 'Dois toques (toque)',
  catch: 'Condução / bola retida',
  assisted_hit: 'Toque apoiado',

  // Novos de rede/invasão
  net_touch: 'Tocou na rede',
  antenna_touch: 'Tocou na antena',
  over_net_fault: 'Invasão por cima',
  under_net_interference: 'Invasão por baixo',
  center_line_full_foot: 'Pé completamente no outro lado',
  opponent_interference: 'Interferência no adversário',

  // Novos de posição/rotação
  position_fault: 'Falta de posição',
  rotation_fault: 'Falta de rotação',
  wrong_server: 'Sacador errado',

  // Novos do líbero
  libero_attack: 'Líbero atacando acima da rede',
  libero_serve: 'Líbero sacando',
  libero_block: 'Líbero bloqueando',
  libero_block_attempt: 'Líbero tentando bloquear',
  libero_front_zone_set_attack: 'Ataque pós-levantamento do Líbero',
  libero_illegal_replacement: 'Troca ilegal do Líbero',
  libero_late_replacement: 'Troca tardia do Líbero',
  libero_wrong_zone_replacement: 'Troca fora da zona do Líbero',

  // Novos de substituição
  illegal_substitution: 'Substituição ilegal',
  unauthorized_substitution_request: 'Pedido de substituição não autorizado',
  substitution_limit_exceeded: 'Limite de substituições excedido',

  // Novos de retardamento/admin
  delay_restart: 'Atraso no reinício do jogo',
  delay_regular_interruption: 'Prolongamento de interrupção',
  improper_request: 'Solicitação indevida',

  // Novos de conduta
  rude_conduct: 'Conduta rude',
  offensive_conduct: 'Conduta ofensiva',
  aggression: 'Agressão / conduta física',

  // Outros
  team_error: 'Erro coletivo / do time',
  unknown_error: 'Erro não identificado',
  manual_error: 'Erro registrado manualmente',
};

// Mapeia uma habilidade (taxonomia nova) para o `reason` legado, mantendo
// compatibilidade com leituras e estatísticas antigas.
const SKILL_TO_REASON: Record<Skill, PointReason> = {
  saque: 'serve_ace',
  ataque: 'attack',
  bloqueio: 'block',
  defesa: 'defense_counterattack',
  recepcao: 'unknown',
  levantamento: 'unknown',
  largada: 'tip',
};

export function skillToReason(skill: Skill): PointReason {
  return SKILL_TO_REASON[skill] ?? 'unknown';
}

const CREDITED_REASONS: PointReason[] = [
  'attack',
  'block',
  'serve_ace',
  'defense_counterattack',
  'tip',
];

/** Um ponto conta para o ranking individual quando foi conquistado ativamente. */
export function isCreditedPoint(point: PointEvent): boolean {
  // Lances de destaque (highlight) são só gamificação — nunca contam como ponto.
  if (point.eventKind === 'highlight') return false;
  // Taxonomia nova: crédito por ponto conquistado (winner).
  if (point.pointType) return point.pointType === 'winner';
  // Legado: crédito pelos reasons históricos.
  return CREDITED_REASONS.includes(point.reason ?? 'unknown');
}

export function calculatePlayerScoringRanking(pointEvents: PointEvent[]) {
  const ranking: Record<string, number> = {};

  pointEvents.forEach((point) => {
    if (!point.playerId) return;
    if (!isCreditedPoint(point)) return;

    ranking[point.playerId] = (ranking[point.playerId] || 0) + 1;
  });

  return Object.entries(ranking)
    .map(([playerId, points]) => ({ playerId, points }))
    .sort((a, b) => b.points - a.points);
}

/**
 * Camada de RECONHECIMENTO (não-rating): destaca facilitadores que somem na
 * estatística de ponto. Maestro = levantador com mais assistências; Muralha =
 * jogador com mais lances/defesas. Derivado só de sinais já registrados.
 */
export interface SessionRecognition {
  maestro?: { playerId: string; count: number };
  muralha?: { playerId: string; count: number };
}

export function calculateSessionRecognition(points: PointEvent[]): SessionRecognition {
  const assists: Record<string, number> = {};
  const defenses: Record<string, number> = {};

  for (const p of points) {
    if (p.assistPlayerId && p.eventKind !== 'highlight') {
      assists[p.assistPlayerId] = (assists[p.assistPlayerId] || 0) + 1;
    }
    const isDefensive =
      (p.eventKind === 'highlight' && (p.skill === 'defesa' || p.skill === 'recepcao')) ||
      (p.eventKind !== 'highlight' && p.pointType === 'winner' && p.skill === 'defesa');
    if (isDefensive && p.playerId) {
      defenses[p.playerId] = (defenses[p.playerId] || 0) + 1;
    }
  }

  const top = (rec: Record<string, number>) => Object.entries(rec).sort((a, b) => b[1] - a[1])[0];
  const m = top(assists);
  const d = top(defenses);

  return {
    maestro: m ? { playerId: m[0], count: m[1] } : undefined,
    muralha: d ? { playerId: d[0], count: d[1] } : undefined,
  };
}

export function calculateTeamSessionStats(games: Game[], teamIds: string[]) {
  return teamIds
    .map((teamId) => {
      const finishedGames = games.filter(
        (g) =>
          (g.status === 'finished' || g.status === 'walkover') &&
          (g.teamAId === teamId || g.teamBId === teamId),
      );

      const wins = finishedGames.filter((g) => g.winnerTeamId === teamId).length;
      const losses = finishedGames.filter((g) => g.loserTeamId === teamId).length;

      const pointsFor = finishedGames.reduce((sum, game) => {
        if (game.teamAId === teamId) return sum + game.scoreA;
        if (game.teamBId === teamId) return sum + game.scoreB;
        return sum;
      }, 0);

      const pointsAgainst = finishedGames.reduce((sum, game) => {
        if (game.teamAId === teamId) return sum + game.scoreB;
        if (game.teamBId === teamId) return sum + game.scoreA;
        return sum;
      }, 0);

      return {
        teamId,
        gamesPlayed: finishedGames.length,
        wins,
        losses,
        pointsFor,
        pointsAgainst,
        pointDifference: pointsFor - pointsAgainst,
      };
    })
    .sort(
      (a, b) =>
        b.wins - a.wins || b.pointDifference - a.pointDifference || b.pointsFor - a.pointsFor,
    );
}

export function getPointLabel(point: PointEvent, teams: Team[], players: Player[]) {
  const team = teams.find((t) => t.id === point.scoringTeamId);
  const player = players.find((p) => p.id === point.playerId);
  // Lance de destaque: rótulo próprio, fora da taxonomia de ponto/erro.
  if (point.eventKind === 'highlight') {
    return {
      score: `${point.scoreAfter.teamA}x${point.scoreAfter.teamB}`,
      teamName: team?.name ?? 'Time',
      playerName: player?.nome ?? 'Lance',
      reason: point.skill ? `Lance · ${SKILL_LABELS[point.skill]}` : 'Lance 🌟',
    };
  }
  // Prefere a taxonomia nova (skill/fault); cai para o reason legado.
  const reason = point.skill
    ? SKILL_LABELS[point.skill]
    : point.fault
      ? FAULT_LABELS[point.fault]
      : POINT_REASON_LABELS[point.reason ?? 'unknown'];

  return {
    score: `${point.scoreAfter.teamA}x${point.scoreAfter.teamB}`,
    teamName: team?.name ?? 'Time',
    playerName: player?.nome ?? 'Ponto do time',
    reason,
  };
}
