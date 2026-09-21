import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { Community, Player } from '@shared/types';
import { COMMUNITY_ROSTER_FILTERS, type CommunityRosterFilter } from '@app/communityRosterFilters';
import { getCommunityPlayers } from '@logic/community';
import { formatCommunityPlayersText } from '@logic/shareFormatters';
import { AthleteUsernameSearch } from '../AthleteUsernameSearch';
import { ShareActions } from '../../share/ShareActions';

export interface CommunityRosterToolsProps {
  community: Community;
  players: Player[];
  visiblePlayers: Player[];
  filter: CommunityRosterFilter;
  onFilterChange: (filter: CommunityRosterFilter) => void;
  canManageMembers: boolean;
  currentUserId: string | null;
  isSupabaseConfigured: boolean;
  onCreatePlayer: (name: string) => void;
  onLinkedPlayer: (player: Player, communityId: string) => void;
}

export function CommunityRosterTools({
  community,
  players,
  visiblePlayers,
  filter,
  onFilterChange,
  canManageMembers,
  currentUserId,
  isSupabaseConfigured,
  onCreatePlayer,
  onLinkedPlayer,
}: CommunityRosterToolsProps) {
  const [newPlayerName, setNewPlayerName] = useState('');
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

        {canManageMembers && (
          <form
            className="space-y-1"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newPlayerName.trim()) return;
              onCreatePlayer(newPlayerName);
              setNewPlayerName('');
            }}
          >
            <label htmlFor="novo-atleta" className="label-text font-bold">
              Novo atleta
            </label>
            <div className="join w-full">
              <input
                id="novo-atleta"
                className="input input-bordered join-item flex-1"
                placeholder="Ex.: Ana Paula"
                value={newPlayerName}
                onChange={(event) => setNewPlayerName(event.target.value)}
              />
              <button
                type="submit"
                aria-label="Adicionar atleta ao elenco"
                className="btn btn-primary join-item"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {canManageMembers && (
          <AthleteUsernameSearch
            community={community}
            currentUserId={currentUserId}
            isSupabaseConfigured={isSupabaseConfigured}
            onLinkedPlayer={onLinkedPlayer}
          />
        )}

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
