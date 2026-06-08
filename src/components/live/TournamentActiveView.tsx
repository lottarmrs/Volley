import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Trophy, Share2, Copy, RotateCcw, Activity,
  CheckCircle2, Clock, Zap, Pause, Play, Flag, XCircle, MoreVertical
} from 'lucide-react';
import { Session, Game, PointEvent, Team, Player, GameReport, TournamentConfig } from '../../types';
import { TournamentStanding, TournamentMVP, getTournamentProgress, groupGamesByRound, calculateTournamentMVP, getHighestScoreMatch, getMostBalancedMatch, getLongestWinStreak, getTeamDisplayName, calculateTournamentStandings } from '../../logic/tournament';
import {
  formatTournamentFinalForWhatsApp,
  formatTournamentScorersForWhatsApp,
  formatTournamentStandingsForWhatsApp,
  openWhatsAppShare,
  copyToClipboard
} from '../../logic/exporters';
import { TeamScoreCard } from './TeamScoreCard';
import { TournamentBracket } from '../tournament/TournamentBracket';
import { PointModal } from './PointModal';
import { POINT_REASON_LABELS, getPointLabel } from '../../logic/match';
import { PointReason } from '../../types';

interface Props {
  activeSession: Session;
  sessionGames: Game[];
  sessionPoints: PointEvent[];
  currentGame: Game | undefined;
  standings: TournamentStanding[];
  sessionTeams: Team[];
  players: Player[];
  scoringRanking: { playerId: string; points: number }[];
  pointModalTeamId: string | null;
  setPointModalTeamId: (id: string | null) => void;
  registerPoint: (teamId: string, playerId?: string, reason?: PointReason) => void;
  finishCurrentGameManually: () => void;
  startNextGame: (update: (s: Session) => void) => void;
  undoLastPoint: () => void;
  registerWalkover: (gameId: string, winnerTeamId: string) => void;
  pauseGame: (gameId: string, paused: boolean) => void;
  reopenGame: (gameId: string) => void;
  cancelGame: (gameId: string) => void;
  updateFinalScore: (gameId: string, scoreA: number, scoreB: number) => void;
  reorderScheduledGame: (gameId: string, direction: 'up' | 'down') => void;
  onFinishSession: () => void;
  onExit: () => void;
  setActiveSession: (s: Session) => void;
  shareGameToWhatsApp: (id: string) => void;
  copyGameToClipboard: (id: string) => Promise<boolean>;
  games: Game[];
}

const TEAM_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

export const TournamentActiveView = ({
  activeSession,
  sessionGames,
  sessionPoints,
  currentGame,
  standings,
  sessionTeams,
  players,
  scoringRanking,
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
  onFinishSession,
  onExit,
  setActiveSession,
  shareGameToWhatsApp,
  copyGameToClipboard,
  games,
}: Props) => {
  const progress = getTournamentProgress(games, activeSession.id);
  const gamesByRound = groupGamesByRound(sessionGames);
  const isPaused = activeSession.status === 'paused';
  const currentRound = currentGame?.round || sessionGames.find(g => g.status === 'scheduled')?.round || 1;
  const mvp = calculateTournamentMVP(sessionPoints, sessionTeams, players, standings);

  const format = activeSession.config?.type === 'tournament' ? activeSession.config.format : 'round_robin';
  const classPoints = (activeSession.config as any)?.classificationPoints || { win: 3, loss: 0 };
  const groups = (activeSession.config as any)?.groups || [];

  const groupA = groups.find((g: any) => g.id === 'A');
  const groupB = groups.find((g: any) => g.id === 'B');

  const standingsA = React.useMemo(() => groupA 
    ? calculateTournamentStandings(sessionGames.filter(g => g.groupId === 'A'), groupA.teamIds, classPoints)
    : [], [sessionGames, groupA, classPoints]);

  const standingsB = React.useMemo(() => groupB 
    ? calculateTournamentStandings(sessionGames.filter(g => g.groupId === 'B'), groupB.teamIds, classPoints)
    : [], [sessionGames, groupB, classPoints]);

  const teamA = currentGame ? sessionTeams.find(t => t.id === currentGame.teamAId) : null;
  const teamB = currentGame ? sessionTeams.find(t => t.id === currentGame.teamBId) : null;

  const getRank = (teamId: string) => standings.findIndex(s => s.teamId === teamId) + 1;
  const getTeamColor = (teamId: string) => {
    const idx = sessionTeams.findIndex(t => t.id === teamId);
    return TEAM_COLORS[idx % TEAM_COLORS.length];
  };

  const finalShareText = () => formatTournamentFinalForWhatsApp({
    sessionName: activeSession.name,
    standings,
    teams: sessionTeams,
    players,
    scoringRanking,
    mvp
  });
  const standingsShareText = () => formatTournamentStandingsForWhatsApp({
    sessionName: activeSession.name,
    standings,
    teams: sessionTeams,
  });
  const scorersShareText = () => formatTournamentScorersForWhatsApp({
    sessionName: activeSession.name,
    players,
    scoringRanking,
  });

  const setTournamentPaused = (paused: boolean) => {
    setActiveSession({
      ...activeSession,
      status: paused ? 'paused' : 'active',
      updatedAt: new Date().toISOString()
    });
  };

  const editTournamentInfo = () => {
    const name = prompt('Nome do torneio', activeSession.name);
    if (name === null) return;
    const location = prompt('Local', activeSession.location || '');
    if (location === null) return;
    const notes = prompt('Observacoes', activeSession.notes || '');
    if (notes === null) return;
    setActiveSession({
      ...activeSession,
      name: name.trim() || activeSession.name,
      location: location.trim() || null,
      notes: notes.trim() || null,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="navbar bg-base-200 border border-base-300 rounded-xl sticky top-0 z-20 justify-between px-4">
        <div className="flex items-center gap-4">
          <button 
            type="button"
            onClick={onExit}
            className="btn btn-error btn-outline btn-xs uppercase font-bold"
          >
            Sair
          </button>
          <div>
            <h2 className="text-lg font-bold uppercase tracking-tight text-base-content line-clamp-1">
              {activeSession.name}
            </h2>
            <div className="flex items-center gap-3">
              <span className="badge badge-accent badge-soft badge-xs flex items-center gap-1 font-bold uppercase tracking-wider">
                <Trophy className="w-2.5 h-2.5" /> Torneio
              </span>
              <span className="text-[10px] font-mono text-base-content/60 uppercase">
                {progress.finished}/{progress.total} jogos
              </span>
            </div>
          </div>
        </div>
        {progress.isComplete ? (
          <button
            type="button"
            onClick={onFinishSession}
            className="btn btn-accent btn-sm font-bold uppercase"
          >
            Encerrar
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={editTournamentInfo}
              className="btn btn-outline btn-xs sm:btn-sm font-bold uppercase"
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => setTournamentPaused(!isPaused)}
              className={`btn btn-xs sm:btn-sm font-bold uppercase ${isPaused ? 'btn-success btn-soft' : 'btn-outline'}`}
            >
              {isPaused ? <Play className="w-3.5 h-3.5 inline mr-1" /> : <Pause className="w-3.5 h-3.5 inline mr-1" />}
              {isPaused ? 'Retomar' : 'Pausar'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Deseja realmente encerrar o torneio antes de jogar todas as partidas? Os relatórios finais serão calculados com base nos jogos concluídos até o momento.')) {
                  onFinishSession();
                }
              }}
              className="btn btn-accent btn-xs sm:btn-sm font-bold uppercase"
            >
              Encerrar
            </button>
          </div>
        )}
      </div>

      {isPaused && (
        <div role="alert" className="alert alert-warning alert-soft text-center justify-center font-bold uppercase tracking-[0.1em] text-xs">
          Torneio pausado
        </div>
      )}

      {/* Stats indicators */}
      <div className="stats stats-vertical sm:stats-horizontal shadow bg-base-200 border border-base-300 w-full">
        <div className="stat">
          <div className="stat-title text-[10px] font-bold uppercase text-base-content/60">Status</div>
          <div className="stat-value text-base font-bold uppercase text-base-content">{isPaused ? 'Pausado' : 'Em andamento'}</div>
        </div>
        <div className="stat">
          <div className="stat-title text-[10px] font-bold uppercase text-base-content/60">Formato</div>
          <div className="stat-value text-base font-bold uppercase text-base-content">
            {format === 'round_robin' ? 'Todos contra todos' :
             format === 'double_round_robin' ? 'Turno e Returno' :
             format === 'knockout' ? 'Mata-mata' :
             format === 'group_stage' ? 'Fase de Grupos' :
             format === 'groups_knockout' ? 'Grupos + Mata-mata' : 'Torneio'}
          </div>
        </div>
        <div className="stat">
          <div className="stat-title text-[10px] font-bold uppercase text-base-content/60">Rodada atual</div>
          <div className="stat-value text-base font-bold uppercase text-base-content">{currentRound}</div>
        </div>
        <div className="stat">
          <div className="stat-title text-[10px] font-bold uppercase text-base-content/60">Regra</div>
          <div className="stat-value text-base font-bold uppercase text-base-content">
            Até {activeSession.config?.maxPoints} - {activeSession.config?.tieBreakMethod === 'direct_3' ? '3 direto' : 'Vai a 2'}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <progress className="progress progress-primary w-full" value={progress.finished} max={progress.total} />

      <div className="flex flex-wrap gap-2 justify-end">
        <button
          onClick={() => openWhatsAppShare(standingsShareText())}
          className="btn btn-xs bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20 hover:bg-[#25D366]/20 font-bold uppercase"
        >
          Compartilhar classificação
        </button>
        <button
          onClick={() => openWhatsAppShare(scorersShareText())}
          className="btn btn-xs bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20 hover:bg-[#25D366]/20 font-bold uppercase"
        >
          Compartilhar artilharia
        </button>
      </div>

      {/* Current game or final screen */}
      {progress.isComplete ? (
        <div className="space-y-4">
          <FinalStandings
            standings={standings}
            sessionTeams={sessionTeams}
            scoringRanking={scoringRanking}
            players={players}
            mvp={mvp}
            sessionGames={sessionGames}
            sessionPoints={sessionPoints}
          />
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => openWhatsAppShare(finalShareText())}
              className="btn bg-[#25D366]/20 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/30 font-bold uppercase flex items-center gap-2"
            >
              <Share2 className="w-3.5 h-3.5" /> Compartilhar Final
            </button>
            <button
              onClick={async () => { const ok = await copyToClipboard(finalShareText()); if (ok) alert('Resumo copiado!'); }}
              className="btn btn-outline font-bold uppercase flex items-center gap-2"
            >
              <Copy className="w-3.5 h-3.5" /> Copiar Resumo
            </button>
          </div>
        </div>
      ) : currentGame ? (
        <>
          {/* Score cards */}
          {(currentGame.status === 'active' || currentGame.status === 'paused') && teamA && teamB ? (
            <div className="grid grid-cols-2 gap-4">
              <TeamScoreCard
                team={teamA}
                players={players}
                score={currentGame.scoreA}
                isWinner={currentGame.winnerTeamId === teamA.id}
                isGameActive={currentGame.status === 'active' && !isPaused}
                onCourtStreak={0}
                color={getTeamColor(teamA.id)}
                scoringRanking={scoringRanking}
                onRegisterPoint={() => registerPoint(teamA.id)}
                onOpenDetailModal={() => setPointModalTeamId(teamA.id)}
              />
              <TeamScoreCard
                team={teamB}
                players={players}
                score={currentGame.scoreB}
                isWinner={currentGame.winnerTeamId === teamB.id}
                isGameActive={currentGame.status === 'active' && !isPaused}
                onCourtStreak={0}
                color={getTeamColor(teamB.id)}
                scoringRanking={scoringRanking}
                onRegisterPoint={() => registerPoint(teamB.id)}
                onOpenDetailModal={() => setPointModalTeamId(teamB.id)}
              />
            </div>
          ) : currentGame.status === 'finished' || currentGame.status === 'walkover' ? (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="card card-border bg-base-200 flex flex-col items-center gap-4 p-6 rounded-2xl"
            >
              <p className="text-sm font-bold text-accent uppercase tracking-[0.2em] animate-pulse">
                {currentGame.status === 'walkover' ? 'Jogo encerrado por W.O.' : 'Jogo Encerrado'}
              </p>
              <p className="text-2xl font-bold font-mono text-base-content">
                {currentGame.scoreA} <span className="text-base-content/55">×</span> {currentGame.scoreB}
              </p>
              <p className="text-[10px] font-bold text-base-content/60 uppercase">
                Vitória: {sessionTeams.find(t => t.id === currentGame.winnerTeamId)?.name}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => shareGameToWhatsApp(currentGame.id)}
                  className="btn btn-xs bg-[#25D366]/20 text-[#25D366] border-[#25D366]/30 hover:bg-[#25D366]/30 font-bold uppercase flex items-center gap-2"
                >
                  <Share2 className="w-3.5 h-3.5" /> WhatsApp
                </button>
                <button
                  onClick={async () => { const ok = await copyGameToClipboard(currentGame.id); if (ok) alert('Copiado!'); }}
                  className="btn btn-xs btn-outline font-bold uppercase flex items-center gap-2"
                >
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </button>
              </div>
              {progress.remaining > 0 ? (
                <button
                  onClick={() => startNextGame(setActiveSession)}
                  className="btn btn-accent w-full max-w-xs font-bold uppercase tracking-widest shadow-xl shadow-accent/20"
                >
                  Próxima Partida ({progress.remaining} restante{progress.remaining > 1 ? 's' : ''})
                </button>
              ) : (
                <button
                  onClick={onFinishSession}
                  className="btn btn-primary w-full max-w-xs font-bold uppercase tracking-widest shadow-xl shadow-primary/20"
                >
                  Encerrar Torneio
                </button>
              )}
            </motion.div>
          ) : null}

          {/* Undo button */}
          {currentGame.status === 'active' && (
            <div className="flex flex-wrap justify-center gap-3">
              <button
                onClick={undoLastPoint}
                className="btn btn-outline btn-sm uppercase tracking-wider flex items-center gap-2 rounded-full group"
              >
                <RotateCcw className="w-3 h-3 group-hover:-rotate-45 transition-transform" /> Desfazer Ponto
              </button>
              <button
                onClick={() => {
                  if (!currentGame || currentGame.scoreA === currentGame.scoreB) return;
                  const winner = sessionTeams.find(t => t.id === (currentGame.scoreA > currentGame.scoreB ? currentGame.teamAId : currentGame.teamBId))?.name;
                  if (confirm(`Confirmar placar final?\n\n${teamA?.name} ${currentGame.scoreA} x ${currentGame.scoreB} ${teamB?.name}\n\nVencedor: ${winner}`)) {
                    finishCurrentGameManually();
                  }
                }}
                disabled={!currentGame || currentGame.scoreA === currentGame.scoreB}
                className="btn btn-ghost btn-sm uppercase tracking-wider flex items-center gap-2 rounded-full disabled:opacity-30"
              >
                <Flag className="w-3 h-3" /> Finalizar Manualmente
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="card card-border border-dashed bg-base-200 p-8 rounded-2xl text-center space-y-4">
          <Clock className="w-10 h-10 text-accent mx-auto" />
          <div>
            <p className="text-sm font-bold uppercase tracking-widest text-base-content">Tabela pronta</p>
            <p className="text-[10px] text-base-content/60 uppercase mt-1">Inicie a primeira partida do torneio.</p>
          </div>
          <button
            onClick={() => startNextGame(setActiveSession)}
            className="btn btn-primary px-8 uppercase tracking-widest"
          >
            Iniciar Torneio
          </button>
        </div>
      )}

      {/* Point Modal */}
      <AnimatePresence>
        {pointModalTeamId && sessionTeams.some(t => t.id === pointModalTeamId) && (
          <PointModal
            team={sessionTeams.find(t => t.id === pointModalTeamId)!}
            players={players}
            onClose={() => setPointModalTeamId(null)}
            onConfirm={(playerId, reason) => { registerPoint(pointModalTeamId, playerId, reason); setPointModalTeamId(null); }}
          />
        )}
      </AnimatePresence>

      {/* Bracket Stage Visualization */}
      {(format === 'knockout' || format === 'groups_knockout') && (
        <div className="mb-6">
          <TournamentBracket games={sessionGames} teams={sessionTeams} />
        </div>
      )}

      {/* Two-column bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Standings Table */}
        {format === 'groups_knockout' || format === 'group_stage' ? (
          <div className="lg:col-span-2 space-y-6">
             {/* Grupo A Standings */}
             <div className="card card-border bg-base-200 rounded-2xl overflow-hidden">
                <div className="p-4 bg-base-300/50 border-b border-base-300 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                      <Trophy className="w-3.5 h-3.5 text-accent" />
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-accent">Classificação - Grupo A</h4>
                   </div>
                </div>
                <div className="overflow-x-auto">
                   <table className="table table-zebra table-sm text-[10px] font-mono">
                     <thead>
                       <tr>
                         {['#', 'Time', 'J', 'V', 'D', 'PF', 'PC', 'SD', '%', 'Pts'].map(h => (
                           <th key={h} className="text-left text-[8px] uppercase text-base-content/60 font-bold">{h}</th>
                         ))}
                       </tr>
                     </thead>
                     <tbody>
                       {standingsA.map((s, i) => {
                          const team = sessionTeams.find(t => t.id === s.teamId);
                          const color = getTeamColor(s.teamId);
                          return (
                            <tr key={s.teamId}>
                              <td>
                                <span className={`font-bold ${i === 0 ? 'text-accent' : 'text-base-content/60'}`}>{i + 1}</span>
                              </td>
                              <td>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                                  <div>
                                    <span className="font-bold text-base-content uppercase truncate max-w-[100px] block">{team?.name}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="text-base-content/60">{s.gamesPlayed}</td>
                              <td className="text-green-400 font-bold">{s.wins}</td>
                              <td className="text-red-400">{s.losses}</td>
                              <td className="text-base-content">{s.pointsFor}</td>
                              <td className="text-base-content/60">{s.pointsAgainst}</td>
                              <td className={`font-bold ${s.pointDifference > 0 ? 'text-green-400' : s.pointDifference < 0 ? 'text-red-400' : 'text-base-content/60'}`}>
                                {s.pointDifference > 0 ? '+' : ''}{s.pointDifference}
                              </td>
                              <td className="text-base-content/60">{s.winRate}%</td>
                              <td className="text-accent font-bold text-sm">{s.classificationPoints}</td>
                            </tr>
                          );
                       })}
                     </tbody>
                   </table>
                </div>
             </div>

             {/* Grupo B Standings */}
             <div className="card card-border bg-base-200 rounded-2xl overflow-hidden">
                <div className="p-4 bg-base-300/50 border-b border-base-300 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                      <Trophy className="w-3.5 h-3.5 text-accent" />
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-accent">Classificação - Grupo B</h4>
                   </div>
                </div>
                <div className="overflow-x-auto">
                   <table className="table table-zebra table-sm text-[10px] font-mono">
                     <thead>
                       <tr>
                         {['#', 'Time', 'J', 'V', 'D', 'PF', 'PC', 'SD', '%', 'Pts'].map(h => (
                           <th key={h} className="text-left text-[8px] uppercase text-base-content/60 font-bold">{h}</th>
                         ))}
                       </tr>
                     </thead>
                     <tbody>
                       {standingsB.map((s, i) => {
                          const team = sessionTeams.find(t => t.id === s.teamId);
                          const color = getTeamColor(s.teamId);
                          return (
                            <tr key={s.teamId}>
                              <td>
                                <span className={`font-bold ${i === 0 ? 'text-accent' : 'text-base-content/60'}`}>{i + 1}</span>
                              </td>
                              <td>
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                                  <div>
                                    <span className="font-bold text-base-content uppercase truncate max-w-[100px] block">{team?.name}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="text-base-content/60">{s.gamesPlayed}</td>
                              <td className="text-green-400 font-bold">{s.wins}</td>
                              <td className="text-red-400">{s.losses}</td>
                              <td className="text-base-content">{s.pointsFor}</td>
                              <td className="text-base-content/60">{s.pointsAgainst}</td>
                              <td className={`font-bold ${s.pointDifference > 0 ? 'text-green-400' : s.pointDifference < 0 ? 'text-red-400' : 'text-base-content/60'}`}>
                                {s.pointDifference > 0 ? '+' : ''}{s.pointDifference}
                              </td>
                              <td className="text-base-content/60">{s.winRate}%</td>
                              <td className="text-accent font-bold text-sm">{s.classificationPoints}</td>
                            </tr>
                          );
                       })}
                     </tbody>
                   </table>
                </div>
             </div>
          </div>
        ) : (
          <div className="lg:col-span-2 card card-border bg-base-200 rounded-2xl overflow-hidden">
            <div className="p-4 bg-base-300/50 border-b border-base-300 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5 text-accent" />
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-accent">Classificação</h4>
              </div>
              <span className="text-[10px] font-mono text-accent/60">{progress.finished}/{progress.total} jogos</span>
            </div>
            <p className="px-4 pt-3 text-[9px] font-bold uppercase text-base-content/60">
              Critérios: pontos, vitórias, saldo, pontos pró, confronto direto e pontos contra.
            </p>
            <div className="overflow-x-auto">
              <table className="table table-zebra table-sm text-[10px] font-mono">
                <thead>
                  <tr>
                    {['#', 'Time', 'J', 'V', 'D', 'PF', 'PC', 'SD', '%', 'Pts'].map(h => (
                      <th key={h} className="text-left text-[8px] uppercase text-base-content/60 font-bold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, i) => {
                    const team = sessionTeams.find(t => t.id === s.teamId);
                    const color = getTeamColor(s.teamId);
                    return (
                      <tr key={s.teamId}>
                        <td>
                          <span className={`font-bold ${i === 0 ? 'text-accent' : 'text-base-content/60'}`}>{i + 1}</span>
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                            <div>
                              <span className="font-bold text-base-content uppercase truncate max-w-[100px] block">{team?.name}</span>
                              {s.tieBreakerReason && (
                                <span className="text-[7px] text-base-content/60 uppercase">por {s.tieBreakerReason}</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="text-base-content/60">{s.gamesPlayed}</td>
                        <td className="text-green-400 font-bold">{s.wins}</td>
                        <td className="text-red-400">{s.losses}</td>
                        <td className="text-base-content">{s.pointsFor}</td>
                        <td className="text-base-content/60">{s.pointsAgainst}</td>
                        <td className={`font-bold ${s.pointDifference > 0 ? 'text-green-400' : s.pointDifference < 0 ? 'text-red-400' : 'text-base-content/60'}`}>
                          {s.pointDifference > 0 ? '+' : ''}{s.pointDifference}
                        </td>
                        <td className="text-base-content/60">{s.winRate}%</td>
                        <td className="text-accent font-bold text-sm">{s.classificationPoints}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Right: Schedule + Scorers */}
        <div className="space-y-6">
          {/* All matches */}
          <div className="card card-border bg-base-200 rounded-2xl overflow-hidden">
            <div className="p-4 bg-base-300/50 border-b border-base-300 flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-base-content/60" />
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-base-content/60">Tabela de Jogos</h4>
            </div>
            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
              {Object.entries(gamesByRound).map(([round, roundGames]) => (
                <div key={round} className="space-y-1">
                  <p className="px-2 pt-2 pb-1 text-[8px] font-bold uppercase tracking-widest text-accent/70">Rodada {round}</p>
                  {roundGames.map(g => {
                    const isActive = g.status === 'active' || g.status === 'paused';
                    const isDone   = g.status === 'finished' || g.status === 'walkover';
                    const isCancelled = g.status === 'cancelled';
                    return (
                      <div
                        key={g.id}
                        className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${isActive ? 'bg-primary/15 border border-primary/30' : isCancelled ? 'opacity-50 bg-red-950/15' : 'hover:bg-base-300/50'}`}
                      >
                        <div className="flex flex-col items-start shrink-0 min-w-[50px]">
                          <span className="text-[8px] font-mono text-base-content/60">#{g.sequenceNumber}</span>
                          {g.stage && g.stage !== 'group' && (
                            <span className="text-[6px] font-bold uppercase text-accent leading-none mt-0.5">
                              {g.stage === 'semifinal' ? 'Semi' : g.stage === 'third_place' ? '3º Lugar' : 'Final'}
                            </span>
                          )}
                          {g.groupId && (
                            <span className="text-[6px] font-bold uppercase text-base-content/40 leading-none mt-0.5">
                              Grupo {g.groupId}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 flex items-center gap-1 justify-center">
                          <span className={`text-[9px] font-bold uppercase truncate max-w-[55px] ${g.winnerTeamId === g.teamAId ? 'text-base-content' : 'text-base-content/60'}`}>{getTeamDisplayName(g.teamAId, sessionTeams)}</span>
                          {isDone ? (
                            <span className="text-[9px] font-bold font-mono text-accent mx-1">{g.scoreA}×{g.scoreB}</span>
                          ) : (
                            <span className="text-[8px] text-base-content/40 mx-1">vs</span>
                          )}
                          <span className={`text-[9px] font-bold uppercase truncate max-w-[55px] ${g.winnerTeamId === g.teamBId ? 'text-base-content' : 'text-base-content/60'}`}>{getTeamDisplayName(g.teamBId, sessionTeams)}</span>
                        </div>
                        <div className="shrink-0">
                          {isActive  && <span className="w-2 h-2 rounded-full bg-primary animate-pulse inline-block" />}
                          {isDone    && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                          {g.status === 'scheduled' && <Clock className="w-3.5 h-3.5 text-base-content/30" />}
                          {isCancelled && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                        </div>
                        <GameActions
                          game={g}
                          teamAName={getTeamDisplayName(g.teamAId, sessionTeams)}
                          teamBName={getTeamDisplayName(g.teamBId, sessionTeams)}
                          onStart={() => startNextGame(setActiveSession)}
                          onShare={() => shareGameToWhatsApp(g.id)}
                          onCopy={async () => { const ok = await copyGameToClipboard(g.id); if (ok) alert('Copiado!'); }}
                          onWalkoverA={() => registerWalkover(g.id, g.teamAId)}
                          onWalkoverB={() => registerWalkover(g.id, g.teamBId)}
                          onCancel={() => cancelGame(g.id)}
                          onReopen={() => reopenGame(g.id)}
                          onPause={() => pauseGame(g.id, g.status === 'active')}
                          onEditScore={(scoreA, scoreB) => updateFinalScore(g.id, scoreA, scoreB)}
                          onMoveUp={() => reorderScheduledGame(g.id, 'up')}
                          onMoveDown={() => reorderScheduledGame(g.id, 'down')}
                        />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Top scorers */}
          <div className="card card-border bg-base-200 rounded-2xl overflow-hidden">
            <div className="p-4 bg-base-300/50 border-b border-base-300 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-accent" />
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-base-content/60">Artilheiros</h4>
            </div>
            <div className="p-2 space-y-1">
              {scoringRanking.slice(0, 5).map((rank, i) => {
                const p = players.find(pl => pl.id === rank.playerId);
                return (
                  <div key={rank.playerId} className="flex items-center justify-between p-2 rounded hover:bg-base-300/50 transition-colors gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold w-4 ${i === 0 ? 'text-accent' : 'text-base-content/60'}`}>{i + 1}º</span>
                      <span className="text-[10px] font-bold uppercase text-base-content">{p?.apelido || p?.nome || '—'}</span>
                    </div>
                    <span className="font-mono font-bold text-base-content text-sm">{rank.points}</span>
                  </div>
                );
              })}
              {scoringRanking.length === 0 && (
                <p className="text-center py-6 text-[9px] text-base-content/60 italic uppercase opacity-40">Sem pontuação individual ainda.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {mvp && (
        <div className="card card-border bg-base-200 p-5 rounded-2xl border-accent/20">
          <h4 className="text-[10px] font-bold uppercase text-accent mb-3 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5" /> MVP parcial
          </h4>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-bold uppercase text-base-content">{mvp.playerName}</p>
              <p className="text-[10px] text-base-content/60 uppercase">
                {mvp.teamName || 'Time'} | destaque: {mvp.topReason} | vitórias do time: {mvp.teamWinRate}%
              </p>
            </div>
            <p className="font-mono text-xl font-bold text-accent">{mvp.totalPoints} pts</p>
          </div>
        </div>
      )}

      {/* Point log */}
      <div className="card card-border bg-base-200 rounded-2xl overflow-hidden">
        <div className="p-4 bg-base-300/50 border-b border-base-300 flex items-center justify-between">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-base-content/60">Sessões do Confronto</h4>
          <span className="badge badge-accent badge-soft font-bold uppercase text-[9px]">Tempo Real</span>
        </div>
        <div className="max-h-48 overflow-y-auto p-2 space-y-1">
          {sessionPoints.slice().reverse().map(p => {
            const label = getPointLabel(p, sessionTeams, players);
            return (
              <div key={p.id} className="flex items-center justify-between p-2 rounded hover:bg-base-300/50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-accent opacity-50 w-12 shrink-0">
                    J{games.find(g => g.id === p.gameId)?.sequenceNumber}•#{p.sequenceNumber}
                  </span>
                  <div>
                    <p className="text-[10px] font-bold text-base-content uppercase">{label.playerName}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-bold text-base-content/60 uppercase">{label.teamName}</span>
                      <span className="text-[8px] text-accent italic">• {label.reason}</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] font-bold font-mono text-accent">{label.score}</p>
              </div>
            );
          })}
          {sessionPoints.length === 0 && (
            <div className="text-center py-10 text-[9px] text-base-content/60 italic uppercase opacity-30">Nenhum evento registrado.</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Final standings after all games ─────────────────────────────────────────

function GameActions({
  game,
  teamAName,
  teamBName,
  onStart,
  onShare,
  onCopy,
  onWalkoverA,
  onWalkoverB,
  onCancel,
  onReopen,
  onPause,
  onEditScore,
  onMoveUp,
  onMoveDown,
}: {
  game: Game;
  teamAName: string;
  teamBName: string;
  onStart: () => void;
  onShare: () => void;
  onCopy: () => void;
  onWalkoverA: () => void;
  onWalkoverB: () => void;
  onCancel: () => void;
  onReopen: () => void;
  onPause: () => void;
  onEditScore: (scoreA: number, scoreB: number) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const canEdit = game.status === 'finished' || game.status === 'walkover';
  const canForceResult = ['scheduled', 'active', 'paused'].includes(game.status);

  const editScore = () => {
    const raw = prompt(`Corrigir placar final\n\n${teamAName} x ${teamBName}`, `${game.scoreA}x${game.scoreB}`);
    if (!raw) return;
    const [a, b] = raw.split(/[xX:-]/).map(v => Number(v.trim()));
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) {
      alert('Informe um placar valido e sem empate. Ex: 15x12');
      return;
    }
    onEditScore(a, b);
  };

  const isPlaceholder = (id: string) => id.startsWith('winner:') || id.startsWith('loser:') || id.startsWith('group:');
  const isBlocked = isPlaceholder(game.teamAId) || isPlaceholder(game.teamBId);

  return (
    <div className="flex items-center gap-1 flex-wrap justify-end">
      <MoreVertical className="w-3 h-3 text-base-content/40 hidden sm:block" />
      {game.status === 'scheduled' && (
        <>
          {!isBlocked ? (
            <button onClick={onStart} className="btn btn-xs btn-primary font-bold uppercase">Iniciar</button>
          ) : (
            <span className="btn btn-xs btn-disabled font-bold uppercase cursor-not-allowed" title="Aguardando confrontos anteriores">Bloqueado</span>
          )}
          <button onClick={onMoveUp} className="btn btn-xs btn-outline font-bold">↑</button>
          <button onClick={onMoveDown} className="btn btn-xs btn-outline font-bold">↓</button>
          <button onClick={onShare} className="btn btn-xs bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20 hover:bg-[#25D366]/20 font-bold uppercase">Zap</button>
          <button onClick={onCopy} className="btn btn-xs btn-outline font-bold uppercase">Copiar</button>
        </>
      )}
      {(game.status === 'active' || game.status === 'paused') && (
        <button onClick={onPause} className="btn btn-xs btn-outline font-bold uppercase">
          {game.status === 'paused' ? 'Retomar' : 'Pausar'}
        </button>
      )}
      {canForceResult && (
        <>
          <button onClick={() => { if (confirm(`Registrar W.O. a favor de ${teamAName}?`)) onWalkoverA(); }} className="btn btn-xs btn-warning btn-soft font-bold uppercase">W.O. A</button>
          <button onClick={() => { if (confirm(`Registrar W.O. a favor de ${teamBName}?`)) onWalkoverB(); }} className="btn btn-xs btn-warning btn-soft font-bold uppercase">W.O. B</button>
        </>
      )}
      {canEdit && (
        <>
          <button onClick={editScore} className="btn btn-xs btn-outline font-bold uppercase">Editar</button>
          <button onClick={() => { if (confirm('Reabrir este jogo?')) onReopen(); }} className="btn btn-xs btn-blue-500/10 text-blue-400 font-bold uppercase">Reabrir</button>
        </>
      )}
      {game.status !== 'cancelled' && (
        <button onClick={() => { if (confirm('Cancelar este jogo?')) onCancel(); }} className="btn btn-xs btn-error btn-soft font-bold uppercase">Cancelar</button>
      )}
      {(game.status === 'finished' || game.status === 'walkover') && (
        <>
          <button onClick={onShare} className="btn btn-xs bg-[#25D366]/10 text-[#25D366] border-[#25D366]/20 hover:bg-[#25D366]/20 font-bold uppercase">Zap</button>
          <button onClick={onCopy} className="btn btn-xs btn-outline font-bold uppercase">Copiar</button>
        </>
      )}
    </div>
  );
}

function FinalStandings({
  standings,
  sessionTeams,
  scoringRanking,
  players,
  mvp,
  sessionGames,
  sessionPoints,
}: {
  standings: TournamentStanding[];
  sessionTeams: Team[];
  scoringRanking: { playerId: string; points: number }[];
  players: Player[];
  mvp: TournamentMVP | null;
  sessionGames: Game[];
  sessionPoints: PointEvent[];
}) {
  const MEDAL = ['🥇', '🥈', '🥉'];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="card card-border bg-base-200 border-accent/30 p-8 rounded-2xl text-center">
        <Trophy className="w-16 h-16 text-accent mx-auto mb-4" />
        <h3 className="text-2xl font-bold uppercase tracking-[0.3em] text-accent">Torneio Concluído!</h3>
        <p className="text-[10px] text-base-content/60 uppercase font-bold mt-2">Classificação final</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {standings.slice(0, 3).map((s, i) => {
          const team = sessionTeams.find(t => t.id === s.teamId);
          return (
            <div key={s.teamId} className={`card card-border bg-base-200 p-6 rounded-xl text-center flex flex-col justify-between ${i === 0 ? 'border-accent bg-accent/5' : ''}`}>
              <div>
                <div className="text-3xl mb-2">{MEDAL[i] || `${i + 1}º`}</div>
                <h4 className="font-bold uppercase text-base-content truncate">{team?.name}</h4>
              </div>
              <div className="flex flex-col gap-1 mt-4">
                <div className="flex justify-center gap-4 text-[9px] font-mono">
                  <span className="text-green-400 font-bold">{s.wins}V</span>
                  <span className="text-red-400 font-bold">{s.losses}D</span>
                  <span className="text-base-content font-bold">SD {s.pointDifference > 0 ? '+' : ''}{s.pointDifference}</span>
                </div>
                <span className="text-accent font-bold font-mono text-sm">{s.classificationPoints} pts</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* MVP Card */}
        {mvp && (
          <div className="card card-border bg-base-200 p-6 rounded-xl flex flex-col justify-between">
            <h4 className="text-[10px] font-bold uppercase text-accent mb-4 flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" /> MVP do Torneio
            </h4>
            <div className="flex items-center gap-4 p-4 bg-accent/10 rounded-xl border border-accent/20 flex-1">
              <div className="text-3xl">⚡</div>
              <div>
                <p className="font-bold text-lg uppercase text-base-content leading-none mb-1">{mvp.playerName}</p>
                <p className="text-[9px] text-base-content/60 uppercase">
                  {mvp.teamName || 'Sem Time'}
                </p>
                <p className="text-[9px] text-base-content/60 uppercase mt-1 leading-relaxed">
                  Destaque: {mvp.topReason} <br />
                  Vitórias do time: {mvp.teamWinRate}%
                </p>
                <p className="text-xs font-bold text-accent mt-2">{mvp.totalPoints} Pontos Marcados</p>
              </div>
            </div>
          </div>
        )}

        {/* Artilheiro Card */}
        {scoringRanking.length > 0 && (() => {
          const topScorer = players.find(p => p.id === scoringRanking[0].playerId);
          const topScorerTeam = sessionTeams.find(t => t.playerIds.includes(scoringRanking[0].playerId));
          return topScorer ? (
            <div className="card card-border bg-base-200 p-6 rounded-xl flex flex-col justify-between">
              <h4 className="text-[10px] font-bold uppercase text-primary mb-4 flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5 text-primary" /> Artilheiro
              </h4>
              <div className="flex items-center gap-4 p-4 bg-primary/10 rounded-xl border border-primary/20 flex-1">
                <div className="text-3xl">🎯</div>
                <div>
                  <p className="font-bold text-lg uppercase text-base-content leading-none mb-1">{topScorer.apelido || topScorer.nome}</p>
                  <p className="text-[9px] text-base-content/60 uppercase">{topScorerTeam?.name || 'Sem Time'}</p>
                  <p className="text-xs font-bold text-primary mt-2">{scoringRanking[0].points} Pontos Totais</p>
                </div>
              </div>
            </div>
          ) : null;
        })()}

        {/* Resumo Card */}
        <div className="card card-border bg-base-200 p-6 rounded-xl md:col-span-2">
          <h4 className="text-[10px] font-bold uppercase text-base-content/60 mb-4 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-base-content/60" /> Resumo do Torneio
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-base-300/50 rounded-xl border border-base-300">
            <div>
              <p className="text-[8px] font-bold uppercase text-base-content/60">Total de Jogos</p>
              <p className="text-sm font-bold text-base-content font-mono">{sessionGames.filter(g => g.status === 'finished' || g.status === 'walkover').length}</p>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase text-base-content/60">Total de Pontos</p>
              <p className="text-sm font-bold text-base-content font-mono">{sessionPoints.length}</p>
            </div>
            <div className="sm:col-span-2 border-t border-base-300 pt-2">
              <p className="text-[8px] font-bold uppercase text-base-content/60">Maior Placar</p>
              <p className="text-xs font-bold text-base-content uppercase font-mono">{getHighestScoreMatch(sessionGames, sessionTeams)}</p>
            </div>
            <div className="sm:col-span-2 border-t border-base-300 pt-2">
              <p className="text-[8px] font-bold uppercase text-base-content/60">Jogo Mais Equilibrado</p>
              <p className="text-xs font-bold text-base-content uppercase font-mono">{getMostBalancedMatch(sessionGames, sessionTeams)}</p>
            </div>
            <div className="sm:col-span-2 border-t border-base-300 pt-2">
              <p className="text-[8px] font-bold uppercase text-base-content/60">Maior Sequência de Vitórias</p>
              <p className="text-xs font-bold text-base-content uppercase">{getLongestWinStreak(sessionGames, sessionTeams)}</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
