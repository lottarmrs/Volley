import { motion } from 'motion/react';
import { Plus, RotateCw, Trophy as ChampIcon, Zap } from 'lucide-react';
import { Player, Team, TeamStrengthSnapshot, Game } from '../../types';

interface TeamScoreCardProps {
  team: Team;
  score: number;
  isWinner: boolean;
  onCourtStreak: number;
  color: string;
  isGameActive: boolean;
  scoringRanking: any[];
  players: Player[];
  onRegisterPoint: () => void;
  onOpenDetailModal: () => void;
}

const positionLabels: Record<string, string> = {
  levantador: 'Levantador',
  oposto: 'Oposto',
  ponteiro: 'Ponteiro',
  central: 'Central',
  libero: 'Líbero',
  'all-rounder': 'Coringa'
};

export const TeamScoreCard = ({
  team,
  score,
  isWinner,
  onCourtStreak,
  color,
  isGameActive,
  scoringRanking,
  players,
  onRegisterPoint,
  onOpenDetailModal
}: TeamScoreCardProps) => {
  return (
    <div className={`card card-border bg-base-200 p-8 rounded-3xl flex flex-col items-center gap-6 relative overflow-hidden group transition-all ${isWinner ? 'ring-2 ring-accent ring-offset-4 ring-offset-black scale-105 z-10' : ''}`}>
      <div className={`absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r ${color} to-transparent opacity-60 group-hover:opacity-100 transition-opacity`} />
      <div className="absolute top-4 left-4 flex flex-col gap-1.5">
        {onCourtStreak > 0 && (
          <div className="badge badge-neutral badge-soft badge-xs font-bold uppercase tracking-widest flex items-center gap-1">
            <RotateCw className="w-2.5 h-2.5 text-accent" /> {onCourtStreak}ª Partida
          </div>
        )}
        
        {/* Strength Bar */}
        <div className="flex flex-col gap-0.5 w-16">
          <div className="flex justify-between items-center px-0.5">
            <span className="text-[7px] font-bold text-base-content/60 uppercase tracking-tighter">Força</span>
            <span className="text-[7px] font-bold text-accent leading-none">{team.strengthSnapshot?.overall || 0}</span>
          </div>
          <progress className="progress progress-accent w-full h-1" value={team.strengthSnapshot?.overall || 0} max={100} />
        </div>

        {/* Net Presence Indicator */}
        <div className="flex flex-col gap-0.5 w-16">
          <div className="flex justify-between items-center px-0.5">
            <span className="text-[7px] font-bold text-base-content/60 uppercase tracking-tighter">Rede</span>
            <span className="text-[7px] font-bold text-warning leading-none">{team.strengthSnapshot?.netPresence || 0}</span>
          </div>
          <progress className="progress progress-warning w-full h-1" value={(team.strengthSnapshot?.netPresence || 0) * 10} max={100} />
        </div>
      </div>

      {isWinner && (
        <div className="absolute top-4 right-4 badge badge-accent font-bold uppercase tracking-widest flex items-center gap-1">
          <ChampIcon className="w-2.5 h-2.5" /> Vencedor
        </div>
      )}

      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] font-bold tracking-[0.4em] text-base-content/60 uppercase">{team.name || 'Time Sem Nome'}</span>
      </div>

      <span className={`text-9xl font-black font-mono leading-none tracking-tighter drop-shadow-2xl transition-colors ${isWinner ? 'text-accent' : ''}`}>{score}</span>
      
      {/* Player Individual Stats */}
      <div className="w-full grid grid-cols-2 gap-2 mb-2">
         {team.playerIds.map(pid => {
           const p = players.find(player => player.id === pid);
           const pRanking = scoringRanking.find(r => r.playerId === pid);
           const pPoints = pRanking?.points || 0;
           
           return (
             <div key={pid} className="bg-base-300/50 p-2 rounded-xl border border-base-300 flex flex-col gap-1 hover:border-accent/30 transition-colors group/player">
                <div className="flex justify-between items-center">
                   <span className="text-[9px] font-bold text-base-content truncate max-w-[50px]">{p?.apelido || p?.nome}</span>
                   <div className="flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5 text-accent" />
                      <span className="text-[9px] font-bold text-accent">{pPoints}</span>
                   </div>
                </div>
                <div className="flex items-center gap-1">
                   <div className={`w-1.5 h-1.5 rounded-full ${p?.genero === 'M' ? 'bg-info' : 'bg-secondary'}`} />
                   <span className="text-[7px] text-base-content/60 uppercase font-bold truncate">
                     {positionLabels[p?.posicaoPrincipal || ''] || 'Jogador'}
                   </span>
                </div>
             </div>
           );
         })}
      </div>
      
      {isGameActive ? (
        <div className="w-full flex gap-2">
          <button 
            onClick={onRegisterPoint}
            className="btn btn-outline btn-sm flex-1 font-bold uppercase tracking-wider"
          >
            Rápido
          </button>
          <button 
            onClick={onOpenDetailModal}
            className="btn btn-accent btn-sm flex-1 font-bold uppercase tracking-wider flex items-center justify-center gap-2"
          >
            <Plus className="w-3 h-3" /> Detalhar
          </button>
        </div>
      ) : (
        <div className="w-full py-4 text-center text-[10px] font-bold uppercase tracking-widest text-base-content/60 bg-base-300/30 rounded-2xl border border-base-300 border-dashed">
          Jogo Encerrado
        </div>
      )}
    </div>
  );
};
