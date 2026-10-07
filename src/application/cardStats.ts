import type { Attributes, Player } from '@shared/types';

export interface CardStatRow {
  playerId: string;
  dimensionKey: string;
  value: number;
}

const KEYS = new Set<keyof Attributes>([
  'saque',
  'recepcao',
  'levantamento',
  'ataque',
  'bloqueio',
  'defesa',
  'velocidade',
  'resistencia',
  'leituraDeJogo',
  'regularidade',
  'controleEmocional',
]);

export function toSkillValuesMap(
  rows: CardStatRow[],
  players: Player[],
): Map<string, Partial<Attributes>> {
  const appIdByCloud = new Map(players.map((player) => [player.cloudId ?? player.id, player.id]));
  const map = new Map<string, Partial<Attributes>>();
  for (const row of rows) {
    const appId = appIdByCloud.get(row.playerId);
    if (!appId || !KEYS.has(row.dimensionKey as keyof Attributes)) continue;
    const values = map.get(appId) ?? {};
    values[row.dimensionKey as keyof Attributes] = row.value;
    map.set(appId, values);
  }
  return map;
}
