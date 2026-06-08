import React from 'react';
import { motion } from 'motion/react';
import { Check, Heart } from 'lucide-react';
import { Player, Community } from '../../../types';
import { calculateGeneralOverall, getBalancingRole } from '../../../logic/calculations';

interface SelectablePlayerCardProps {
  player: Player;
  isSelected: boolean;
  onToggle: () => void;
  communities?: Community[];
}

export const SelectablePlayerCard: React.FC<SelectablePlayerCardProps> = ({ 
  player, 
  isSelected, 
  onToggle,
  communities = [] 
}) => {
  const overall = calculateGeneralOverall(player);
  const balancingRole = getBalancingRole(player.atributos);

  const playerCommunities = React.useMemo(() => {
    if (!player.communityIds || player.communityIds.length === 0) return [];
    return player.communityIds
      .map(id => communities.find(c => c.id === id))
      .filter((c): c is Community => !!c);
  }, [player.communityIds, communities]);

  return (
    <motion.div 
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onToggle}
      className={`card bg-base-200 border border-base-300 shadow-md p-3 rounded-xl cursor-pointer transition-all relative overflow-hidden h-full ${
        isSelected 
          ? 'border-accent bg-accent/5' 
          : 'hover:border-base-content/20'
      }`}
    >
      {isSelected && (
        <div className="absolute top-2.5 right-2.5 w-4.5 h-4.5 bg-accent rounded-full flex items-center justify-center shadow-lg shadow-accent/20 z-10">
          <Check className="w-2.5 h-2.5 text-accent-content stroke-[4]" />
        </div>
      )}

      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0 pr-6 text-left">
          <h4 className="font-bold text-xs uppercase tracking-tight text-white truncate flex items-center gap-1.5">
            <span className="truncate">{player.nome}</span>
            {player.isGuest && (
              <span className="badge badge-accent py-0 px-1 uppercase font-bold text-[7px] leading-none shrink-0 rounded-sm">
                Convidado
              </span>
            )}
          </h4>
          <p className="text-[8px] font-black uppercase text-accent tracking-wider mt-0.5 truncate">{balancingRole}</p>
          
          <div className="flex items-center gap-1.5 mt-1 text-[8px] font-medium text-base-content/50 uppercase">
            <span className={`w-1 h-1 rounded-full ${player.genero === 'M' ? 'bg-info' : 'bg-secondary'}`} />
            <span>{player.genero === 'M' ? 'Masc' : 'Fem'}</span>
            {player.alturaCm && (
              <>
                <span>•</span>
                <span>{player.alturaCm}cm</span>
              </>
            )}
            {player.status.lesionado && (
              <>
                <span>•</span>
                <span className="text-error font-bold">Lesionado</span>
              </>
            )}
          </div>

          {playerCommunities.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {playerCommunities.map(c => (
                <span key={c.id} className="badge badge-neutral badge-xs font-bold uppercase truncate max-w-[80px] text-[7px] h-3.5 px-1.5">
                  {c.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-lg font-mono font-black text-accent leading-none">{overall}</div>
          <p className="text-[7px] uppercase font-bold text-base-content/40 mt-0.5">OVER</p>
        </div>
      </div>
    </motion.div>
  );
}

