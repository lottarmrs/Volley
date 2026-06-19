import { Player, Attributes, PointEvent, Game, Team, Position } from '../types';
import { getAutoSpecialty, getAutoWeakness } from './calculations';
import { CONSISTENCY } from './balancingConstants';

/**
 * Atributos cujo valor está em ações NÃO-terminais (um passe perfeito, um
 * levantamento perfeito). Para esses papéis a progressão é por TAXA DE ERRO
 * (motor de consistência), não por evento — senão o atributo só cairia.
 */
const CONSISTENCY_ATTRS: Partial<Record<Position, (keyof Attributes)[]>> = {
  levantador: ['levantamento'],
  libero: ['recepcao', 'defesa'],
};

export const getConsistencyAttrs = (pos: string): (keyof Attributes)[] =>
  CONSISTENCY_ATTRS[pos as Position] ?? [];

export const POSITION_CRITICAL: Record<string, string[]> = {
  levantador: ['levantamento', 'leituraDeJogo', 'regularidade'],
  oposto: ['ataque', 'saque', 'bloqueio'],
  ponteiro: ['ataque', 'recepcao', 'defesa'],
  central: ['bloqueio', 'ataque', 'velocidade'],
  libero: ['recepcao', 'defesa', 'regularidade'],
  'all-rounder': ['regularidade', 'leituraDeJogo', 'resistencia'],
};

export const SKILL_TO_ATTRIBUTE: Record<string, keyof Attributes> = {
  saque: 'saque',
  recepcao: 'recepcao',
  levantamento: 'levantamento',
  ataque: 'ataque',
  bloqueio: 'bloqueio',
  defesa: 'defesa',
  largada: 'ataque',
};

export const FAULT_TO_ATTRIBUTE: Record<string, keyof Attributes> = {
  // Legado
  saque_fora: 'saque',
  saque_rede: 'saque',
  ataque_fora: 'ataque',
  ataque_rede: 'ataque',
  ataque_linha_ataque: 'ataque',
  libero_ataque: 'ataque',
  dois_toques: 'levantamento',
  conducao: 'levantamento',
  quatro_toques: 'levantamento',
  bloqueio_fora_antena: 'bloqueio',
  libero_bloqueio: 'bloqueio',
  toque_rede: 'regularidade',
  invasao_quadra: 'regularidade',
  invasao_rede: 'regularidade',
  toque_apoiado: 'regularidade',
  posicao_rotacao: 'leituraDeJogo',
  libero_levantamento_frente: 'leituraDeJogo',

  // Novos da taxonomia
  // Saque -> saque
  serve_out: 'saque',
  serve_net: 'saque',
  serve_no_cross: 'saque',
  serve_foot_fault: 'saque',
  serve_wrong_order: 'saque',
  serve_screen: 'saque',

  // Recepção -> recepcao
  reception_floor: 'recepcao',
  reception_out: 'recepcao',
  reception_net: 'recepcao',
  reception_double: 'recepcao',
  reception_catch: 'recepcao',
  reception_communication: 'recepcao',

  // Levantamento -> levantamento
  setting_double: 'levantamento',
  setting_catch: 'levantamento',
  setting_out: 'levantamento',
  setting_net: 'levantamento',
  setting_too_low: 'levantamento',
  setting_too_close: 'levantamento',

  // Ataque -> ataque
  attack_out: 'ataque',
  attack_net: 'ataque',
  attack_blocked: 'ataque',
  attack_antenna: 'ataque',
  attack_back_row_fault: 'ataque',
  attack_opponent_serve: 'ataque',
  attack_catch: 'ataque',
  tip_catch: 'ataque',
  tip_out: 'ataque',

  // Bloqueio -> bloqueio
  block_out: 'bloqueio',
  block_net: 'bloqueio',
  block_invasion: 'bloqueio',
  block_before_attack: 'bloqueio',
  block_serve: 'bloqueio',
  block_back_row: 'bloqueio',
  block_antenna: 'bloqueio',

  // Defesa -> defesa
  defense_floor: 'defesa',
  defense_out: 'defesa',
  defense_net: 'defesa',
  defense_tip_missed: 'defesa',
  defense_coverage_error: 'defesa',
  defense_communication: 'defesa',

  // Toque/controle -> regularidade
  four_touches: 'regularidade',
  double_contact: 'regularidade',
  catch: 'regularidade',
  assisted_hit: 'regularidade',

  // Rede/invasão -> regularidade
  net_touch: 'regularidade',
  antenna_touch: 'regularidade',
  over_net_fault: 'regularidade',
  under_net_interference: 'regularidade',
  center_line_full_foot: 'regularidade',
  opponent_interference: 'regularidade',

  // Posição/rotação -> leituraDeJogo
  position_fault: 'leituraDeJogo',
  rotation_fault: 'leituraDeJogo',
  wrong_server: 'leituraDeJogo',

  // Líbero
  libero_attack: 'ataque',
  libero_serve: 'saque',
  libero_block: 'bloqueio',
  libero_block_attempt: 'bloqueio',
  libero_front_zone_set_attack: 'leituraDeJogo',
  libero_illegal_replacement: 'regularidade',
  libero_late_replacement: 'regularidade',
  libero_wrong_zone_replacement: 'regularidade',

  // Substituição -> controleEmocional
  illegal_substitution: 'controleEmocional',
  unauthorized_substitution_request: 'controleEmocional',
  substitution_limit_exceeded: 'controleEmocional',

  // Retardamento/admin -> controleEmocional
  delay_restart: 'controleEmocional',
  delay_regular_interruption: 'controleEmocional',
  improper_request: 'controleEmocional',

  // Conduta -> controleEmocional
  rude_conduct: 'controleEmocional',
  offensive_conduct: 'controleEmocional',
  aggression: 'controleEmocional',

  // Outros -> regularidade
  team_error: 'regularidade',
  unknown_error: 'regularidade',
  manual_error: 'regularidade',
};

/** Peso do delta por-evento: 0.1 se o atributo é crítico para a posição, senão 0.05. */
function weightFor(player: Player, attr: keyof Attributes): number {
  const pos = player.posicaoPrincipal || 'all-rounder';
  return (POSITION_CRITICAL[pos] || []).includes(attr) ? 0.1 : 0.05;
}

export function calculateAttributeProgression(
  players: Player[],
  sessionPoints: PointEvent[],
  sessionGames: Game[] = [],
  sessionTeams: Team[] = [],
): Player[] {
  const deltas: Record<string, Partial<Record<keyof Attributes, number>>> = {};
  const playerById = new Map(players.map((p) => [p.id, p]));

  const add = (pid: string, attr: keyof Attributes, val: number) => {
    if (!deltas[pid]) deltas[pid] = {};
    deltas[pid]![attr] = (deltas[pid]![attr] || 0) + val;
  };

  // ── Passo 1: deltas por-evento (winner / error / highlight / assist) ──────
  // Para atributos de consistência isto serve de fallback; o Passo 2 sobrescreve
  // quando há exposição suficiente.
  sessionPoints.forEach((pt) => {
    if (pt.playerId) {
      const p = playerById.get(pt.playerId);
      if (p) {
        if (pt.eventKind === 'highlight' && pt.skill) {
          // Lance de destaque (🌟): feito explícito positivo no fundamento.
          const attr = SKILL_TO_ATTRIBUTE[pt.skill];
          if (attr) add(pt.playerId, attr, weightFor(p, attr));
        } else if (pt.pointType === 'winner' && pt.skill) {
          const attr = SKILL_TO_ATTRIBUTE[pt.skill];
          if (attr) add(pt.playerId, attr, weightFor(p, attr));
        } else if (pt.pointType === 'error' && pt.fault) {
          const attr = FAULT_TO_ATTRIBUTE[pt.fault];
          if (attr) add(pt.playerId, attr, -weightFor(p, attr));
        }
      }
    }
    // Assistência de levantamento: crédito explícito ao levantador.
    if (pt.assistPlayerId && pt.eventKind !== 'highlight') {
      const a = playerById.get(pt.assistPlayerId);
      if (a) add(pt.assistPlayerId, 'levantamento', weightFor(a, 'levantamento'));
    }
  });

  // ── Passo 2: motor de consistência (papéis facilitadores) ─────────────────
  // Substitui o per-evento por uma TAXA DE ERRO contextualizada pela exposição.
  for (const p of players) {
    const consistencyAttrs = getConsistencyAttrs(p.posicaoPrincipal || 'all-rounder');
    if (consistencyAttrs.length === 0) continue;

    const playerTeamIds = new Set(
      sessionTeams.filter((t) => t.playerIds.includes(p.id)).map((t) => t.id),
    );
    const playerGames = sessionGames.filter(
      (g) =>
        g.status === 'finished' && (playerTeamIds.has(g.teamAId) || playerTeamIds.has(g.teamBId)),
    );
    // Exposição estimada ≈ total de rallies (cada rally vira 1 ponto no placar).
    const exposure = playerGames.reduce((sum, g) => sum + (g.scoreA || 0) + (g.scoreB || 0), 0);
    if (exposure < CONSISTENCY.eMin) continue; // sem volume confiável → mantém per-evento

    const confidence = Math.min(1, exposure / CONSISTENCY.eFull);

    for (const attr of consistencyAttrs) {
      const baseline = CONSISTENCY.baseline[attr] ?? 0.85;

      const errs = sessionPoints.filter(
        (pt) =>
          pt.eventKind !== 'highlight' &&
          pt.playerId === p.id &&
          pt.pointType === 'error' &&
          !!pt.fault &&
          FAULT_TO_ATTRIBUTE[pt.fault] === attr,
      ).length;

      // Feitos explícitos do atributo: winners/highlights próprios + assists (levantamento).
      const feats = sessionPoints.filter((pt) => {
        if (attr === 'levantamento' && pt.eventKind !== 'highlight' && pt.assistPlayerId === p.id)
          return true;
        if (pt.playerId !== p.id || !pt.skill) return false;
        if (SKILL_TO_ATTRIBUTE[pt.skill] !== attr) return false;
        return pt.eventKind === 'highlight' || pt.pointType === 'winner';
      }).length;

      const taxaOk = 1 - errs / exposure;
      const rawDelta = CONSISTENCY.k * (taxaOk - baseline) * confidence;

      const current = p.atributos[attr] ?? 5;
      const ceilingFactor = Math.max(
        0,
        Math.min(1, (CONSISTENCY.ceiling - current) / (CONSISTENCY.ceiling - 5)),
      );
      // Consistência positiva é freada pelo teto; negativa não. Feitos explícitos furam o teto.
      const consistComponent = rawDelta >= 0 ? rawDelta * ceilingFactor : rawDelta;
      const featComponent = feats * weightFor(p, attr);

      let delta = consistComponent + featComponent;
      delta = Math.max(-CONSISTENCY.sessionCap, Math.min(CONSISTENCY.sessionCap, delta));

      // Sobrescreve o per-evento do Passo 1 para este atributo.
      if (!deltas[p.id]) deltas[p.id] = {};
      deltas[p.id]![attr] = delta;
    }
  }

  return players.map((p) => {
    const pDeltas = deltas[p.id];
    if (!pDeltas) return p;

    const updatedAttrs = { ...p.atributos };
    let changed = false;

    Object.entries(pDeltas).forEach(([attr, delta]) => {
      const key = attr as keyof Attributes;
      const current = updatedAttrs[key] ?? 5;
      const next = Math.max(1, Math.min(10, current + delta));
      const nextRounded = Math.round(next * 100) / 100;

      if (nextRounded !== current) {
        updatedAttrs[key] = nextRounded;
        changed = true;
      }
    });

    if (!changed) return p;

    const now = new Date().toISOString();
    const updatedPlayer: Player = {
      ...p,
      atributos: updatedAttrs,
      syncStatus: 'pending',
      updatedAt: now,
      metadata: {
        ...p.metadata,
        atualizadoEm: now,
      },
    };

    updatedPlayer.perfil = {
      ...updatedPlayer.perfil,
      especialidade: getAutoSpecialty(updatedPlayer),
      fraqueza: getAutoWeakness(updatedPlayer),
    };

    return updatedPlayer;
  });
}
