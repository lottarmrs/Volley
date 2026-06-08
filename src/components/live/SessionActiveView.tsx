import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { TournamentActiveView } from './TournamentActiveView';
import { 
  Share2,
  Copy,
  Activity, 
  RotateCcw, 
  Plus, 
  RotateCw, 
  Trophy, 
  Zap, 
  ChevronUp, 
  ChevronDown, 
  Trash2 
} from 'lucide-react';
import { 
  Session, 
  Game, 
  PointEvent, 
  Team, 
  Player, 
  FreePlayConfig, 
  PointReason,
  GameReport,
  SessionReport
} from '../../types';
import { useLiveSession } from '../../hooks/useLiveSession';
import { getPointLabel, POINT_REASON_LABELS } from '../../logic/match';
import { TeamScoreCard } from './TeamScoreCard';
import { PointModal } from './PointModal';
import { openWhatsAppShare, copyToClipboard } from '../../logic/exporters';

interface SessionActiveViewProps {
  activeSession: Session;
  games: Game[];
  setGames: React.Dispatch<React.SetStateAction<Game[]>>;
  pointEvents: PointEvent[];
  setPointEvents: React.Dispatch<React.SetStateAction<PointEvent[]>>;
  players: Player[];
  sessionTeams: Team[];
  gameReports: GameReport[];
  setGameReports: React.Dispatch<React.SetStateAction<GameReport[]>>;
  setActiveSession: (s: Session) => void;
  onExit: () => void;
  onFinishSession: () => void;
}

export const SessionActiveView = ({
  activeSession,
  games,
  setGames,
  pointEvents,
  setPointEvents,
  players,
  sessionTeams,
  gameReports,
  setGameReports,
  setActiveSession,
  onExit,
  onFinishSession
}: SessionActiveViewProps) => {
  const {
    currentGame,
    sessionGames,
    sessionPoints,
    teamStats,
    scoringRanking,
    tournamentStandings,
    pointModalTeamId,
    setPointModalTeamId,
    registerPoint,
    finishCurrentGameManually,
    startNextGame,
    undoLastPoint,
    registerWalkover,
    pauseGame,
    reopenGame,
    cancelGame,
    updateFinalScore,
    reorderScheduledGame,
    shareGameToWhatsApp,
    copyGameToClipboard,
    nextMatchPreview
  } = useLiveSession(
    activeSession,
    games,
    setGames,
    pointEvents,
    setPointEvents,
    players,
    sessionTeams,
    gameReports,
    setGameReports,
  );

  const shareNextFreePlayMatch = () => {
    if (!nextMatchPreview) return;
    const teamA = sessionTeams.find(t => t.id === nextMatchPreview.nextCourtTeams[0])?.name || "Time A";
    const teamB = sessionTeams.find(t => t.id === nextMatchPreview.nextCourtTeams[1])?.name || "Time B";
    
    const text = [
      `*Próxima Partida — ${activeSession.name}*`,
      ``,
      `🔥 *${teamA}* vs *${teamB}*`,
      ``,
      `Preparem-se para entrar em quadra!`,
      ``,
      `Acompanhe no Panelinha 🏐`
    ].join("\n");
    
    openWhatsAppShare(text);
  };

  const copyNextFreePlayMatch = async () => {
    if (!nextMatchPreview) return;
    const teamA = sessionTeams.find(t => t.id === nextMatchPreview.nextCourtTeams[0])?.name || "Time A";
    const teamB = sessionTeams.find(t => t.id === nextMatchPreview.nextCourtTeams[1])?.name || "Time B";
    
    const text = [
      `*Próxima Partida — ${activeSession.name}*`,
      ``,
      `🔥 *${teamA}* vs *${teamB}*`,
      ``,
      `Preparem-se para entrar em quadra!`,
      ``,
      `Acompanhe no Panelinha 🏐`
    ].join("\n");
    
    const ok = await copyToClipboard(text);
    if (ok) alert('Próxima partida copiada!');
  };

  if (activeSession.type === 'tournament' && tournamentStandings) {
    return (
      <TournamentActiveView
        activeSession={activeSession}
        sessionGames={sessionGames}
        sessionPoints={sessionPoints}
        currentGame={currentGame}
        standings={tournamentStandings}
        sessionTeams={sessionTeams}
        players={players}
        scoringRanking={scoringRanking}
        pointModalTeamId={pointModalTeamId}
        setPointModalTeamId={setPointModalTeamId}
        registerPoint={registerPoint}
        finishCurrentGameManually={finishCurrentGameManually}
        startNextGame={startNextGame}
        undoLastPoint={undoLastPoint}
        registerWalkover={registerWalkover}
        pauseGame={pauseGame}
        reopenGame={reopenGame}
        cancelGame={cancelGame}
        updateFinalScore={updateFinalScore}
        reorderScheduledGame={reorderScheduledGame}
        onFinishSession={onFinishSession}
        onExit={onExit}
        setActiveSession={setActiveSession}
        shareGameToWhatsApp={shareGameToWhatsApp}
        copyGameToClipboard={copyGameToClipboard}
        games={games}
      />
    );
  }

  const getTeamOnCourtStreak = (teamId: string, isGameActive: boolean) => {
    let count = 0;
    // If game is active, we look for PREVIOUS games. 
    // If game is finished, we look for all finished games including this one.
    const finishedGames = games
      .filter(g => g.sessionId === activeSession.id && g.status === 'finished' && (!isGameActive || g.id !== currentGame?.id))
      .sort((a,b) => new Date(b.finishedAt!).getTime() - new Date(a.finishedAt!).getTime());
    
    for (const g of finishedGames) {
      if (g.teamAId === teamId || g.teamBId === teamId) count++;
      else break;
    }
    
    // If game is active, then this current game is the (count + 1)-th game for this team on court
    return isGameActive ? count + 1 : count;
  };

  const updateQueue = (newQueue: string[]) => {
    if (activeSession.type !== 'free_play') return;
    setActiveSession({
      ...activeSession,
      config: {
        ...activeSession.config as FreePlayConfig,
        initialQueue: newQueue
      }
    });
  };

  const moveTeamInQueue = (idx: number, direction: 'up' | 'down') => {
    const cfg = activeSession.config as FreePlayConfig;
    if (!cfg.initialQueue) return;
    
    const newQueue = [...cfg.initialQueue];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    
    if (targetIdx < 0 || targetIdx >= newQueue.length) return;
    
    [newQueue[idx], newQueue[targetIdx]] = [newQueue[targetIdx], newQueue[idx]];
    updateQueue(newQueue);
  };

  const removeTeamFromQueue = (tid: string) => {
    const cfg = activeSession.config as FreePlayConfig;
    if (!cfg.initialQueue) return;
    if (!confirm(`Remover o time ${sessionTeams.find(t => t.id === tid)?.name || ''} da fila?`)) return;
    updateQueue(cfg.initialQueue.filter(id => id !== tid));
  };

  if (!currentGame) {
    return (
      <div className="space-y-6 pb-32">
        <div className="navbar bg-base-200 border border-base-300 rounded-xl sticky top-0 z-20 justify-between px-4">
          <div className="flex flex-col items-start gap-1">
            <h2 className="text-base font-bold uppercase tracking-tight text-base-content">{activeSession.name}</h2>
            <div className="flex gap-3 items-center">
              <span className="badge badge-success badge-soft badge-xs font-bold uppercase tracking-wider">
                <Activity className="w-2.5 h-2.5 mr-1" /> Sessão Ativa
              </span>
              <span className="text-[9px] font-bold text-text-muted uppercase">
                {activeSession.type === 'free_play' ? 'Jogo Livre' : 'Torneio'}
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={onExit}
              className="btn btn-xs btn-error btn-soft"
            >
              Voltar
            </button>
            <button 
              onClick={onFinishSession}
              className="btn btn-xs btn-accent btn-soft font-bold"
            >
              Encerrar Sessão
            </button>
          </div>
        </div>

        <div className="card card-border bg-base-200 border-dashed max-w-lg mx-auto">
          <div className="card-body items-center text-center p-12 space-y-6">
            <div className="w-16 h-16 bg-accent/15 rounded-full flex items-center justify-center">
              <Activity className="w-8 h-8 text-accent" />
            </div>
            <div>
              <h3 className="card-title text-sm font-bold uppercase tracking-widest text-accent justify-center">Sessão Iniciada</h3>
              <p className="text-xs text-text-muted mt-2 max-w-xs leading-relaxed uppercase font-bold">
                Pronto para os jogos. Toque no botão abaixo para iniciar a primeira partida.
              </p>
            </div>
            <button 
              onClick={() => {
                const cfg = activeSession.config as FreePlayConfig;
                let teamAId = activeSession.teamIds[0];
                let teamBId = activeSession.teamIds[1] || teamAId;

                if (activeSession.type === 'free_play' && cfg.initialCourtTeams?.[0] && cfg.initialCourtTeams?.[1]) {
                  teamAId = cfg.initialCourtTeams[0];
                  teamBId = cfg.initialCourtTeams[1];
                }

                const nextSequenceNumber = games.filter(g => g.sessionId === activeSession.id).length + 1;

                const newGame: Game = {
                  id: `game-${Date.now()}`,
                  sessionId: activeSession.id,
                  type: activeSession.type!,
                  sequenceNumber: nextSequenceNumber,
                  teamAId,
                  teamBId,
                  scoreA: 0,
                  scoreB: 0,
                  status: 'active',
                  startedAt: new Date().toISOString(),
                  pointIds: []
                };
                setGames([...games, newGame]);
              }}
              className="btn btn-primary w-full"
            >
              Começar Primeira Partida
            </button>
          </div>
        </div>
      </div>
    );
  }

  const teamA = sessionTeams.find(t => t.id === currentGame.teamAId);
  const teamB = sessionTeams.find(t => t.id === currentGame.teamBId);

  if (!teamA || !teamB) {
    return (
      <div className="card card-border bg-base-200 border-dashed max-w-lg mx-auto">
         <div className="card-body items-center text-center p-12 space-y-6">
           <div className="w-16 h-16 bg-error/15 rounded-full flex items-center justify-center">
              <Trash2 className="w-8 h-8 text-error" />
           </div>
           <div>
             <h3 className="card-title text-sm font-bold uppercase tracking-widest text-error justify-center">Erro de Carregamento</h3>
             <p className="text-xs text-text-muted mt-2 max-w-xs leading-relaxed uppercase font-bold">
               Não foi possível localizar os times desta partida. Tente voltar ao dashboard e retomar a sessão.
             </p>
           </div>
           <button onClick={onExit} className="btn btn-error btn-soft w-full">
             Voltar ao Menu
           </button>
         </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-32">
       <div className="navbar bg-base-200 border border-base-300 rounded-xl sticky top-0 z-20 justify-between px-4">
          <div className="flex flex-col items-start gap-1">
             <h2 className="text-base font-bold uppercase tracking-tight text-base-content">{activeSession.name}</h2>
             <div className="flex gap-3 items-center">
                <span className="badge badge-success badge-soft badge-xs font-bold uppercase tracking-wider">
                  <Activity className="w-2.5 h-2.5 mr-1" /> Sessão Ativa
                </span>
                <span className="text-[9px] font-bold text-text-muted uppercase">
                  {activeSession.type === 'free_play' ? 'Jogo Livre' : 'Torneio'}
                </span>
                <span className="hidden sm:inline text-[9px] text-text-muted opacity-50">•</span>
                <span className="hidden sm:inline text-[9px] font-bold uppercase tracking-widest text-accent">
                  Até {activeSession.config?.maxPoints} pts · {activeSession.config?.tieBreakMethod === 'direct_3' ? '3 Direto' : 'Vai a 2'}
                </span>
             </div>
          </div>
          <div className="flex gap-2">
             <button 
               onClick={onExit}
               className="btn btn-xs btn-error btn-soft"
             >
               Voltar
             </button>
             <button 
               onClick={onFinishSession}
               className="btn btn-xs btn-accent btn-soft font-bold"
             >
               Encerrar Sessão
             </button>
          </div>
       </div>

       {activeSession.type === 'tournament' && (
         <div role="alert" className="alert alert-info alert-soft">
            <span className="text-xs font-bold uppercase">Modo Torneio ativo. Use o painel de rodadas.</span>
         </div>
       )}

       <div className="flex flex-col items-center justify-center space-y-1 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-text-muted">JOGO {currentGame.sequenceNumber} — {currentGame.status === 'finished' ? 'FINALIZADO' : 'EM ANDAMENTO'}</span>
          {currentGame.status === 'active' && (currentGame.scoreA >= activeSession.config!.maxPoints - 1 || currentGame.scoreB >= activeSession.config!.maxPoints - 1) && (
            <motion.span 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="badge badge-accent uppercase font-bold"
            >
              Ponto Decisivo
            </motion.span>
          )}
       </div>

       <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
             <TeamScoreCard 
               team={teamA}
               score={currentGame.scoreA}
               isWinner={currentGame.winnerTeamId === currentGame.teamAId}
               onCourtStreak={getTeamOnCourtStreak(currentGame.teamAId, currentGame.status === 'active')}
               color="from-blue-600"
               isGameActive={currentGame.status === 'active'}
               scoringRanking={scoringRanking}
               players={players}
               onRegisterPoint={() => registerPoint(currentGame.teamAId)}
               onOpenDetailModal={() => setPointModalTeamId(currentGame.teamAId)}
             />
             <TeamScoreCard 
               team={teamB}
               score={currentGame.scoreB}
               isWinner={currentGame.winnerTeamId === currentGame.teamBId}
               onCourtStreak={getTeamOnCourtStreak(currentGame.teamBId, currentGame.status === 'active')}
               color="from-red-600"
               isGameActive={currentGame.status === 'active'}
               scoringRanking={scoringRanking}
               players={players}
               onRegisterPoint={() => registerPoint(currentGame.teamBId)}
               onOpenDetailModal={() => setPointModalTeamId(currentGame.teamBId)}
             />
          </div>

          {currentGame.status === 'finished' && (
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex flex-col items-center gap-6 bg-accent/10 p-6 rounded-2xl border border-accent/20"
            >
              <div className="flex flex-col items-center gap-1 text-center">
                 <p className="text-sm font-bold text-accent uppercase tracking-[0.2em] animate-pulse">Confronto Finalizado</p>
                 <p className="text-[10px] font-bold text-text-muted uppercase">Vitória do {sessionTeams.find(t => t.id === currentGame.winnerTeamId)?.name}</p>
              </div>

              {nextMatchPreview && (
                <div className="w-full flex flex-col gap-4 bg-base-300/40 p-4 rounded-xl border border-base-300">
                   <div className="grid grid-cols-2 gap-4">
                      <div className="text-center">
                         <p className="text-[8px] font-bold text-text-muted uppercase mb-2 tracking-[0.1em]">Próxima Batalha</p>
                         <div className="flex items-center justify-center gap-2">
                            <span className="text-[10px] font-bold text-base-content truncate max-w-[80px]">{sessionTeams.find(t => t.id === nextMatchPreview.nextCourtTeams[0])?.name}</span>
                            <span className="text-[8px] font-bold text-accent">VS</span>
                            <span className="text-[10px] font-bold text-base-content truncate max-w-[80px]">{sessionTeams.find(t => t.id === nextMatchPreview.nextCourtTeams[1])?.name}</span>
                         </div>
                      </div>
                      <div className="text-center border-l border-base-300">
                         <p className="text-[8px] font-bold text-text-muted uppercase mb-2 tracking-[0.1em]">Próximo da Fila</p>
                         <p className="text-[10px] font-bold text-accent">
                            {sessionTeams.find(t => t.id === nextMatchPreview.nextQueue?.[0])?.name || "Fila Vazia"}
                         </p>
                      </div>
                   </div>
                   <div className="border-t border-base-300 pt-2 flex justify-center gap-2">
                     <button 
                       onClick={shareNextFreePlayMatch}
                       className="btn btn-xs btn-success btn-soft text-success"
                       title="Compartilhar próxima partida"
                     >
                       <Share2 className="w-3 h-3" /> Zap Próximo
                     </button>
                     <button 
                       onClick={copyNextFreePlayMatch}
                       className="btn btn-xs btn-outline"
                       title="Copiar próxima partida"
                     >
                       <Copy className="w-3 h-3" /> Copiar Próximo
                     </button>
                   </div>
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-3 w-full">
                <button 
                  onClick={() => startNextGame(setActiveSession)}
                  className="btn btn-accent flex-1 min-w-[200px]"
                >
                  Iniciar Próximo Jogo
                </button>
                <div className="flex gap-2 w-full sm:w-auto">
                   <button 
                      onClick={() => shareGameToWhatsApp(currentGame.id)}
                      className="btn btn-success btn-soft text-success flex-1"
                   >
                      <Share2 className="w-4 h-4" /> WhatsApp
                   </button>
                   <button 
                      onClick={async () => {
                        const success = await copyGameToClipboard(currentGame.id);
                        if (success) alert('Resumo copiado!');
                      }}
                      className="btn btn-outline flex-1"
                   >
                      <Copy className="w-4 h-4" /> Copiar
                   </button>
                </div>
              </div>
            </motion.div>
          )}

          <div className="flex justify-center relative z-10 transition-all -mt-8">
             <button 
               onClick={undoLastPoint}
               className="btn btn-sm btn-outline rounded-full bg-base-200"
             >
               <RotateCcw className="w-3 h-3" /> Desfazer Ponto
             </button>
          </div>

          <AnimatePresence>
            {pointModalTeamId && sessionTeams.some(t => t.id === pointModalTeamId) && (
              <PointModal 
                team={sessionTeams.find(t => t.id === pointModalTeamId)!}
                players={players}
                onClose={() => setPointModalTeamId(null)}
                onConfirm={(playerId, reason) => {
                   registerPoint(pointModalTeamId, playerId, reason);
                   setPointModalTeamId(null);
                }}
              />
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
             <div className="lg:col-span-2 space-y-6">
                <div className="card card-border bg-base-200 overflow-hidden">
                   <div className="p-4 bg-base-300/40 border-b border-base-300 flex items-center justify-between">
                      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">Sessões do Confronto</h4>
                      <span className="badge badge-accent badge-soft font-bold uppercase">Tempo Real</span>
                   </div>
                   <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                      {sessionPoints.slice().reverse().map(p => {
                         const label = getPointLabel(p, sessionTeams, players);
                         return (
                           <motion.div 
                             initial={{ opacity: 0, x: -10 }}
                             animate={{ opacity: 1, x: 0 }}
                             key={p.id} 
                             className="flex items-center justify-between p-2 rounded hover:bg-base-100 transition-colors group"
                           >
                              <div className="flex items-center gap-3">
                                 <span className="text-[10px] font-mono text-accent opacity-50 w-12 shrink-0">J{games.find(g => g.id === p.gameId)?.sequenceNumber}•#{p.sequenceNumber}</span>
                                 <div>
                                   <p className="text-[10px] font-bold text-base-content uppercase">{label.playerName}</p>
                                   <div className="flex items-center gap-2">
                                       <span className="text-[8px] font-bold text-text-muted uppercase">{label.teamName}</span>
                                       <span className="text-[8px] text-accent italic">• {label.reason}</span>
                                   </div>
                                 </div>
                              </div>
                              <div className="text-right">
                                 <p className="text-[10px] font-bold font-mono text-accent">{label.score}</p>
                                 <p className="text-[7px] text-text-muted uppercase">{new Date(p.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
                              </div>
                           </motion.div>
                         );
                      })}
                      {sessionPoints.length === 0 && (
                        <div className="text-center py-12 text-xs text-text-muted opacity-30 italic uppercase border border-dashed border-base-300 rounded-xl">Nenhum evento registrado.</div>
                      )}
                   </div>
                </div>

                <div className="card card-border bg-base-200 overflow-hidden">
                   <div className="p-4 bg-base-300/40 border-b border-base-300 flex items-center justify-between">
                      <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">Jogadores em Destaque</h4>
                      <Zap className="w-3.5 h-3.5 text-accent" />
                   </div>
                   <div className="p-2 space-y-1">
                      {scoringRanking.slice(0, 5).map((rank, i) => {
                         const p = players.find(player => player.id === rank.playerId);
                         const pPoints = sessionPoints.filter(pt => pt.playerId === rank.playerId);
                         const reasons = pPoints.reduce((acc, curr) => {
                           const r = curr.reason || 'unknown';
                           acc[r] = (acc[r] || 0) + 1;
                           return acc;
                         }, {} as Record<string, number>);
                         const topReason = (Object.entries(reasons).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] as PointReason) || 'unknown';

                         return (
                           <div key={rank.playerId} className="flex items-center justify-between p-3 rounded-xl bg-base-100/50 hover:bg-base-100 transition-all group overflow-hidden relative">
                              <div className={`absolute top-0 left-0 w-1 h-full ${i === 0 ? 'bg-accent' : 'bg-base-300'}`} />
                              <div className="flex items-center gap-3 relative pl-1">
                                 <span className={`text-[10px] font-bold font-mono ${i === 0 ? 'text-accent' : 'text-text-muted'}`}>0{i + 1}</span>
                                 <div>
                                     <p className="text-[10px] font-bold uppercase text-base-content leading-none">{p?.apelido || p?.nome}</p>
                                     <div className="flex gap-2 items-center mt-1">
                                       <span className="text-[10px] font-bold font-mono text-accent">{rank.points} <span className="text-[8px] text-text-muted uppercase">PTS</span></span>
                                       <span className="text-[9px] uppercase text-text-muted font-medium italic opacity-60">• {POINT_REASON_LABELS[topReason]}</span>
                                     </div>
                                 </div>
                              </div>
                              <div className="text-right">
                                 <div className={`w-8 h-8 rounded-full flex items-center justify-center border border-base-300 bg-base-200 ${i === 0 ? 'border-accent/50' : ''}`}>
                                   <Zap className={`w-3.5 h-3.5 ${i === 0 ? 'text-accent' : 'text-text-muted'}`} />
                                 </div>
                              </div>
                           </div>
                         );
                      })}
                      {scoringRanking.length === 0 && (
                        <div className="text-center py-12 text-xs text-text-muted opacity-30 italic uppercase border border-dashed border-base-300 rounded-xl">Sem pontuação individual.</div>
                      )}
                   </div>
                </div>
             </div>

             <div className="space-y-6">
                <div className="card card-border bg-base-200 overflow-hidden">
                   <div className="p-4 bg-base-300/40 border-b border-base-300 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-3.5 h-3.5 text-accent" />
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-accent">Classificação Geral</h4>
                      </div>
                      <span className="text-[8px] font-mono text-accent opacity-60">SESSÃO</span>
                   </div>
                   <div className="p-2 space-y-2 max-h-[400px] overflow-y-auto">
                      {teamStats.map((stat, i) => {
                         const team = sessionTeams.find(t => t.id === stat.teamId);
                         const winRate = stat.gamesPlayed > 0 ? Math.round((stat.wins / stat.gamesPlayed) * 100) : 0;
                         return (
                           <div key={stat.teamId} className="p-4 rounded-xl bg-base-100/50 border border-base-300 space-y-3 hover:border-base-300 transition-all relative group overflow-hidden">
                              <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 -rotate-12 translate-x-4 -translate-y-4 rounded-3xl group-hover:bg-accent/5 transition-all" />
                              
                              <div className="flex justify-between items-start relative">
                                 <div className="flex gap-3">
                                     <span className="text-[10px] font-bold font-mono text-text-muted w-4">{i + 1}º</span>
                                     <div>
                                        <p className="text-xs font-bold uppercase text-base-content truncate max-w-[120px]">{team?.name}</p>
                                        <div className="flex gap-2 items-center mt-0.5">
                                          <span className="text-[10px] font-bold text-success">{stat.wins}V</span>
                                          <span className="text-[10px] font-bold text-error">{stat.losses}D</span>
                                          <span className="text-[9px] font-bold text-text-muted/40">• {winRate}% VIT</span>
                                        </div>
                                     </div>
                                 </div>
                                 <div className="text-right">
                                    <span className={`text-xl font-bold font-mono leading-none ${stat.pointDifference > 0 ? 'text-success' : stat.pointDifference < 0 ? 'text-error' : 'text-text-muted'}`}>
                                      {stat.pointDifference > 0 ? '+' : ''}{stat.pointDifference}
                                    </span>
                                    <p className="text-[8px] uppercase font-bold text-text-muted">SALDO</p>
                                 </div>
                              </div>
                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-base-300 relative">
                                 <div className="text-center">
                                     <p className="text-[8px] uppercase font-bold text-text-muted">Pró</p>
                                     <p className="font-mono text-xs text-base-content">{stat.pointsFor}</p>
                                 </div>
                                 <div className="text-center">
                                     <p className="text-[8px] uppercase font-bold text-text-muted">Contra</p>
                                     <p className="font-mono text-xs text-text-muted">{stat.pointsAgainst}</p>
                                 </div>
                              </div>
                           </div>
                         );
                      })}
                   </div>
                </div>

                <div className="space-y-6">
                   {activeSession.type === 'free_play' && (
                     <>
                        <div className="card card-border bg-base-200 border-t-4 border-t-accent overflow-hidden">
                           <div className="card-body p-5">
                              <div className="flex items-center justify-between mb-4">
                                 <h4 className="text-[10px] font-bold uppercase tracking-widest text-accent">Ordem de Reentrada</h4>
                                 <RotateCcw className="w-3.5 h-3.5 text-accent/50" />
                              </div>
                              
                              <div className="space-y-1.5">
                                 {(activeSession.config as FreePlayConfig).initialQueue?.map((tid, idx) => {
                                   const team = sessionTeams.find(t => t.id === tid);
                                   const teamS = teamStats.find(s => s.teamId === tid);
                                   const isFirst = idx === 0;
                                   const isLast = idx === ((activeSession.config as FreePlayConfig).initialQueue?.length || 0) - 1;

                                   return (
                                     <div key={idx} className={`flex justify-between items-center px-3 py-2 bg-base-100/50 rounded-lg text-[10px] border transition-all group ${isFirst ? 'border-accent/30 bg-accent/5' : 'border-transparent hover:border-base-300'}`}>
                                        <div className="flex items-center gap-3">
                                           <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold transition-colors ${isFirst ? 'bg-accent text-black font-black' : 'bg-base-300 text-accent group-hover:bg-accent/20'}`}>
                                              {idx + 1}
                                           </div>
                                           <div>
                                              <span className="text-[10px] font-bold uppercase text-base-content leading-none block">{team?.name}</span>
                                              <span className="text-[7px] uppercase text-text-muted">{(teamS?.wins || 0)}V - {(teamS?.losses || 0)}D</span>
                                           </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                           {!isFirst && (
                                             <button 
                                               onClick={() => moveTeamInQueue(idx, 'up')}
                                               className="btn btn-ghost btn-xs btn-circle text-text-muted hover:text-accent"
                                             >
                                               <ChevronUp className="w-3.5 h-3.5" />
                                             </button>
                                           )}
                                           {!isLast && (
                                             <button 
                                               onClick={() => moveTeamInQueue(idx, 'down')}
                                               className="btn btn-ghost btn-xs btn-circle text-text-muted hover:text-accent"
                                             >
                                               <ChevronDown className="w-3.5 h-3.5" />
                                             </button>
                                           )}
                                           <div className="divider divider-horizontal mx-0.5" />
                                           <button 
                                             onClick={() => removeTeamFromQueue(tid)}
                                             title="Remover da fila"
                                             className="btn btn-ghost btn-xs btn-circle text-error hover:bg-error/15"
                                           >
                                             <Trash2 className="w-3.5 h-3.5" />
                                           </button>
                                        </div>
                                     </div>
                                   );
                                 })}
                                 {(activeSession.type !== 'free_play' || !(activeSession.config as FreePlayConfig).initialQueue || (activeSession.config as FreePlayConfig).initialQueue.length === 0) && (
                                   <div className="text-center py-6 border border-dashed border-base-300 rounded-xl">
                                      <p className="text-[9px] italic text-text-muted uppercase">Nenhum time na reserva</p>
                                   </div>
                                  )}
                              </div>
                           </div>
                        </div>
                     </>
                   )}
                </div>
             </div>
          </div>
       </div>
    </div>
  );
};
