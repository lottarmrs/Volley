import type { Player } from '../types';

function normalizeDuplicateText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function duplicatePlayerProfileKey(
  player: Pick<Player, 'nome' | 'genero' | 'posicaoPrincipal' | 'alturaCm'>,
) {
  const name = normalizeDuplicateText(player.nome);
  if (!name) return undefined;

  return [
    name,
    normalizeDuplicateText(player.genero),
    normalizeDuplicateText(player.posicaoPrincipal),
    player.alturaCm ?? '',
  ].join(':');
}

export function findDuplicatePlayerByProfile(
  players: Player[],
  candidate: Pick<Player, 'id' | 'nome' | 'genero' | 'posicaoPrincipal' | 'alturaCm'>,
) {
  const candidateKey = duplicatePlayerProfileKey(candidate);
  if (!candidateKey) return undefined;

  return players.find(
    (player) =>
      player.id !== candidate.id &&
      !player.deletedAt &&
      player.ativo !== false &&
      duplicatePlayerProfileKey(player) === candidateKey,
  );
}
