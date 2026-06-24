import React, { useState } from 'react';
import { ChevronLeft, Plus, Search } from 'lucide-react';
import { Player, Community, Game, PointEvent, Team, Session } from '../../types';
import { PlayerItem } from './PlayerComponents';
import { GuestPlayerModal } from './GuestPlayerModal';
import { FutCardModal } from './FutCardModal';

interface PlayersViewProps {
  players: Player[];
  communities: Community[];
  games: Game[];
  pointEvents: PointEvent[];
  teams: Team[];
  sessions: Session[];
  onBack: () => void;
  onAddPlayer: () => void;
  onEditPlayer: (player: Player) => void;
  onRestoreDemoPlayers: () => void;
  onAddGuestPlayer: (player: Player, editDetails: boolean) => void;
}

export const PlayersView = ({
  players,
  communities,
  games,
  pointEvents,
  teams,
  sessions,
  onBack,
  onAddPlayer,
  onEditPlayer,
  onAddGuestPlayer,
}: PlayersViewProps) => {
  const [showInactive, setShowInactive] = useState(false);
  const [selectedCommunityId, setSelectedCommunityId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [selectedVutPlayer, setSelectedVutPlayer] = useState<Player | null>(null);

  const visiblePlayers = players
    .filter((player) => (showInactive ? true : player.ativo))
    .filter((player) =>
      selectedCommunityId === 'all'
        ? true
        : (player.communityIds ?? []).includes(selectedCommunityId),
    )
    .filter((player) => {
      const query = searchQuery.toLowerCase();
      return (
        player.nome.toLowerCase().includes(query) ||
        (player.apelido ?? '').toLowerCase().includes(query)
      );
    });

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col gap-3 bg-base-200 p-3 sm:p-4 rounded-xl border border-base-300 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="btn btn-ghost btn-sm gap-1 sm:gap-2 text-xs font-bold uppercase tracking-wider"
          >
            <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Voltar</span>
          </button>
          <button
            onClick={() => setShowInactive((prev) => !prev)}
            className="btn btn-outline btn-sm text-[10px] sm:text-xs font-bold uppercase"
          >
            {showInactive ? 'Ocultar inativos' : 'Mostrar inativos'}
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap justify-end">
          <button
            type="button"
            onClick={() => setShowGuestModal(true)}
            className="btn btn-outline btn-accent btn-sm flex-1 sm:flex-initial text-[10px] sm:text-xs"
          >
            <Plus className="w-4 h-4" /> Convidado
          </button>
          <button onClick={onAddPlayer} className="btn btn-primary btn-sm flex-1 sm:flex-initial text-[10px] sm:text-xs">
            <Plus className="w-4 h-4" /> Cadastrar
          </button>
        </div>
      </div>

      {/* Filter and Search Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-base-200 p-4 rounded-xl border border-base-300 shadow-sm">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/50" />
          <input
            type="text"
            placeholder="Pesquisar atleta por nome..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input input-bordered pl-10 w-full"
          />
        </div>

        {communities.length > 0 && (
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-bold uppercase text-base-content/70 tracking-wider shrink-0">
              Comunidade:
            </span>
            <select
              value={selectedCommunityId}
              onChange={(e) => setSelectedCommunityId(e.target.value)}
              className="select select-bordered select-sm w-full font-bold uppercase"
            >
              <option value="all">Todas as Comunidades</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Players List Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visiblePlayers.map((player) => (
          <PlayerItem
            key={player.id}
            player={player}
            onToggle={() => onEditPlayer(player)}
            onViewVutCard={(p) => setSelectedVutPlayer(p)}
          />
        ))}
        {visiblePlayers.length === 0 && (
          <div className="col-span-full py-20 text-center card bg-base-200 border border-base-300 border-dashed shadow-md">
            <p className="text-base-content/50 uppercase text-xs font-bold italic">
              Nenhum atleta encontrado nesta lista.
            </p>
          </div>
        )}
      </div>

      {/* Guest Modal */}
      <GuestPlayerModal
        isOpen={showGuestModal}
        onClose={() => setShowGuestModal(false)}
        players={players}
        onAddGuestPlayer={onAddGuestPlayer}
        defaultCommunityId={selectedCommunityId !== 'all' ? selectedCommunityId : null}
      />

      {/* VUT Card Modal */}
      {selectedVutPlayer && (
        <FutCardModal
          isOpen={!!selectedVutPlayer}
          onClose={() => setSelectedVutPlayer(null)}
          player={selectedVutPlayer}
          players={players}
          sessions={sessions}
          teams={teams}
          games={games}
          pointEvents={pointEvents}
        />
      )}
    </div>
  );
};
