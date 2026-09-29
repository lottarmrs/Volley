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

export function findGuestMatchInCommunity(
  players: Player[],
  candidate: Pick<Player, 'id' | 'nome' | 'genero' | 'posicaoPrincipal' | 'alturaCm'>,
  communityId: string,
) {
  const candidateKey = duplicatePlayerProfileKey(candidate);
  if (!candidateKey) return undefined;

  return players.find(
    (player) =>
      player.id !== candidate.id &&
      !player.userId &&
      !player.deletedAt &&
      (player.communityIds ?? []).includes(communityId) &&
      duplicatePlayerProfileKey(player) === candidateKey,
  );
}
