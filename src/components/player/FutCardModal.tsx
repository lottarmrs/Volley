import React, { useState, useRef, useMemo } from 'react';
import { toPng } from 'html-to-image';
import {
  X,
  Copy,
  Download,
  Check,
  Lock,
  Star,
  Trophy,
  Share2,
  Target,
  TrendingUp,
  Layers,
  Award,
  Image as ImageIcon,
  Medal,
} from 'lucide-react';
import { FutCard } from './FutCard';
import { Player, Session, Team, Game, PointEvent } from '../../types';
import { buildVutCard, VutCard, Achievement, CardFrame, VutEditionKind } from '../../logic/futCards';
import { autoFormFromHistory, calculateSessionRating } from '../../logic/rating';
import { calculatePlayerStats } from '../../logic/statistics';
import { calculateSessionRecognition } from '../../logic/match';

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

type MobileTab = 'card' | 'evolution' | 'album' | 'collection' | 'export';

const DEFAULT_FRAME_PREVIEW: CardFrame = {
  id: 'default',
  name: 'Padrao',
  rarity: 'common',
  styleKey: 'default',
};

const RARITY_RANK: Record<string, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

const EDITION_RANK: Record<VutEditionKind, number> = {
  base: 1,
  in_form: 2,
  maestro: 3,
  muralha: 3,
  mvp: 4,
};

const editionLabel: Record<VutEditionKind, string> = {
  base: 'Base',
  in_form: 'Em Alta',
  maestro: 'Maestro',
  muralha: 'Muralha',
  mvp: 'MVP da Noite',
};

const editionEmoji: Record<VutEditionKind, string> = {
  base: '⚪',
  in_form: '🟣',
  maestro: '🎯',
  muralha: '🧱',
  mvp: '🏆',
};

const achievementCategory = (achievement: Achievement) => {
  const id = achievement.id;
  if (id.includes('lev') || id.includes('assist') || id.includes('maestro')) return 'Levantamento';
  if (id.includes('lib') || id.includes('defesa') || id.includes('recep')) return 'Defesa';
  if (id.includes('cen') || id.includes('block') || id.includes('muralha')) return 'Bloqueio';
  if (id.includes('saque') || id.includes('ace') || id.includes('veneno')) return 'Saque';
  if (id.includes('opo') || id.includes('pon') || id.includes('ponto') || id.includes('cortada')) return 'Ataque';
  if (id.includes('presenca') || id.includes('sempre') || id.includes('rodou')) return 'Presenca';
  return 'Especial';
};

const progressPct = (achievement: Achievement) =>
  achievement.target > 0 ? Math.min(100, Math.max(0, (achievement.current / achievement.target) * 100)) : 0;

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
  const [selectedFrameId, setSelectedFrameId] = useState<string | null>(null);

  const tabItems: { key: MobileTab; label: string; icon: React.ReactNode }[] = [
    { key: 'card', label: 'Card', icon: <Star className="w-3.5 h-3.5" /> },
    { key: 'evolution', label: 'Evolucao', icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { key: 'album', label: 'Album', icon: <Trophy className="w-3.5 h-3.5" /> },
    { key: 'collection', label: 'Colecao', icon: <Layers className="w-3.5 h-3.5" /> },
    { key: 'export', label: 'Exportar', icon: <Share2 className="w-3.5 h-3.5" /> },
  ];

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

  // Technical stats calculated
  const playerStats = calculatePlayerStats(player, games, pointEvents, teams, sessions);

  const unlockedAchievements = useMemo(
    () => cardData.achievements.filter((achievement) => achievement.unlocked),
    [cardData.achievements],
  );

  const lockedAchievements = useMemo(
    () => cardData.achievements.filter((achievement) => !achievement.unlocked),
    [cardData.achievements],
  );

  const nearAchievements = useMemo(() => {
    return [...lockedAchievements]
      .filter((achievement) => achievement.target > 0 && achievement.current > 0)
      .sort((a, b) => progressPct(b) - progressPct(a))
      .slice(0, 4);
  }, [lockedAchievements]);

  const achievementCategories = useMemo(() => {
    const grouped = new Map<string, Achievement[]>();
    for (const achievement of cardData.achievements) {
      const category = achievementCategory(achievement);
      grouped.set(category, [...(grouped.get(category) || []), achievement]);
    }
    return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cardData.achievements]);

  const unlockedFrames = useMemo(() => {
    const frames = new Map<string, CardFrame>();
    frames.set(DEFAULT_FRAME_PREVIEW.id, DEFAULT_FRAME_PREVIEW);
    for (const achievement of unlockedAchievements) frames.set(achievement.frame.id, achievement.frame);
    frames.set(cardData.activeFrame.id, cardData.activeFrame);
    return [...frames.values()].sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]);
  }, [cardData.activeFrame, unlockedAchievements]);

  const equippedFrame =
    unlockedFrames.find((frame) => frame.id === (selectedFrameId || cardData.activeFrame.id)) ||
    cardData.activeFrame;
  const previewCard: VutCard = { ...cardData, activeFrame: equippedFrame };

  const editionHistory = useMemo(() => {
    const counts: Record<VutEditionKind, number> = {
      base: 0,
      in_form: 0,
      maestro: 0,
      muralha: 0,
      mvp: 0,
    };
    let lastSpecial: { kind: VutEditionKind; sessionName: string; date: string } | null = null;

    const finishedSessions = [...sessions]
      .filter((session) => session.status === 'finished')
      .sort((a, b) => a.date.localeCompare(b.date));

    for (const session of finishedSessions) {
      const sessionTeams = teams.filter((team) => team.sessionId === session.id);
      if (!sessionTeams.some((team) => team.playerIds.includes(player.id))) continue;

      const sessionGames = games.filter((game) => game.sessionId === session.id && game.status === 'finished');
      const sessionPoints = pointEvents.filter((point) => point.sessionId === session.id);
      const participants = players.filter((participant) =>
        sessionTeams.some((team) => team.playerIds.includes(participant.id)),
      );

      const ratings = participants
        .map((participant) => ({
          id: participant.id,
          rating: calculateSessionRating({
            player: participant,
            sessionGames,
            sessionPoints,
            teams: sessionTeams,
          }),
        }))
        .filter((entry) => entry.rating != null)
        .sort((a, b) => b.rating! - a.rating!);

      const rec = calculateSessionRecognition(sessionPoints);
      let kind: VutEditionKind = 'base';
      if (ratings[0]?.id === player.id) kind = 'mvp';
      else if (rec.maestro?.playerId === player.id) kind = 'maestro';
      else if (rec.muralha?.playerId === player.id) kind = 'muralha';

      counts[kind] += 1;
      if (kind !== 'base') lastSpecial = { kind, sessionName: session.name, date: session.date };
    }

    const bestKind = (Object.keys(counts) as VutEditionKind[])
      .filter((kind) => counts[kind] > 0)
      .sort((a, b) => EDITION_RANK[b] - EDITION_RANK[a] || counts[b] - counts[a])[0] || cardData.edition.kind;

    return { counts, bestKind, lastSpecial };
  }, [cardData.edition.kind, games, player.id, players, pointEvents, sessions, teams]);

  const ratingsHistory = player.formaAtual?.ultimasPartidas ?? [];
  const previousRating = ratingsHistory.length >= 2 ? ratingsHistory[ratingsHistory.length - 2] : null;
  const currentRating = ratingsHistory.length >= 1 ? ratingsHistory[ratingsHistory.length - 1] : null;
  const previousAvg =
    ratingsHistory.length >= 2
      ? ratingsHistory.slice(0, -1).reduce((sum, value) => sum + value, 0) / (ratingsHistory.length - 1)
      : null;
  const currentAvg = autoFormFromHistory(player);
  const formDelta =
    previousAvg !== null && currentAvg !== null ? Math.round((currentAvg - previousAvg) * 100) / 100 : null;

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

  if (!isOpen) return null;

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
          <FutCard card={previewCard} />
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

  const renderQuickSummary = () => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      <div className="bg-base-300/50 border border-base-300 rounded-xl p-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-base-content/40">
          Edicao atual
        </p>
        <p className="text-sm font-black text-base-content mt-1">
          {cardData.edition.emoji} {cardData.edition.label}
        </p>
      </div>
      <div className="bg-base-300/50 border border-base-300 rounded-xl p-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-base-content/40">
          Melhor edicao
        </p>
        <p className="text-sm font-black text-base-content mt-1">
          {editionEmoji[editionHistory.bestKind]} {editionLabel[editionHistory.bestKind]}
        </p>
      </div>
      <div className="bg-base-300/50 border border-base-300 rounded-xl p-3">
        <p className="text-[9px] font-black uppercase tracking-widest text-base-content/40">
          Moldura equipada
        </p>
        <p className="text-sm font-black text-accent mt-1 truncate">
          {equippedFrame.name}
        </p>
      </div>
    </div>
  );

  const renderNearAchievements = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-bold uppercase text-base-content/50 tracking-wider flex items-center gap-2">
          <Target className="w-3.5 h-3.5 text-accent" />
          Quase la
        </h3>
        <span className="text-[9px] font-bold uppercase text-base-content/40">
          {nearAchievements.length} metas proximas
        </span>
      </div>

      {nearAchievements.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {nearAchievements.map((ach) => {
            const remaining = Math.max(0, ach.target - ach.current);
            return (
              <div key={ach.id} className="border border-accent/20 bg-accent/5 rounded-xl p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-black uppercase text-base-content">
                      {ach.emoji} {ach.name}
                    </p>
                    <p className="text-[10px] text-base-content/55 leading-snug mt-1">
                      Faltam {remaining} {getUnit(ach.id) || 'pontos de progresso'}
                    </p>
                  </div>
                  <span className="badge badge-accent badge-soft badge-xs uppercase font-bold">
                    {Math.round(progressPct(ach))}%
                  </span>
                </div>
                <progress className="progress progress-accent h-1.5 w-full" value={ach.current} max={ach.target} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="border border-base-300 bg-base-300/40 rounded-xl p-4 text-center">
          <p className="text-xs font-bold uppercase text-base-content/60">
            Sem metas proximas ainda
          </p>
          <p className="text-[10px] text-base-content/40 mt-1">
            Jogue mais sessoes para o app encontrar conquistas no radar.
          </p>
        </div>
      )}
    </div>
  );

  const renderAchievements = () => (
    <div className="space-y-3">
      <h3 className="text-xs font-bold uppercase text-base-content/50 tracking-wider flex items-center gap-2">
        <Trophy className="w-3.5 h-3.5" />
        Conquistas ({unlockedCount}/{totalCount})
      </h3>
      {renderNearAchievements()}
      
      <div className="grid grid-cols-1 gap-3 max-h-[55vh] lg:max-h-[360px] overflow-y-auto pr-1 custom-scrollbar">
        {achievementCategories.map(([category, achievements]) => (
          <div key={category} className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-base-content/35">
              {category}
            </p>
            {achievements
              .slice()
              .sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || progressPct(b) - progressPct(a))
              .map((ach) => {
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
        ))}
      </div>
    </div>
  );

  const renderEvolution = () => (
    <div className="space-y-4">
      <h3 className="text-xs font-bold uppercase text-base-content/50 tracking-wider flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-success" />
        Evolucao da carta
      </h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'OVR atual', value: cardData.stats.ovr, desc: cardData.stats.tier.toUpperCase() },
          { label: 'Ultima nota', value: currentRating?.toFixed(1) ?? '-', desc: previousRating !== null ? `antes ${previousRating.toFixed(1)}` : 'sem historico' },
          { label: 'Forma media', value: currentAvg?.toFixed(1) ?? '-', desc: formDelta !== null ? `${formDelta >= 0 ? '+' : ''}${formDelta}` : 'sem delta' },
          { label: 'Versatilidade', value: `${cardData.stats.versatility}/5`, desc: cardData.stats.hand === 'L' ? 'canhoto' : 'destro' },
        ].map((item) => (
          <div key={item.label} className="bg-base-300/50 border border-base-300 rounded-xl p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-base-content/40">
              {item.label}
            </p>
            <p className="text-xl font-black font-mono text-base-content mt-1">{item.value}</p>
            <p className="text-[9px] font-bold uppercase text-base-content/45 mt-1">{item.desc}</p>
          </div>
        ))}
      </div>

      <div className="border border-base-300 bg-base-300/35 rounded-xl p-4">
        <ul className="steps steps-vertical lg:steps-horizontal w-full">
          <li className={`step ${previousRating !== null ? 'step-primary' : ''}`}>
            Antes {previousRating !== null ? previousRating.toFixed(1) : '-'}
          </li>
          <li className={`step ${currentRating !== null ? 'step-primary' : ''}`}>
            Agora {currentRating !== null ? currentRating.toFixed(1) : '-'}
          </li>
          <li className={`step ${cardData.edition.kind !== 'base' ? 'step-accent' : ''}`}>
            {cardData.edition.label}
          </li>
        </ul>
      </div>

      {renderNearAchievements()}
    </div>
  );

  const renderCollection = () => (
    <div className="space-y-4">
      <h3 className="text-xs font-bold uppercase text-base-content/50 tracking-wider flex items-center gap-2">
        <Layers className="w-3.5 h-3.5 text-primary" />
        Colecao de edicoes e molduras
      </h3>

      {renderQuickSummary()}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="border border-base-300 bg-base-300/35 rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-base-content/45 flex items-center gap-2">
            <Award className="w-3.5 h-3.5" />
            Edicoes historicas
          </p>
          {(Object.keys(editionHistory.counts) as VutEditionKind[]).map((kind) => (
            <div key={kind} className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-base-content/80">
                {editionEmoji[kind]} {editionLabel[kind]}
              </span>
              <span className="badge badge-neutral badge-soft badge-sm font-mono">
                x{editionHistory.counts[kind]}
              </span>
            </div>
          ))}
          {editionHistory.lastSpecial && (
            <p className="text-[10px] text-base-content/50 border-t border-base-300 pt-3">
              Ultima especial: {editionLabel[editionHistory.lastSpecial.kind]} em {editionHistory.lastSpecial.sessionName}
            </p>
          )}
        </div>

        <div className="border border-base-300 bg-base-300/35 rounded-xl p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-base-content/45 flex items-center gap-2">
            <Medal className="w-3.5 h-3.5" />
            Molduras desbloqueadas
          </p>
          <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1 custom-scrollbar">
            {unlockedFrames.map((frame) => {
              const selected = equippedFrame.id === frame.id;
              return (
                <button
                  key={frame.id}
                  type="button"
                  onClick={() => setSelectedFrameId(frame.id)}
                  className={`p-2.5 rounded-lg border text-left transition-colors ${
                    selected
                      ? 'border-accent bg-accent/10'
                      : 'border-base-300 bg-base-200 hover:border-base-content/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black uppercase text-base-content truncate">
                      {frame.name}
                    </span>
                    <span className="badge badge-xs badge-outline uppercase font-bold">
                      {frame.rarity}
                    </span>
                  </div>
                  <p className="text-[9px] text-base-content/40 mt-1">
                    {selected ? 'Equipada no preview' : 'Toque para visualizar'}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  const renderExportConfig = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {[
          {
            label: 'Card individual',
            icon: <ImageIcon className="w-4 h-4" />,
            text: `${player.nome} - Carta VUT\nOVR ${cardData.stats.ovr} | ${cardData.posLabel} | ${cardData.edition.label}\nMoldura: ${equippedFrame.name}`,
          },
          {
            label: 'Resumo atleta',
            icon: <TrendingUp className="w-4 h-4" />,
            text: `${player.nome} no VUT\nForma: ${currentAvg !== null ? currentAvg.toFixed(1) : '-'} | Conquistas: ${unlockedCount}/${totalCount}\nQuase la: ${nearAchievements[0]?.name || 'sem meta proxima'}`,
          },
          {
            label: 'Pacote da noite',
            icon: <Trophy className="w-4 h-4" />,
            text: `Pacote VUT\n${player.nome}: ${cardData.edition.emoji} ${cardData.edition.label}\nMelhor historica: ${editionLabel[editionHistory.bestKind]}\nMoldura: ${equippedFrame.name}`,
          },
        ].map((preset) => (
          <button
            key={preset.label}
            onClick={async () => {
              await navigator.clipboard.writeText(preset.text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
            className="btn btn-outline btn-sm h-auto min-h-0 py-3 flex-col gap-1 uppercase font-bold text-[10px]"
          >
            {preset.icon}
            {preset.label}
          </button>
        ))}
      </div>

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
            {player.apelido || player.nome} · {equippedFrame.name}
          </p>
        </div>

        {/* ─── MOBILE TAB BAR ────────────────────────────── */}
        <div className="lg:hidden flex border-b border-base-300 px-2 bg-base-200 sticky top-0 z-40 overflow-x-auto">
          {tabItems.map(tab => (
            <button
              key={tab.key}
              onClick={() => setMobileTab(tab.key)}
              className={`min-w-max px-3 flex items-center justify-center gap-1.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 ${
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
          {mobileTab === 'card' && (
            <div className="space-y-4">
              {renderCardPreview(true)}
              {renderQuickSummary()}
            </div>
          )}
          {mobileTab === 'evolution' && renderEvolution()}
          {mobileTab === 'album' && renderAchievements()}
          {mobileTab === 'collection' && renderCollection()}
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
                Moldura equipada: <span className="text-accent">{equippedFrame.name} ({equippedFrame.rarity.toUpperCase()})</span>
              </p>
            </div>

            {renderQuickSummary()}

            <div role="tablist" className="tabs tabs-box bg-base-300/60">
              {tabItems
                .filter((tab) => tab.key !== 'card')
                .map((tab) => (
                  <button
                    key={tab.key}
                    role="tab"
                    onClick={() => setMobileTab(tab.key)}
                    className={`tab tab-sm gap-1.5 font-bold uppercase text-[10px] ${
                      mobileTab === tab.key ? 'tab-active' : ''
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                  </button>
                ))}
            </div>

            {(mobileTab === 'card' || mobileTab === 'evolution') && renderEvolution()}
            {mobileTab === 'album' && renderAchievements()}
            {mobileTab === 'collection' && renderCollection()}
            {mobileTab === 'export' && renderExportConfig()}

          </div>
        </div>
      </div>
    </div>
  );
};
