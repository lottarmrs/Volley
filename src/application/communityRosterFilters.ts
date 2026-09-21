import type { Player, Session } from '@shared/types';
import { getCommunityFrequency } from '@logic/community';

export type CommunityRosterFilter =
  | 'all'
  | 'active'
  | 'inactive'
  | 'frequent'
  | 'absent'
  | 'setters'
  | 'central'
  | 'wing'
  | 'libero'
  | 'limited';

export const COMMUNITY_ROSTER_FILTERS: { value: CommunityRosterFilter; label: string }[] = [
  { value: 'all', label: 'Todos vinculados' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
  { value: 'frequent', label: 'Mais frequentes' },
  { value: 'absent', label: 'Ausentes recentes' },
  { value: 'setters', label: 'Levantadores' },
  { value: 'central', label: 'Centrais' },
  { value: 'wing', label: 'Pontas/Opostos' },
  { value: 'libero', label: 'Líberos' },
  { value: 'limited', label: 'Com limitação' },
];

const ABSENT_THRESHOLD = 30;

export function matchesCommunityRosterFilter(
  player: Player,
  filter: CommunityRosterFilter,
  communitySessions: Session[],
): boolean {
  switch (filter) {
    case 'active':
      return player.ativo;
    case 'inactive':
      return !player.ativo;
    case 'frequent':
      return Boolean(player.status?.presencaFrequente);
    case 'absent':
      return getCommunityFrequency(player.id, communitySessions) < ABSENT_THRESHOLD;
    case 'setters':
      return player.posicaoPrincipal === 'levantador';
    case 'central':
      return player.posicaoPrincipal === 'central';
    case 'wing':
      return player.posicaoPrincipal === 'ponteiro' || player.posicaoPrincipal === 'oposto';
    case 'libero':
      return player.posicaoPrincipal === 'libero';
    case 'limited':
      return Boolean(player.status?.limitacaoFisica || player.status?.lesionado);
    case 'all':
    default:
      return true;
  }
}
