import type { Player } from '../types';
import { foldForComparison } from './textNormalization';

export function duplicatePlayerProfileKey(
  player: Pick<Player, 'nome' | 'genero' | 'posicaoPrincipal' | 'alturaCm'>,
) {
  const name = foldForComparison(player.nome);
  if (!name) return undefined;

  return [
    name,
    foldForComparison(player.genero),
    foldForComparison(player.posicaoPrincipal),
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
