import { Player, Attributes, PointEvent } from '../types';
import { getAutoSpecialty, getAutoWeakness } from './calculations';

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

export function calculateAttributeProgression(
  players: Player[],
  sessionPoints: PointEvent[]
): Player[] {
  const deltas: Record<string, Partial<Record<keyof Attributes, number>>> = {};

  sessionPoints.forEach((pt) => {
    if (!pt.playerId) return;
    const p = players.find((x) => x.id === pt.playerId);
    if (!p) return;

    const pos = p.posicaoPrincipal || 'all-rounder';
    const criticalAttrs = POSITION_CRITICAL[pos] || [];

    if (pt.pointType === 'winner' && pt.skill) {
      const attr = SKILL_TO_ATTRIBUTE[pt.skill];
      if (attr) {
        const isCritical = criticalAttrs.includes(attr);
        const val = isCritical ? 0.1 : 0.05;

        if (!deltas[pt.playerId]) deltas[pt.playerId] = {};
        deltas[pt.playerId]![attr] = (deltas[pt.playerId]![attr] || 0) + val;
      }
    } else if (pt.pointType === 'error' && pt.fault) {
      const attr = FAULT_TO_ATTRIBUTE[pt.fault];
      if (attr) {
        const isCritical = criticalAttrs.includes(attr);
        const val = isCritical ? -0.1 : -0.05;

        if (!deltas[pt.playerId]) deltas[pt.playerId] = {};
        deltas[pt.playerId]![attr] = (deltas[pt.playerId]![attr] || 0) + val;
      }
    }
  });

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
