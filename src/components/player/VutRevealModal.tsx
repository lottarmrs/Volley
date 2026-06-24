import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Trophy, Star, ArrowRight, Sparkles, Target, CheckCircle2, Layers } from 'lucide-react';
import { FutCard } from './FutCard';
import { Achievement, VutCard } from '../../logic/futCards';

export interface RevealItem {
  card: VutCard;
  reasons: string[];
}

interface VutRevealModalProps {
  isOpen: boolean;
  onClose: () => void;
  revealItems: RevealItem[];
}

export const VutRevealModal: React.FC<VutRevealModalProps> = ({
  isOpen,
  onClose,
  revealItems,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpened, setIsOpened] = useState(false);

  if (!isOpen || revealItems.length === 0) return null;

  const currentItem = revealItems[currentIndex];
  const isLast = currentIndex === revealItems.length - 1;
  const unlocked = currentItem.card.achievements.filter((achievement) => achievement.unlocked);
  const near = currentItem.card.achievements
    .filter((achievement) => !achievement.unlocked && achievement.target > 0 && achievement.current > 0)
    .sort((a, b) => b.current / b.target - a.current / a.target)
    .slice(0, 2);
  const packSummary = revealItems.reduce(
    (acc, item) => {
      if (item.card.edition.kind !== 'base') acc.specials += 1;
      acc.achievements += item.card.achievements.filter((achievement) => achievement.unlocked).length;
      return acc;
    },
    { specials: 0, achievements: 0 },
  );

  const handleNext = () => {
    setIsOpened(false);
    if (isLast) {
      onClose();
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleOpenPack = () => {
    setIsOpened(true);
  };

  const achievementProgress = (achievement: Achievement) =>
    Math.round(Math.min(100, Math.max(0, (achievement.current / achievement.target) * 100)));

  return (
    <div className="modal modal-open z-[100] backdrop-blur-md bg-black/80">
      <div className="modal-box max-w-lg bg-base-950/90 border border-white/10 rounded-3xl flex flex-col items-center justify-between p-4 sm:p-8 min-h-0 sm:min-h-[500px] max-h-[95vh] overflow-y-auto overflow-x-hidden relative shadow-2xl">
        <button
          onClick={onClose}
          className="btn btn-circle btn-ghost btn-sm absolute right-3 top-3 z-20 text-white/50 hover:text-white"
          aria-label="Fechar reveal VUT"
        >
          <X className="w-4 h-4" />
        </button>
        
        {/* Subtle decorative background light */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-accent/15 rounded-full filter blur-[80px] pointer-events-none" />

        {/* Header */}
        <div className="w-full text-center z-10 space-y-1">
          <span className="text-[10px] font-black tracking-widest text-accent uppercase flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Volley Ultimate Team <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          </span>
          <h2 className="text-xl font-black uppercase text-white tracking-wide">
            {isOpened ? 'Carta Revelada!' : 'Nova Carta Especial!'}
          </h2>
          <p className="text-xs text-white/50 uppercase font-bold tracking-wider">
            Atleta {currentIndex + 1} de {revealItems.length}
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <span className="badge badge-accent badge-soft text-[9px] font-black uppercase">
              {packSummary.specials} especiais
            </span>
            <span className="badge badge-neutral badge-soft text-[9px] font-black uppercase">
              {packSummary.achievements} conquistas
            </span>
          </div>
        </div>

        {/* Card Pack Animation / Render Card */}
        <div className="my-4 sm:my-8 z-10 flex flex-col items-center justify-center min-h-0 sm:min-h-[300px] relative w-full">
          <AnimatePresence mode="wait">
            {!isOpened ? (
              /* Pack/Envelope to be clicked */
              <motion.div
                key="pack"
                initial={{ scale: 0.8, opacity: 0, rotateY: -180 }}
                animate={{ scale: 1, opacity: 1, rotateY: 0 }}
                exit={{ scale: 1.1, opacity: 0, rotateY: 180 }}
                transition={{ duration: 0.5, type: 'spring' }}
                onClick={handleOpenPack}
                className="w-[180px] h-[260px] sm:w-[220px] sm:h-[320px] bg-gradient-to-br from-accent via-pink-600 to-primary rounded-2xl border-2 border-white/20 shadow-2xl flex flex-col items-center justify-between p-4 sm:p-6 cursor-pointer hover:shadow-accent/20 hover:border-white/40 active:scale-95 transition-all"
              >
                <div className="w-full flex justify-between text-white/40">
                  <Star className="w-5 h-5 fill-white/10" />
                  <Star className="w-5 h-5 fill-white/10" />
                </div>
                <div className="flex flex-col items-center space-y-3">
                  <Trophy className="w-16 h-16 text-white/90 animate-bounce" />
                  <span className="text-lg font-black text-white uppercase tracking-widest leading-none">VUT</span>
                  <span className="text-[10px] font-black text-white/80 uppercase tracking-widest text-center leading-tight">
                    {currentItem.card.player.apelido || currentItem.card.player.nome}
                  </span>
                  <span className="text-[8px] font-black text-white/60 uppercase tracking-widest bg-black/40 px-2 py-0.5 rounded-full">Clique para Abrir</span>
                </div>
                <div className="w-full flex justify-between text-white/40">
                  <Star className="w-5 h-5 fill-white/10" />
                  <Star className="w-5 h-5 fill-white/10" />
                </div>
              </motion.div>
            ) : (
              /* Revealed Card with reasons */
              <motion.div
                key="card-reveal"
                initial={{ scale: 0.5, rotateY: 180, opacity: 0 }}
                animate={{ scale: 1, rotateY: 0, opacity: 1 }}
                transition={{ duration: 0.6, type: 'spring', bounce: 0.3 }}
                className="flex flex-col items-center space-y-4 [&_.vut-card-container]:scale-[0.68] sm:[&_.vut-card-container]:scale-100"
              >
                <div className="vut-card-container origin-top transition-transform">
                  <FutCard card={currentItem.card} />
                </div>
                
                {/* Highlight Reasons */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-black/50 border border-white/10 p-3.5 rounded-xl text-center space-y-1.5 max-w-[280px]"
                >
                  <span className="text-[8px] font-black uppercase text-accent tracking-widest font-mono">Destaques da Sessão</span>
                  {currentItem.reasons.map((reason, idx) => (
                    <p key={idx} className="text-xs font-bold text-white uppercase leading-tight">
                      {reason}
                    </p>
                  ))}
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.45 }}
                  className="grid grid-cols-1 gap-2 max-w-[320px] w-full"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-black/45 border border-white/10 p-3 rounded-xl">
                      <p className="text-[8px] font-black uppercase text-white/45 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-success" />
                        Conquistas
                      </p>
                      <p className="text-lg font-black text-white mt-1">{unlocked.length}</p>
                      <p className="text-[9px] text-white/45 uppercase truncate">
                        {unlocked[0]?.name || 'sem novas'}
                      </p>
                    </div>
                    <div className="bg-black/45 border border-white/10 p-3 rounded-xl">
                      <p className="text-[8px] font-black uppercase text-white/45 flex items-center gap-1">
                        <Layers className="w-3 h-3 text-accent" />
                        Moldura
                      </p>
                      <p className="text-xs font-black text-white mt-1 truncate">
                        {currentItem.card.activeFrame.name}
                      </p>
                      <p className="text-[9px] text-white/45 uppercase">
                        {currentItem.card.activeFrame.rarity}
                      </p>
                    </div>
                  </div>

                  {near.length > 0 && (
                    <div className="bg-black/45 border border-white/10 p-3 rounded-xl space-y-2">
                      <p className="text-[8px] font-black uppercase text-white/45 flex items-center gap-1">
                        <Target className="w-3 h-3 text-warning" />
                        Quase la
                      </p>
                      {near.map((achievement) => (
                        <div key={achievement.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-[10px] font-bold uppercase">
                            <span className="text-white truncate">{achievement.name}</span>
                            <span className="text-warning">{achievementProgress(achievement)}%</span>
                          </div>
                          <progress
                            className="progress progress-warning h-1 w-full"
                            value={achievement.current}
                            max={achievement.target}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation Action Buttons */}
        <div className="w-full z-10 flex gap-3 justify-center">
          {isOpened ? (
            <button
              onClick={handleNext}
              className="btn btn-accent btn-sm gap-2 uppercase font-bold px-6 py-2 h-auto text-xs"
            >
              {isLast ? 'Concluir Pacote' : 'Proxima Carta'} <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleOpenPack}
              className="btn btn-neutral btn-sm uppercase font-bold px-6 py-2 h-auto text-xs"
            >
              Abrir Carta
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
