import type { Community, Player } from '@shared/types';
import { COMMUNITY_ROSTER_FILTERS, type CommunityRosterFilter } from '@app/communityRosterFilters';
import { getCommunityPlayers } from '@logic/community';
import { formatCommunityPlayersText } from '@logic/shareFormatters';
import { ShareActions } from '../../share/ShareActions';

export interface CommunityRosterToolsProps {
  community: Community;
  players: Player[];
  visiblePlayers: Player[];
  filter: CommunityRosterFilter;
  onFilterChange: (filter: CommunityRosterFilter) => void;
}

export function CommunityRosterTools({
  community,
  players,
  visiblePlayers,
  filter,
  onFilterChange,
}: CommunityRosterToolsProps) {
  const membros = getCommunityPlayers(community.id, players);
  const paraCompartilhar = visiblePlayers.length > 0 ? visiblePlayers : membros;

  return (
    <div className="card card-border bg-base-200">
      <div className="card-body gap-3">
        <select
          className="select select-bordered"
          aria-label="Filtrar elenco"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value as CommunityRosterFilter)}
        >
          {COMMUNITY_ROSTER_FILTERS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <ShareActions
          title={`Atletas - ${community.name}`}
          text={formatCommunityPlayersText(community, paraCompartilhar)}
          variant="menu"
          blocks={[
            {
              id: 'all',
              label: 'Lista completa',
              text: formatCommunityPlayersText(community, membros),
            },
            {
              id: 'active',
              label: 'Ativos',
              text: formatCommunityPlayersText(
                community,
                membros.filter((player) => player.ativo),
              ),
            },
            {
              id: 'setters',
              label: 'Levantadores',
              text: formatCommunityPlayersText(
                community,
                membros.filter((player) => player.posicaoPrincipal === 'levantador'),
              ),
            },
            {
              id: 'limited',
              label: 'Com limitacao',
              text: formatCommunityPlayersText(
                community,
                membros.filter(
                  (player) => player.status.lesionado || player.status.limitacaoFisica,
                ),
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
