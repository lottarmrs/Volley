import React from 'react';
import { Shield, User } from 'lucide-react';
import type { ChampionshipTeam, Player, Position } from '../../types';

const POSITION_SIGLA: Record<Position, string> = {
  levantador: 'LEV',
  oposto: 'OPO',
  ponteiro: 'PON',
  central: 'CEN',
  libero: 'LIB',
  'all-rounder': 'UNI',
};

export function VolleyballCourtLineup({
  team,
  players,
  onSelectCaptain,
}: {
  team: ChampionshipTeam;
  players: Player[];
  onSelectCaptain?: (playerId: string) => void;
}) {
  const teamPlayers = players.filter((p) => team.playerIds.includes(p.id));
  const starters = teamPlayers.slice(0, 6);
  const reserves = teamPlayers.slice(6);

  // Positions: 4 (Ponteiro 1), 3 (Central 1), 2 (Oposto), 5 (Ponteiro 2), 6 (Central 2/Libero), 1 (Levantador)
  const frontRow = [starters[3], starters[2], starters[1]]; // Positions 4, 3, 2
  const backRow = [starters[4], starters[5], starters[0]];  // Positions 5, 6, 1

  return (
    <div className="card card-border bg-base-200 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="card-title text-base uppercase flex items-center gap-2">
          <Shield className="w-4 h-4 text-primary" /> {team.name}
        </h4>
        <span className="text-xs text-base-content/60">{teamPlayers.length} atletas inscritos</span>
      </div>

      {/* Visual Court Container */}
      <div className="relative rounded-box overflow-hidden bg-gradient-to-b from-orange-600 via-orange-500 to-rose-600 p-4 border-2 border-white/20 shadow-inner">
        {/* Net */}
        <div className="w-full h-3 bg-white/40 border-b-2 border-white/80 mb-4 flex items-center justify-center">
          <span className="text-[9px] font-black uppercase text-white tracking-widest bg-black/40 px-2 rounded">
            REDE DE VÔLEI
          </span>
        </div>

        {/* Front Row (Positions 4, 3, 2) */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {frontRow.map((player, idx) => (
            <PlayerCardSlot
              key={player?.id || `front-${idx}`}
              player={player}
              isCaptain={player?.id === team.captainPlayerId}
              positionLabel={player ? POSITION_SIGLA[player.posicaoPrincipal] || 'JOG' : 'VAZIO'}
              onSelectCaptain={onSelectCaptain}
            />
          ))}
        </div>

        {/* Attack 3m Line */}
        <div className="w-full border-t-2 border-dashed border-white/50 mb-6 relative">
          <span className="absolute right-2 -top-2.5 text-[8px] font-bold text-white/70">
            Linha de 3m
          </span>
        </div>

        {/* Back Row (Positions 5, 6, 1) */}
        <div className="grid grid-cols-3 gap-2">
          {backRow.map((player, idx) => (
            <PlayerCardSlot
              key={player?.id || `back-${idx}`}
              player={player}
              isCaptain={player?.id === team.captainPlayerId}
              positionLabel={player ? POSITION_SIGLA[player.posicaoPrincipal] || 'JOG' : 'VAZIO'}
              onSelectCaptain={onSelectCaptain}
            />
          ))}
        </div>
      </div>

      {/* Reserves Bar */}
      {reserves.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs font-bold uppercase text-base-content/60">Reservas / Substitutos</span>
          <div className="flex flex-wrap gap-2">
            {reserves.map((player) => (
              <div key={player.id} className="badge badge-outline gap-1.5 py-3 px-3 text-xs">
                <User className="w-3 h-3" />
                <span>{player.apelido || player.nome}</span>
                {player.id === team.captainPlayerId && (
                  <span className="badge badge-warning badge-xs font-black">C</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerCardSlot({
  player,
  isCaptain,
  positionLabel,
  onSelectCaptain,
}: {
  player?: Player;
  isCaptain?: boolean;
  positionLabel: string;
  onSelectCaptain?: (playerId: string) => void;
}) {
  if (!player) {
    return (
      <div className="rounded-box bg-black/20 border border-white/20 p-2 flex flex-col items-center justify-center min-h-[90px] text-white/50">
        <span className="text-xs">Vazio</span>
      </div>
    );
  }

  return (
    <div className="relative rounded-box bg-base-100/90 backdrop-blur border border-white/30 p-2 flex flex-col items-center text-center shadow-lg transition-transform hover:scale-105">
      {/* Captain Badge */}
      {isCaptain && (
        <div
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-warning text-warning-content font-black text-[10px] flex items-center justify-center border border-white shadow"
          title="Capitão do time"
        >
          C
        </div>
      )}

      {/* Jersey Icon */}
      <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center font-black text-primary text-xs mb-1">
        {POSITION_SIGLA[player.posicaoPrincipal] || 'J'}
      </div>

      <span className="text-xs font-bold truncate max-w-full">
        {player.apelido || player.nome}
      </span>
      <span className="text-[9px] uppercase font-semibold text-base-content/60">
        {positionLabel}
      </span>

      {onSelectCaptain && !isCaptain && (
        <button
          type="button"
          onClick={() => onSelectCaptain(player.id)}
          className="btn btn-ghost btn-xs text-[9px] mt-1 p-0 h-auto"
        >
          Tornar capitão
        </button>
      )}
    </div>
  );
}
