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
