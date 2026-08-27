import React from 'react';
import { motion } from 'motion/react';
import { VutCard } from '../../logic/futCards';

interface FutCardProps {
  card: VutCard;
  onClick?: () => void;
  scale?: number;
}

export const FutCard: React.FC<FutCardProps> = ({ card, onClick, scale = 1 }) => {
  const { player, stats, posLabel, edition, formBadge, chemistry, activeFrame } = card;

  // Choose overall card background class
  const bgClass = edition.kind !== 'base' ? `vut-bg-${edition.kind}` : `vut-bg-${stats.tier}`;

  // Border class based on the active frame's rarity
  const borderClass = `vut-border-${activeFrame.rarity}`;

  // Additional style key from frame (e.g. vut-style-court-floor)
  const styleKeyClass = activeFrame.styleKey ? `vut-style-${activeFrame.styleKey}` : '';

  const initials = player.nome ? player.nome.substring(0, 2).toUpperCase() : 'AT';

  return (
    <motion.div
      whileHover={{ scale: onClick ? 1.03 : 1, y: onClick ? -4 : 0 }}
      onClick={onClick}
      className={`relative select-none ${onClick ? 'cursor-pointer' : ''}`}
      style={{
        width: '260px',
        height: '370px',
        transform: `scale(${scale})`,
        transformOrigin: 'top center',
      }}
    >
      {/* Outer Glow & Rarity Border Wrapper */}
      <div className={`w-full h-full p-[3px] vut-card-shield ${borderClass}`}>
        {/* Inner Card content container */}
        <div
          className={`w-full h-full vut-card-shield ${bgClass} ${styleKeyClass} relative overflow-hidden flex flex-col justify-between p-4`}
        >
          {/* Top-Left Details: OVR, Position, Country, Crest */}
          <div className="absolute top-[35px] left-[15px] flex flex-col items-center z-20 font-sans">
            <span className="text-[38px] font-black leading-none tracking-tighter drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
              {stats.ovr}
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-white/95 mt-0.5 leading-none bg-black/35 px-1 py-0.5 rounded-sm">
              {posLabel}
            </span>
            <div className="w-[14px] h-[1px] bg-white/30 my-2" />
            {/* Vector Brazil Flag SVG (resolves OS/Browser flag rendering issues) */}
            <svg
              className="w-5 h-3.5 rounded-xs shadow-sm mt-0.5"
              viewBox="0 0 720 504"
              fill="none"
              title="Brasil"
            >
              <rect width="720" height="504" fill="#009c3b" />
              <polygon points="360,40 680,252 360,464 40,252" fill="#ffdf00" />
              <circle cx="360" cy="252" r="102" fill="#002776" />
              <path
                d="M265,280 C300,260 380,260 455,280"
                stroke="white"
                strokeWidth="16"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            {/* Volleyball Shield Crest */}
            <svg
              className="w-3.5 h-3.5 text-current mt-1.5 opacity-80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
              viewBox="0 0 24 24"
              fill="currentColor"
              fillOpacity="0.2"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2L3 5v6c0 5.5 4.5 10 9 10s9-4.5 9-10V5l-9-3z" />
              <circle cx="12" cy="12" r="3" fill="currentColor" fillOpacity="0.8" />
            </svg>
          </div>

          {/* Right Floating Badges: Form Score, Special Edition */}
          <div className="absolute top-[35px] right-[15px] flex flex-col items-end gap-2 z-20">
            {/* Form Score hexagon */}
            {formBadge.value !== null && (
              <div
                className={`w-7 h-8 flex items-center justify-center font-mono text-[10px] font-black text-white relative shadow-lg ${
                  formBadge.color === 'green'
                    ? 'bg-success/80 border border-success'
                    : formBadge.color === 'yellow'
                      ? 'bg-warning/80 border border-warning'
                      : formBadge.color === 'red'
                        ? 'bg-error/80 border border-error'
                        : 'bg-neutral/80 border border-neutral'
                }`}
                style={{
                  clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
                }}
                title={`Forma física: média de ${formBadge.value.toFixed(1)} nas últimas partidas`}
              >
                <span className="mt-[-2px]">{formBadge.value.toFixed(1)}</span>
              </div>
            )}

            {/* Special Edition Round Badge */}
            {edition.kind !== 'base' && (
              <div
                className="w-7 h-7 bg-amber-500/90 border border-amber-300 rounded-full flex items-center justify-center text-sm shadow-md animate-pulse"
                title={`Edição Especial: ${edition.label}`}
              >
                {edition.emoji}
              </div>
            )}
          </div>

          {/* Left Badges Stack: Playstyles (Hand, Versatility) */}
          <div className="absolute left-[15px] top-[150px] flex flex-col gap-1.5 z-20 font-mono text-[9px] font-black">
            {/* Handedness Badge */}
            <div
              className="w-6 h-6 bg-black/60 border border-white/10 rounded flex items-center justify-center text-white drop-shadow"
              title={`Mão dominante: ${stats.hand === 'direita' ? 'Destra' : 'Canhota'}`}
            >
              {stats.hand === 'direita' ? 'D' : 'E'}
            </div>

            {/* Versatility Badge */}
            <div
              className="w-6 h-6 bg-black/60 border border-white/10 rounded flex items-center justify-center text-amber-400 drop-shadow"
              title={`Versatilidade em quadra: ${stats.versatility} posições`}
            >
              {stats.versatility}★
            </div>
          </div>

          {/* Centered Large Cutout Player Photo */}
          <div className="absolute top-[40px] left-[50px] w-[160px] h-[175px] overflow-hidden z-10 pointer-events-none">
            {player.avatarUrl ? (
              <img
                src={player.avatarUrl}
                alt={player.nome}
                crossOrigin="anonymous"
                className="w-full h-full object-contain object-bottom filter drop-shadow-[0_8px_12px_rgba(0,0,0,0.6)]"
                style={{
                  maskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)',
                  WebkitMaskImage: 'linear-gradient(to bottom, black 65%, transparent 100%)',
                }}
              />
            ) : (
              <div className="w-full h-full relative flex items-center justify-center">
                {/* Stylized monogram initials & Glowing Volleyball background */}
                <span className="text-[78px] font-black tracking-tighter text-white/5 select-none font-sans mt-4">
                  {initials}
                </span>
                <svg
                  className="w-20 h-20 text-white/5 absolute opacity-80 bottom-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.75"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10" />
                  <path d="M12 2a15.3 15.3 0 0 0-4 10 15.3 15.3 0 0 0 4 10" />
                  <path d="M2 12h20" />
                </svg>
              </div>
            )}
          </div>

          {/* Name Plate */}
          <div className="absolute top-[208px] left-0 w-full text-center z-20 px-4">
            <h3 className="font-black text-sm uppercase tracking-widest drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] truncate">
              {player.apelido || player.nome}
            </h3>
            {player.status.lesionado && (
              <span className="inline-block mt-0.5 text-[7px] font-black uppercase text-red-400 tracking-widest bg-red-950/80 border border-red-500/30 px-1.5 py-0.5 rounded leading-none">
                Lesionado
              </span>
            )}
          </div>

          {/* Stats Box (Horizontal FUT Style) */}
          <div className="absolute top-[242px] left-[15px] w-[230px] z-20">
            <div className="bg-black/55 backdrop-blur-md rounded-xl border border-white/10 px-1 py-1.5 shadow-lg flex justify-around items-center font-mono">
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-bold text-white/40 tracking-wider">ATQ</span>
                <span className="text-[13px] font-black leading-none mt-0.5">{stats.atq}</span>
              </div>
              <div className="w-[1px] h-[14px] bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-bold text-white/40 tracking-wider">LEV</span>
                <span className="text-[13px] font-black leading-none mt-0.5">{stats.lev}</span>
              </div>
              <div className="w-[1px] h-[14px] bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-bold text-white/40 tracking-wider">BLO</span>
                <span className="text-[13px] font-black leading-none mt-0.5">{stats.blo}</span>
              </div>
              <div className="w-[1px] h-[14px] bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-bold text-white/40 tracking-wider">DEF</span>
                <span className="text-[13px] font-black leading-none mt-0.5">{stats.def}</span>
              </div>
              <div className="w-[1px] h-[14px] bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-bold text-white/40 tracking-wider">SAQ</span>
                <span className="text-[13px] font-black leading-none mt-0.5">{stats.saq}</span>
              </div>
              <div className="w-[1px] h-[14px] bg-white/10" />
              <div className="flex flex-col items-center">
                <span className="text-[8px] font-bold text-white/40 tracking-wider">FIS</span>
                <span className="text-[13px] font-black leading-none mt-0.5">{stats.fis}</span>
              </div>
            </div>
          </div>

          {/* Chemistry & Footer Section */}
          <div className="absolute top-[292px] left-[15px] w-[230px] z-20 flex flex-col gap-1.5">
            {/* Chemistry Bar */}
            <div className="bg-black/60 backdrop-blur-md px-2 py-1.5 rounded-lg border border-white/5 flex items-center justify-between text-[9px] shadow-sm">
              <span className="font-extrabold text-white/40 tracking-wider">QUÍMICA</span>
              <div className="flex items-center gap-1.5 overflow-hidden max-w-[170px] justify-end font-bold">
                {chemistry.length > 0 ? (
                  chemistry.map((partner, i) => (
                    <span
                      key={partner.playerId}
                      className="truncate text-white/80"
                      title={partner.name}
                    >
                      🤝 {partner.name}
                      {i < chemistry.length - 1 && <span className="text-white/20 ml-1">·</span>}
                    </span>
                  ))
                ) : (
                  <span className="text-white/30 italic">Sem histórico</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
