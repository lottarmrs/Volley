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

function getSigla(pos?: Position | null): string {
  if (!pos) return 'JOG';
  return POSITION_SIGLA[pos] || 'JOG';
}

export function VolleyballCourtLineup({
  team,
  players,
  onSelectCaptain,
}: {
  team: ChampionshipTeam;
  players: Player[];
  onSelectCaptain?: (playerId: string) => void;
}) {
  const [customColor, setCustomColor] = React.useState<string>(
    team.color || 'linear-gradient(60deg in hsl, #d75252, #852b4f)',
  );

  const teamPlayers = players.filter((p) => team.playerIds.includes(p.id));
  const starters = teamPlayers.slice(0, 6);
  const reserves = teamPlayers.slice(6);

  // Mapeamento oficial de rotação no voleibol:
  // Posições de Frente (Ataque): 4 (Entrada), 3 (Meio), 2 (Saída)
  // Posições de Fundo (Defesa): 5 (Fundo Esquerdo), 6 (Fundo Centro), 1 (Saque / Fundo Direito)
  const pos4 = starters[3];
  const pos3 = starters[2];
  const pos2 = starters[1];
  const pos5 = starters[4];
  const pos6 = starters[5];
  const pos1 = starters[0];

  const COLOR_PALETTES = [
    { label: 'Vermelho', bg: 'linear-gradient(60deg in hsl, #d75252, #852b4f)' },
    { label: 'Azul', bg: 'linear-gradient(60deg in hsl, #2563eb, #1e40af)' },
    { label: 'Verde', bg: 'linear-gradient(60deg in hsl, #10b981, #064e3b)' },
    { label: 'Laranja', bg: 'linear-gradient(60deg in hsl, #f97316, #c2410c)' },
    { label: 'Roxo', bg: 'linear-gradient(60deg in hsl, #8b5cf6, #581c87)' },
    { label: 'Preto & Ouro', bg: 'linear-gradient(60deg in hsl, #1e293b, #d97706)' },
  ];

  return (
    <div className="card card-border bg-base-200 p-4 space-y-4 shadow-xl">
      {/* HEADER DO TIME & SELETOR DE UNIFORME */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-base-300 pb-3 gap-2">
        <h4 className="card-title text-base uppercase flex items-center gap-2 text-base-content font-black">
          <Shield className="w-5 h-5 text-primary" /> {team.name}
        </h4>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase text-base-content/50">Uniforme:</span>
          <div className="flex items-center gap-1.5">
            {COLOR_PALETTES.map((palette) => (
              <button
                key={palette.label}
                type="button"
                onClick={() => setCustomColor(palette.bg)}
                className={`h-11 w-11 shrink-0 rounded-full border-2 transition-transform hover:scale-105 ${
                  customColor === palette.bg
                    ? 'border-white scale-110 shadow-md'
                    : 'border-transparent opacity-75'
                }`}
                style={{ background: palette.bg }}
                title={`Uniforme ${palette.label}`}
              />
            ))}
          </div>
          <span className="badge badge-neutral badge-sm font-bold uppercase text-[10px] ml-1">
            {teamPlayers.length} Atletas
          </span>
        </div>
      </div>

      {/* QUADRA OFICIAL DE VOLEIBOL (Container 9x9 / Aspect Square) */}
      <div
        id="court-container"
        className="relative w-full max-w-md mx-auto overflow-hidden rounded-2xl shadow-2xl aspect-square select-none bg-slate-950"
      >
        {/* 1. REDE DE VOLEIBOL (Topo da quadra do time) */}
        <div className="absolute top-0 left-0 w-full h-4 bg-white border-b-2 border-red-600 z-30 flex items-center justify-between px-2 shadow-md">
          <div
            className="w-2 h-6 bg-red-600 -top-1 absolute left-0 rounded-t-sm"
            title="Antena Esquerda"
          />
          <div className="w-full h-full opacity-40 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:6px_6px]" />
          <div
            className="w-2 h-6 bg-red-600 -top-1 absolute right-0 rounded-t-sm"
            title="Antena Direita"
          />
        </div>

        {/* 2. FUNDO DA QUADRA (Piso Oficial Vermelho/Azul) */}
        <div className="absolute inset-0 bg-[#b91c1c] border-x-8 border-b-8 border-white">
          {/* ZONA DE FRENTE (Rede até a Linha de 3m -> Ocupa 33.3% da altura total de 9m) */}
          <div className="absolute top-4 left-0 w-full h-[33.3%] border-b-4 border-white border-dashed bg-black/10 flex items-start justify-center pt-2 pointer-events-none">
            <span className="text-white/30 text-[10px] font-black uppercase tracking-widest">
              Zona de Frente (Rede 3m)
            </span>
          </div>

          {/* ZONA DE FUNDO (Linha de 3m até a Linha de Fundo -> Ocupa 66.6% da altura) */}
          <div className="absolute bottom-0 left-0 w-full h-[66.6%] flex items-center justify-center pointer-events-none">
            <span className="text-white/20 text-[10px] font-black uppercase tracking-widest">
              Zona de Defesa / Saque (6m)
            </span>
          </div>

          {/* 3. SLOTS DE POSICIONAMENTO OFICIAL (1 a 6) */}

          {/* LINHA DE FRENTE (Posições 4, 3, 2) */}
          <div className="absolute top-[14%] left-[6%] w-[28%] z-20">
            <PlayerSlot
              slotNumber={4}
              defaultJerseyNumber={4}
              player={pos4}
              jerseyBg={customColor}
              isCaptain={pos4?.id === team.captainPlayerId}
              onSelectCaptain={onSelectCaptain}
            />
          </div>

          <div className="absolute top-[14%] left-1/2 -translate-x-1/2 w-[28%] z-20">
            <PlayerSlot
              slotNumber={3}
              defaultJerseyNumber={3}
              player={pos3}
              jerseyBg={customColor}
              isCaptain={pos3?.id === team.captainPlayerId}
              onSelectCaptain={onSelectCaptain}
            />
          </div>

          <div className="absolute top-[14%] right-[6%] w-[28%] z-20">
            <PlayerSlot
              slotNumber={2}
              defaultJerseyNumber={2}
              player={pos2}
              jerseyBg={customColor}
              isCaptain={pos2?.id === team.captainPlayerId}
              onSelectCaptain={onSelectCaptain}
            />
          </div>

          {/* LINHA DE FUNDO (Posições 5, 6, 1) */}
          <div className="absolute bottom-[8%] left-[6%] w-[28%] z-20">
            <PlayerSlot
              slotNumber={5}
              defaultJerseyNumber={5}
              player={pos5}
              jerseyBg={customColor}
              isCaptain={pos5?.id === team.captainPlayerId}
              onSelectCaptain={onSelectCaptain}
            />
          </div>

          <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 w-[28%] z-20">
            <PlayerSlot
              slotNumber={6}
              defaultJerseyNumber={6}
              player={pos6}
              jerseyBg={customColor}
              isCaptain={pos6?.id === team.captainPlayerId}
              onSelectCaptain={onSelectCaptain}
            />
          </div>

          <div className="absolute bottom-[8%] right-[6%] w-[28%] z-20">
            <PlayerSlot
              slotNumber={1}
              defaultJerseyNumber={1}
              player={pos1}
              jerseyBg={customColor}
              isCaptain={pos1?.id === team.captainPlayerId}
              onSelectCaptain={onSelectCaptain}
            />
          </div>
        </div>
      </div>

      {/* SEÇÃO DE RESERVAS / SUBSTITUTOS */}
      {reserves.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-base-300">
          <span className="text-xs font-bold uppercase text-base-content/70 tracking-wider">
            Reservas & Substitutos ({reserves.length})
          </span>
          <div className="flex flex-wrap gap-2">
            {reserves.map((player, rIdx) => (
              <div
                key={player.id}
                className="badge badge-outline gap-1.5 py-3 px-3 text-xs font-bold bg-base-100/60"
              >
                <User className="w-3.5 h-3.5 text-primary" />
                <span className="font-mono text-primary font-black">
                  #{player.numeroCamisa ?? rIdx + 7}
                </span>
                <span>{player.apelido || player.nome}</span>
                <span className="badge badge-xs badge-neutral font-mono uppercase text-[9px]">
                  {getSigla(player.posicaoPrincipal)}
                </span>
                {player.id === team.captainPlayerId && (
                  <span
                    className="badge badge-warning badge-xs font-black text-[9px]"
                    title="Capitão"
                  >
                    C
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlayerSlot({
  slotNumber,
  defaultJerseyNumber,
  player,
  jerseyBg,
  isCaptain,
  onSelectCaptain,
}: {
  slotNumber: number;
  defaultJerseyNumber: number;
  player?: Player;
  jerseyBg: string;
  isCaptain?: boolean;
  onSelectCaptain?: (playerId: string) => void;
}) {
  if (!player) {
    return (
      <div className="flex flex-col items-center justify-center">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full border-2 border-white/25 bg-black/30 backdrop-blur flex items-center justify-center font-black text-white/40 text-lg shadow-inner">
          {slotNumber}
        </div>
      </div>
    );
  }

  const sigla = getSigla(player.posicaoPrincipal);
  const positionName = getPosicaoNome(player.posicaoPrincipal);
  const jerseyNumber = player.numeroCamisa ?? defaultJerseyNumber;

  return (
    <div className="relative flex flex-col items-center text-center transition-all duration-200 hover:scale-105 group cursor-pointer">
      {/* Indicador do número da posição no canto superior esquerdo */}
      <span className="absolute -top-1 -left-1 text-[10px] font-mono font-black text-white/70 bg-black/60 px-1.5 py-0.5 rounded-full z-30 shadow">
        #{slotNumber}
      </span>

      {/* Badge do Capitão C */}
      {isCaptain && (
        <div
          className="absolute -top-2 -right-1 w-6 h-6 rounded-full bg-warning text-warning-content font-black text-xs flex items-center justify-center border-2 border-white shadow-lg z-30"
          title="Capitão do time"
        >
          C
        </div>
      )}

      {/* Camisa Oficial de Vôlei (180deg Flipped right-side up + custom bg + drop shadow) */}
      <div
        className="player-jersey-shape"
        style={{ '--jersey-bg': jerseyBg } as React.CSSProperties}
      >
        <div className="player-jersey-inner-content">
          <span className="font-black text-xl sm:text-2xl font-mono text-white tracking-tighter drop-shadow-lg leading-none">
            {jerseyNumber}
          </span>
          <span className="text-[8px] font-black uppercase tracking-widest text-white/90 bg-black/40 px-1 py-0.5 rounded mt-0.5">
            {sigla}
          </span>
        </div>
      </div>

      {/* Nickname & Position Tag Below Jersey */}
      <div className="mt-1 bg-black/80 backdrop-blur px-2 py-0.5 rounded-md border border-white/20 flex flex-col items-center max-w-full shadow-lg">
        <span className="text-[10px] sm:text-xs font-black text-white truncate max-w-[90px] leading-tight">
          {player.apelido || player.nome}
        </span>
        <span className="text-[8px] uppercase font-bold text-white/60">{positionName}</span>
      </div>

      {onSelectCaptain && !isCaptain && (
        <button
          type="button"
          onClick={() => onSelectCaptain(player.id)}
          className="btn btn-warning btn-xs text-[9px] mt-1.5 min-h-[44px] px-3 font-black uppercase tracking-wider shadow-sm flex items-center justify-center gap-1"
        >
          <span>Tornar Capitão</span>
        </button>
      )}
    </div>
  );
}

function getPosicaoNome(pos?: Position | null): string {
  if (!pos) return 'Jogador';
  switch (pos) {
    case 'levantador':
      return 'Levantador';
    case 'oposto':
      return 'Oposto';
    case 'ponteiro':
      return 'Ponteiro';
    case 'central':
      return 'Central';
    case 'libero':
      return 'Líbero';
    case 'all-rounder':
      return 'Universal';
    default:
      return 'Jogador';
  }
}
