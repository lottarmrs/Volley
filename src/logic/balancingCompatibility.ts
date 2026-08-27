import type { Attributes, Player, PlayerBalanceSnapshot, Position } from '../types';

const ATTRIBUTE_KEYS = [
  'ataque',
  'defesa',
  'saque',
  'recepcao',
  'levantamento',
  'bloqueio',
  'velocidade',
  'resistencia',
  'leituraDeJogo',
  'regularidade',
  'controleEmocional',
] as const;

const MID_SCALE = 5;

export function computeAttributeFallback(players: Player[]): Attributes {
  const fallback = {} as Attributes;
  for (const key of ATTRIBUTE_KEYS) {
    const values = players
      .map((player) => player.atributos?.[key])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    fallback[key] = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : MID_SCALE;
  }
  return fallback;
}

export function isPlayerEstimated(player: Player): boolean {
  return !ATTRIBUTE_KEYS.some(
    (key) => typeof player.atributos?.[key] === 'number' && Number.isFinite(player.atributos[key]),
  );
}

export function mapPlayerToBalanceSnapshot(
  player: Player,
  sessionPosition?: Position,
  fallback?: Attributes,
): PlayerBalanceSnapshot {
  const resolve = (key: (typeof ATTRIBUTE_KEYS)[number]) =>
    (typeof player.atributos?.[key] === 'number' && Number.isFinite(player.atributos[key])
      ? player.atributos[key]
      : undefined) ??
    (typeof fallback?.[key] === 'number' && Number.isFinite(fallback[key]) ? fallback[key] : undefined) ??
    MID_SCALE;

  return {
    participantId: player.id,
    attack: resolve('ataque'),
    defense: resolve('defesa'),
    serve: resolve('saque'),
    reception: resolve('recepcao'),
    setting: resolve('levantamento'),
    block: resolve('bloqueio'),
    speed: resolve('velocidade'),
    stamina: resolve('resistencia'),
    gameVision: resolve('leituraDeJogo'),
    consistency: resolve('regularidade'),
    emotionalControl: resolve('controleEmocional'),
    heightCm: player.alturaCm ?? null,
    gender: player.genero ?? null,
    position: sessionPosition ?? player.posicaoPrincipal ?? null,
    secondaryPositions: player.posicoesSecundarias ?? [],
    isInjured: player.status?.lesionado ?? false,
    isEstimated: isPlayerEstimated(player),
  };
}

export function mapPlayersToBalanceSnapshots(
  players: Player[],
  positionOverrides: Partial<Record<string, Position>> = {},
): PlayerBalanceSnapshot[] {
  const fallback = computeAttributeFallback(players);
  return players.map((player) =>
    mapPlayerToBalanceSnapshot(player, positionOverrides[player.id], fallback),
  );
}
