import React, { useState, useRef, useMemo, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { X, Copy, Download, Check, Lock, Star, Trophy, Share2 } from 'lucide-react';
import { FutCard } from './FutCard';
import { Player, Session, Team, Game, PointEvent } from '../../types';
import { buildVutCard, VutCard, Achievement } from '../../logic/futCards';
import { autoFormFromHistory } from '../../logic/rating';
import { calculatePlayerStats } from '../../logic/statistics';

interface FutCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  player: Player;
  players: Player[];
  sessions: Session[];
  teams: Team[];
  games: Game[];
  pointEvents: PointEvent[];
}

type MobileTab = 'card' | 'achievements' | 'export';

export const FutCardModal: React.FC<FutCardModalProps> = ({
  isOpen,
  onClose,
  player,
  players,
  sessions,
  teams,
  games,
  pointEvents,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [includeHistory, setIncludeHistory] = useState(true);
  const [includeStats, setIncludeStats] = useState(true);
  const [includeAchievements, setIncludeAchievements] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileTab>('card');

  // Build the card on-demand (memoized)
  const cardData: VutCard = useMemo(() => {
    return buildVutCard(player, {
      sessions,
      teams,
      games,
      pointEvents,
      players,
      sessionReports: [],
    });
  }, [player, players, sessions, teams, games, pointEvents]);

  if (!isOpen) return null;

  // Technical stats calculated
  const playerStats = calculatePlayerStats(player, games, pointEvents, teams, sessions);

  // Format position
  const positionLabel = player.posicaoPrincipal.toUpperCase();

  // Generate extended text representation
  const textExport = useMemo(() => {
    let text = `🏐 CARTA VUT — ${player.nome.toUpperCase()}\n`;
    text += `━━━━━━━━━━━━━━━━━━━\n`;
    text += `📊 OVR: ${cardData.stats.ovr} | Tier: ${cardData.stats.tier.toUpperCase()} | Posição: ${cardData.posLabel}\n`;
    text += `🤚 Mão: ${cardData.stats.hand} | ⭐ Versatilidade: ${cardData.stats.versatility}/5\n`;
    const formVal = cardData.formBadge.value;
    text += `🟢 Forma: ${formVal !== null ? formVal.toFixed(1) : '—'} (${cardData.edition.label} ${cardData.edition.emoji})\n\n`;

    text += `── ATRIBUTOS ──────────\n`;
    text += `ATQ ${cardData.stats.atq} | BLO ${cardData.stats.blo} | SAQ ${cardData.stats.saq}\n`;
    text += `LEV ${cardData.stats.lev} | DEF ${cardData.stats.def} | FÍS ${cardData.stats.fis}\n\n`;

    text += `── QUÍMICA ────────────\n`;
    if (cardData.chemistry.length > 0) {
      text += `🤝 ` + cardData.chemistry.map(c => `${c.name} (${c.weight.toFixed(1)})`).join(', ') + `\n\n`;
    } else {
      text += `Sem histórico suficiente\n\n`;
    }

    if (includeHistory) {
      text += `── HISTÓRICO ──────────\n`;
      const ratings = player.formaAtual?.ultimasPartidas ?? [];
      text += `📈 Notas: ${ratings.length > 0 ? ratings.join(', ') : 'Sem notas registradas'}\n`;
      const avg = autoFormFromHistory(player);
      text += `📊 Média: ${avg !== null ? avg.toFixed(2) : '—'} | Tendência: ${avg && avg >= 7.0 ? '↗️' : '➡️'}\n\n`;
    }

    if (includeStats) {
      text += `── ESTATÍSTICAS ───────\n`;
      text += `⚡ ${playerStats.totalPoints} pts | 🎯 ${playerStats.assists} assists | 🧱 ${playerStats.blocks} bloqueios\n`;
      text += `🏐 ${playerStats.aces} aces | 📊 Win rate: ${Math.round(playerStats.winRate)}%\n`;
      text += `🎮 ${playerStats.gamesPlayed} jogos | ➕ Saldo: ${playerStats.balance >= 0 ? '+' : ''}${playerStats.balance}\n\n`;
    }

    if (includeAchievements) {
      text += `── CONQUISTAS ─────────\n`;
      const unlocked = cardData.achievements.filter(a => a.unlocked);
      const locked = cardData.achievements.filter(a => !a.unlocked);

      if (unlocked.length > 0) {
        text += unlocked.map(a => `✅ ${a.emoji} ${a.name} (${a.target} ${getUnit(a.id)}) - ${a.description}`).join('\n') + `\n`;
      }
      if (locked.length > 0) {
        text += locked.map(a => `🔓 ${a.emoji} ${a.name} (${a.current}/${a.target} ${getUnit(a.id)}) - ${a.description}`).join('\n') + `\n`;
      }
      if (unlocked.length === 0 && locked.length === 0) {
        text += `Nenhuma conquista aplicável\n`;
      }
    }

    return text.trim();
  }, [cardData, player, playerStats, includeHistory, includeStats, includeAchievements]);

  // Helper to determine the unit of progress
  function getUnit(id: string): string {
    if (id.includes('ponto') || id.includes('cestinha') || id.includes('saldo') || id.includes('opo_completo') || id.includes('pon_faz_tudo') || id.includes('opo_completo') || id.includes('all_quebra') || id.includes('all_resolve') || id.includes('all_pouco') || id.includes('all_polivalente') || id.includes('all_faz_jogar')) return 'pts';
    if (id.includes('jogo') || id.includes('cria') || id.includes('rodou') || id.includes('incansável') || id.includes('camaleao') || id.includes('opo_pontas')) return 'jogos';
    if (id.includes('presenca') || id.includes('sempre') || id.includes('lib_passe_a')) return 'sessões';
    if (id.includes('mvp') || id.includes('craque')) return 'MVPs';
    if (id.includes('maestro') || id.includes('distribuidor') || id.includes('regente') || id.includes('lev_cara') || id.includes('lev_batuta')) return 'Maestros';
    if (id.includes('muralha') || id.includes('guardião') || id.includes('xerife') || id.includes('lib_barreira')) return 'Muralhas';
    if (id.includes('assists') || id.includes('lev_bom') || id.includes('lev_dono') || id.includes('lev_cerebro') || id.includes('lev_frio')) return 'assists';
    if (id.includes('cortadas') || id.includes('opo_braco') || id.includes('opo_canhao') || id.includes('opo_sem') || id.includes('cen_saida')) return 'cortadas';
    if (id.includes('aces') || id.includes('opo_veneno') || id.includes('opo_maquina') || id.includes('pon_viagem') || id.includes('cen_saque')) return 'aces';
    if (id.includes('blocks') || id.includes('cen_mao') || id.includes('cen_paredao') || id.includes('cen_intrans') || id.includes('cen_duplo') || id.includes('cen_torre') || id.includes('cen_dominou') || id.includes('cen_selecao')) return 'bloqueios';
    if (id.includes('defesa') || id.includes('recep') || id.includes('lib_chao') || id.includes('lib_nao_cai') || id.includes('lib_gato') || id.includes('lib_paredao')) return 'highlights';
    if (id.includes('highlights') || id.includes('lev_classe') || id.includes('lib_seguranca') || id.includes('lib_nivel') || id.includes('lib_lendario')) return 'highlights';
    if (id.includes('rating') || id.includes('decisivo') || id.includes('hora')) return 'jogos 8.5+';
    return '';
  }

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(textExport);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const handleDownloadPNG = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      // Ensure fonts are ready
      await document.fonts.ready;
      
      // Generate PNG with higher pixel ratio for crispness
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2.5,
        cacheBust: true,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
        },
      });

      // Try web share if sharing files is supported, otherwise fallback to download
      const filename = `vut-${player.nome.toLowerCase().replace(/\s+/g, '-')}.png`;
      
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: 'image/png' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Carta VUT — ${player.nome}`,
          text: `Confira minha carta no Volley Ultimate Team!`,
        });
      } else {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
      }
    } catch (err) {
      console.error('Failed to export image', err);
    } finally {
      setExporting(false);
    }
  };

  const sortedAchievements = useMemo(() => {
    return [...cardData.achievements].sort((a, b) => {
      if (a.unlocked === b.unlocked) return 0;
      return a.unlocked ? -1 : 1; // unlocked first
    });
  }, [cardData.achievements]);

  const unlockedCount = cardData.achievements.filter(a => a.unlocked).length;
  const totalCount = cardData.achievements.length;

  // ─── Shared sub-components ──────────────────────────────────

  const renderCardPreview = (compact = false) => (
    <div className="flex flex-col items-center">
      <div className={`flex justify-center ${compact ? 'mb-3' : 'mb-6 mt-4'}`}>
        {/* On mobile, scale(0.72) shrinks visually but DOM keeps 260×370. 
            Wrapper clips dead space via explicit height = 370*0.72 ≈ 267px */}
        <div 
          ref={cardRef} 
          className="rounded-2xl"
          style={compact ? { 
            transform: 'scale(0.72)', 
            transformOrigin: 'top center',
            width: '260px',
            height: '370px',
            marginBottom: `${Math.round(370 * (1 - 0.72) * -1)}px`,
          } : undefined}
        >
          <FutCard card={cardData} />
        </div>
      </div>

      <div className={`w-full space-y-2 ${compact ? 'px-2' : ''}`}>
        <button
          onClick={handleDownloadPNG}
          disabled={exporting}
          className="btn btn-primary w-full gap-2 text-xs uppercase font-bold btn-sm lg:btn-md"
        >
          {exporting ? (
            <span className="loading loading-spinner loading-xs"></span>
          ) : (
            <>
              <Download className="w-4 h-4" />
              {navigator.canShare ? 'Compartilhar Carta' : 'Baixar Imagem (PNG)'}
            </>
          )}
        </button>
        <p className="text-[9px] text-center text-base-content/40 uppercase tracking-widest leading-relaxed">
          Exportação em alta resolução (2.5x)
        </p>
      </div>
    </div>
  );

  const renderAchievements = () => (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase text-base-content/50 tracking-wider flex items-center gap-2">
        <Trophy className="w-3.5 h-3.5" />
        Conquistas ({unlockedCount}/{totalCount})
      </h3>
      
      <div className="grid grid-cols-1 gap-2.5 max-h-[55vh] lg:max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
        {sortedAchievements.map((ach) => {
          const pct = Math.min(100, Math.max(0, (ach.current / ach.target) * 100));
          
          return (
            <div
              key={ach.id}
              className={`p-2.5 lg:p-3 rounded-xl border flex items-start gap-2.5 transition-colors ${
                ach.unlocked
                  ? 'bg-success-muted/5 border-success/20 hover:border-success/40'
                  : 'bg-base-300 border-base-300 hover:border-base-content/10'
              }`}
            >
              {/* Icon Status Indicator */}
              <div className="mt-0.5 shrink-0">
                {ach.unlocked ? (
                  <div className="w-5 h-5 rounded-full bg-success/20 text-success flex items-center justify-center">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full bg-base-100 text-base-content/30 flex items-center justify-center">
                    <Lock className="w-3 h-3" />
                  </div>
                )}
              </div>

              {/* Achievement details */}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex justify-between items-baseline gap-2">
                  <span className="font-bold text-xs uppercase text-base-content/95 truncate">
                    {ach.emoji} {ach.name}
                  </span>
                  <span className="text-[9px] font-black uppercase text-base-content/40 tracking-wider shrink-0 font-mono">
                    {ach.rarity}
                  </span>
                </div>
                
                {/* Requisitos / Descrição */}
                <p className="text-[10px] text-accent font-semibold leading-snug">
                  Requisito: {ach.description}
                </p>

                <p className="text-[9px] text-base-content/40">
                  Moldura: {ach.frame.name}
                </p>

                {/* Progress bar */}
                <div className="space-y-0.5 pt-0.5">
                  <div className="flex justify-between items-center text-[8px] font-bold text-base-content/40 font-mono">
                    <span>PROGRESSO</span>
                    <span>
                      {ach.current}/{ach.target} {getUnit(ach.id)}
                    </span>
                  </div>
                  <progress 
                    className={`progress w-full h-1.5 ${ach.unlocked ? 'progress-success' : 'progress-neutral'}`} 
                    value={ach.current} 
                    max={ach.target} 
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderExportConfig = () => (
    <div className="space-y-4">
      <div className="bg-base-300/50 p-4 rounded-xl border border-base-300/80 space-y-3">
        <span className="text-[10px] font-bold text-base-content/40 uppercase tracking-widest block">
          Configurações do Compartilhamento em Texto
        </span>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeHistory}
              onChange={(e) => setIncludeHistory(e.target.checked)}
              className="checkbox checkbox-primary checkbox-xs rounded"
            />
            <span className="text-xs font-bold uppercase text-base-content/80">Histórico de Notas</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeStats}
              onChange={(e) => setIncludeStats(e.target.checked)}
              className="checkbox checkbox-primary checkbox-xs rounded"
            />
            <span className="text-xs font-bold uppercase text-base-content/80">Estatísticas Acumuladas</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeAchievements}
              onChange={(e) => setIncludeAchievements(e.target.checked)}
              className="checkbox checkbox-primary checkbox-xs rounded"
            />
            <span className="text-xs font-bold uppercase text-base-content/80">Lista de Conquistas</span>
          </label>
        </div>

        <div className="flex gap-2 pt-2 border-t border-base-300">
          <button
            onClick={handleCopyToClipboard}
            className="btn btn-outline btn-sm w-full gap-2 text-xs uppercase font-bold"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-success" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copiar Ficha em Texto
              </>
            )}
          </button>
        </div>
      </div>

      {/* Preview of text */}
      <div className="bg-base-300/30 rounded-xl border border-base-300/50 p-3">
        <span className="text-[9px] font-bold text-base-content/30 uppercase tracking-widest block mb-2">
          Pré-visualização
        </span>
        <pre className="text-[10px] text-base-content/60 whitespace-pre-wrap font-mono leading-relaxed max-h-[40vh] overflow-y-auto custom-scrollbar">
          {textExport}
        </pre>
      </div>
    </div>
  );

  // ─── Mobile Tab Bar ──────────────────────────────────────

  const tabItems: { key: MobileTab; label: string; icon: React.ReactNode }[] = [
    { key: 'card', label: 'Card', icon: <Star className="w-3.5 h-3.5" /> },
    { key: 'achievements', label: 'Conquistas', icon: <Trophy className="w-3.5 h-3.5" /> },
    { key: 'export', label: 'Exportar', icon: <Share2 className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="modal modal-open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box w-full max-w-4xl bg-base-200 border border-base-300 rounded-2xl flex flex-col p-0 relative overflow-hidden custom-scrollbar max-h-[95vh] lg:max-h-[90vh]">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="btn btn-sm btn-circle btn-ghost absolute right-3 top-3 z-50 text-base-content/60 hover:text-base-content"
        >
          <X className="w-5 h-5" />
        </button>

        {/* ─── MOBILE HEADER ─────────────────────────────── */}
        <div className="lg:hidden px-4 pt-4 pb-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-base-content flex items-center gap-2">
            <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> VUT Card
          </h2>
          <p className="text-[10px] text-base-content/50 uppercase font-bold tracking-widest mt-0.5">
            {player.apelido || player.nome} · {cardData.activeFrame.name}
          </p>
        </div>

        {/* ─── MOBILE TAB BAR ────────────────────────────── */}
        <div className="lg:hidden flex border-b border-base-300 px-2 bg-base-200 sticky top-0 z-40">
          {tabItems.map(tab => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
                mobileTab === tab.key
                  ? 'text-primary border-primary'
                  : 'text-base-content/40 border-transparent hover:text-base-content/60'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── MOBILE CONTENT (tabs) ─────────────────────── */}
        <div className="lg:hidden flex-1 overflow-y-auto p-4 custom-scrollbar">
          {mobileTab === 'card' && renderCardPreview(true)}
          {mobileTab === 'achievements' && renderAchievements()}
          {mobileTab === 'export' && renderExportConfig()}
        </div>

        {/* ─── DESKTOP LAYOUT (original two-column) ──────── */}
        <div className="hidden lg:flex flex-row gap-6 p-6">
          {/* Column 1: Card Preview & Image Export Actions */}
          <div className="flex flex-col items-center justify-between w-[280px] shrink-0 border-r border-base-300 pr-6">
            {renderCardPreview(false)}
          </div>

          {/* Column 2: Text Export & Achievements Progress */}
          <div className="flex-1 flex flex-col justify-between overflow-y-auto max-h-[70vh] pr-2 custom-scrollbar space-y-6">
            
            {/* Header */}
            <div>
              <h2 className="text-lg font-black uppercase tracking-wider text-base-content flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-400 fill-amber-400" /> Volley Ultimate Team Card
              </h2>
              <p className="text-xs text-base-content/50 uppercase font-bold tracking-widest mt-1">
                Moldura Ativa: <span className="text-accent">{cardData.activeFrame.name} ({cardData.activeFrame.rarity.toUpperCase()})</span>
              </p>
            </div>

            {/* Export Configurations */}
            {renderExportConfig()}

            {/* Achievements Progress Section */}
            {renderAchievements()}

          </div>
        </div>
      </div>
    </div>
  );
};
