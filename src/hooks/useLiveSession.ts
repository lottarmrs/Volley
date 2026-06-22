import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  Session,
  Game,
  PointEvent,
  Team,
  Player,
  FreePlayConfig,
  PointReason,
  PointType,
  Skill,
  Fault,
  GameReport,
} from '../types';
import { getGameWinner, rotateTeams, evaluateMatchState } from '../logic/session';
import { calculateTeamSessionStats, calculatePlayerScoringRanking } from '../logic/match';
import { generateGameReport } from '../logic/reports';
import {
  formatGameReportForWhatsApp,
  formatTournamentGameForWhatsApp,
  formatScheduledMatchForWhatsApp,
  copyToClipboard,
  openWhatsAppShare,
} from '../logic/exporters';
import {
  calculateTournamentStandings,
  createWalkoverResult,
  isResultGame,
  getFinalStandingsKnockout,
} from '../logic/tournament';

export function useLiveSession(
  activeSession: Session | null,
  games: Game[],
  setGames: React.Dispatch<React.SetStateAction<Game[]>>,
  pointEvents: PointEvent[],
  setPointEvents: React.Dispatch<React.SetStateAction<PointEvent[]>>,
  players: Player[],
  sessionTeams: Team[],
  gameReports: GameReport[],
  setGameReports: React.Dispatch<React.SetStateAction<GameReport[]>>,
) {
  const isRegisteringPoint = useRef(false);
  const [pointModalTeamId, setPointModalTeamId] = useState<string | null>(null);

  const sessionGames = useMemo(
    () => games.filter((g) => g.sessionId === activeSession?.id),
    [games, activeSession?.id],
  );

  const activeGame = useMemo(
    () => sessionGames.find((g) => g.status === 'active' || g.status === 'paused'),
    [sessionGames],
  );

  const lastResultGame = useMemo(
    () =>
      [...sessionGames]
        .filter(isResultGame)
        .sort((a, b) => (b.sequenceNumber || 0) - (a.sequenceNumber || 0))[0],
    [sessionGames],
  );

  const lastGame = useMemo(
    () => [...sessionGames].sort((a, b) => (b.sequenceNumber || 0) - (a.sequenceNumber || 0))[0],
    [sessionGames],
  );

  const currentGame =
    activeGame ?? (activeSession?.type === 'tournament' ? lastResultGame : lastGame);

  const sessionPoints = useMemo(
    () => pointEvents.filter((p) => p.sessionId === activeSession?.id),
    [pointEvents, activeSession?.id],
  );

  const teamStats = useMemo(
    () => calculateTeamSessionStats(sessionGames, activeSession?.teamIds || []),
    [sessionGames, activeSession?.teamIds],
  );

  const scoringRanking = useMemo(
    () => calculatePlayerScoringRanking(sessionPoints),
    [sessionPoints],
  );

  const tournamentStandings = useMemo(() => {
    if (activeSession?.type !== 'tournament' || !activeSession?.config) return null;
    const cfg = activeSession.config as any;
    const baseStandings = calculateTournamentStandings(
      sessionGames,
      activeSession.teamIds,
      cfg.classificationPoints || { win: 3, loss: 0 },
    );
    if (cfg.format === 'knockout' || cfg.format === 'groups_knockout') {
      return getFinalStandingsKnockout(sessionGames, sessionTeams, baseStandings);
    }
    return baseStandings;
  }, [
    sessionGames,
    activeSession?.type,
    activeSession?.teamIds,
    activeSession?.config,
    sessionTeams,
  ]);

  // ── Shared helper: consecutive wins on court ──────────────────────────────
  const getConsecutiveWinsForTeam = useCallback(
    (teamId: string, excludeGameId?: string): number => {
      let count = 0;
      const finished = games
        .filter(
          (g) =>
            g.sessionId === activeSession?.id &&
            g.status === 'finished' &&
            (!excludeGameId || g.id !== excludeGameId),
        )
        .sort((a, b) => new Date(b.finishedAt!).getTime() - new Date(a.finishedAt!).getTime());

      for (const g of finished) {
        if (g.winnerTeamId === teamId) {
          count++;
        } else {
          break;
        }
      }
      return count;
    },
    [games, activeSession?.id],
  );

  // ── Register point ────────────────────────────────────────────────────────
  const registerPoint = useCallback(
    (
      teamId: string,
      playerId?: string,
      reason?: PointReason,
      details?: { pointType?: PointType; skill?: Skill; fault?: Fault; assistPlayerId?: string },
    ) => {
      if (
        !currentGame ||
        !activeSession ||
        currentGame.status !== 'active' ||
        isRegisteringPoint.current
      )
        return;
      if (activeSession.status === 'paused') return;

      if (playerId) {
        const isError = details?.pointType === 'error';
        const concedingTeamId =
          currentGame.teamAId === teamId ? currentGame.teamBId : currentGame.teamAId;
        const authorTeamId = isError ? concedingTeamId : teamId;
        const authorTeam = sessionTeams.find((t) => t.id === authorTeamId);
        if (!authorTeam?.playerIds.includes(playerId)) {
          console.error('O jogador selecionado não pertence ao seu respectivo time.');
          return;
        }
      }

      isRegisteringPoint.current = true;

      try {
        const isTeamA = currentGame.teamAId === teamId;
        const isTeamB = currentGame.teamBId === teamId;
        if (!isTeamA && !isTeamB) return;

        const concedingTeamId = isTeamA ? currentGame.teamBId : currentGame.teamAId;
        const scoreBefore = { teamA: currentGame.scoreA, teamB: currentGame.scoreB };
        const scoreAfter = {
          teamA: isTeamA ? currentGame.scoreA + 1 : currentGame.scoreA,
          teamB: isTeamA ? currentGame.scoreB : currentGame.scoreB + 1,
        };

        const currentGamePoints = sessionPoints.filter((p) => p.gameId === currentGame.id);

        const pointEvent: PointEvent = {
          id: `point-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          sessionId: activeSession.id,
          gameId: currentGame.id,
          sequenceNumber: currentGamePoints.length + 1,
          scoringTeamId: teamId,
          concedingTeamId,
          playerId,
          reason: reason || 'unknown',
          pointType: details?.pointType,
          skill: details?.skill,
          fault: details?.fault,
          eventKind: 'point',
          assistPlayerId: details?.assistPlayerId || null,
          // Time do autor: no erro, o autor está no time que concedeu o ponto.
          playerTeamId: details?.pointType === 'error' ? concedingTeamId : teamId,
          scoreBefore,
          scoreAfter,
          timestamp: new Date().toISOString(),
        };

        setPointEvents((prev) => [...prev, pointEvent]);
        setPointModalTeamId(null);

        const updatedGame: Game = {
          ...currentGame,
          pointIds: [...currentGame.pointIds, pointEvent.id],
        };

        let winnerSymbol: GameWinner = null;

        if (currentGame.setTargets && currentGame.setTargets.length > 1) {
          const matchRules = {
            setTargets: currentGame.setTargets,
            tieBreakMethod: activeSession.config!.tieBreakMethod!,
            hardPointCap: activeSession.config!.hardPointCap,
          };
          const matchState = evaluateMatchState(
            currentGame.sets || [],
            scoreAfter.teamA,
            scoreAfter.teamB,
            matchRules
          );
          updatedGame.sets = matchState.sets;
          updatedGame.scoreA = matchState.scoreA;
          updatedGame.scoreB = matchState.scoreB;
          winnerSymbol = matchState.matchWinner;
        } else {
          updatedGame.scoreA = scoreAfter.teamA;
          updatedGame.scoreB = scoreAfter.teamB;
          const rules = {
            maxPoints: activeSession.config!.maxPoints,
            tieBreakMethod: activeSession.config!.tieBreakMethod!,
            hardPointCap: activeSession.config!.hardPointCap,
          };
          winnerSymbol = getGameWinner(scoreAfter.teamA, scoreAfter.teamB, rules);
        }

        if (winnerSymbol) {
          updatedGame.status = 'finished';
          updatedGame.winnerTeamId =
            winnerSymbol === 'A' ? currentGame.teamAId : currentGame.teamBId;
          updatedGame.loserTeamId =
            winnerSymbol === 'A' ? currentGame.teamBId : currentGame.teamAId;
          updatedGame.finishedAt = new Date().toISOString();
          updatedGame.finishReason = 'auto';
          const report = generateGameReport(
            updatedGame,
            [...pointEvents, pointEvent],
            sessionTeams,
            players,
          );
          setGameReports((prev) => [...prev, report]);
        }

        setGames((prev) => prev.map((g) => (g.id === updatedGame.id ? updatedGame : g)));
      } finally {
        setTimeout(() => {
          isRegisteringPoint.current = false;
        }, 200);
      }
    },
    [
      currentGame,
      activeSession,
      sessionTeams,
      sessionPoints,
      pointEvents,
      players,
      setPointEvents,
      setGames,
      setGameReports,
    ],
  );

  // ── Register highlight (lance de destaque, NÃO altera placar) ──────────────
  const registerHighlight = useCallback(
    (playerId: string, skill: Skill) => {
      if (!currentGame || !activeSession || currentGame.status !== 'active') return;
      if (activeSession.status === 'paused') return;

      const team = sessionTeams.find(
        (t) =>
          (t.id === currentGame.teamAId || t.id === currentGame.teamBId) &&
          t.playerIds.includes(playerId),
      );
      if (!team) return;

      const currentGamePoints = sessionPoints.filter((p) => p.gameId === currentGame.id);
      const score = { teamA: currentGame.scoreA, teamB: currentGame.scoreB };

      const highlight: PointEvent = {
        id: `highlight-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        sessionId: activeSession.id,
        gameId: currentGame.id,
        sequenceNumber: currentGamePoints.length + 1,
        scoringTeamId: team.id,
        concedingTeamId:
          team.id === currentGame.teamAId ? currentGame.teamBId : currentGame.teamAId,
        playerId,
        reason: 'unknown',
        eventKind: 'highlight',
        skill,
        playerTeamId: team.id,
        scoreBefore: score,
        scoreAfter: score, // não mexe no placar
        timestamp: new Date().toISOString(),
      };

      setPointEvents((prev) => [...prev, highlight]);
    },
    [currentGame, activeSession, sessionTeams, sessionPoints, setPointEvents],
  );

  // ── Delete highlight (remoção inline do feed; só lances) ───────────────────
  const deleteHighlight = useCallback(
    (eventId: string) => {
      setPointEvents((prev) =>
        prev.filter((p) => !(p.id === eventId && p.eventKind === 'highlight')),
      );
    },
    [setPointEvents],
  );

  const finishCurrentGameManually = useCallback(() => {
    if (!currentGame || !activeSession || currentGame.status !== 'active') return;
    if (currentGame.scoreA === currentGame.scoreB) return;

    const winnerTeamId =
      currentGame.scoreA > currentGame.scoreB ? currentGame.teamAId : currentGame.teamBId;
    const loserTeamId =
      currentGame.scoreA > currentGame.scoreB ? currentGame.teamBId : currentGame.teamAId;
    
    let sets = currentGame.sets || [];
    if (currentGame.setTargets && currentGame.setTargets.length > 1) {
      sets = [...sets, { scoreA: currentGame.scoreA, scoreB: currentGame.scoreB }];
    }

    const updatedGame: Game = {
      ...currentGame,
      status: 'finished',
      winnerTeamId,
      loserTeamId,
      finishedAt: new Date().toISOString(),
      finishReason: 'manual',
      sets,
    };

    const report = generateGameReport(updatedGame, pointEvents, sessionTeams, players);
    setGameReports((prev) =>
      prev.some((r) => r.gameId === updatedGame.id) ? prev : [...prev, report],
    );
    setGames((prev) => prev.map((g) => (g.id === updatedGame.id ? updatedGame : g)));
  }, [currentGame, activeSession, pointEvents, sessionTeams, players, setGameReports, setGames]);

  // ── Start next game (free_play rotation OR tournament next scheduled) ────
  const startNextGame = useCallback(
    (updateActiveSession: (s: Session) => void) => {
      if (!activeSession) return;

      let teamAId: string;
      let teamBId: string;

      if (activeSession.type === 'free_play' && activeSession.config?.type === 'free_play') {
        if (!currentGame || currentGame.status !== 'finished') return;
        const cfg = activeSession.config as FreePlayConfig;
        const winnerId = currentGame.winnerTeamId!;
        const loserId = currentGame.loserTeamId!;

        const result = rotateTeams({
          courtTeams: [currentGame.teamAId, currentGame.teamBId],
          queue: cfg.initialQueue || [],
          winnerId,
          loserId,
          rotationSystem: cfg.rotationSystem,
          consecutiveGamesByTeam: {
            [winnerId]: getConsecutiveWinsForTeam(winnerId, currentGame.id),
            [loserId]: getConsecutiveWinsForTeam(loserId, currentGame.id),
          },
          maxConsecutiveGames: cfg.maxConsecutiveGames,
        });

        updateActiveSession({
          ...activeSession,
          config: {
            ...activeSession.config!,
            initialCourtTeams: result.nextCourtTeams,
            initialQueue: result.nextQueue,
          },
        });

        teamAId = result.nextCourtTeams[0];
        teamBId = result.nextCourtTeams[1];
      } else if (activeSession.type === 'tournament') {
        // Find next scheduled game
        const nextScheduled = sessionGames
          .filter((g) => g.status === 'scheduled')
          .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))[0];

        if (!nextScheduled) return; // All games played

        // Activate the scheduled game instead of creating a new one
        setGames((prev) =>
          prev.map((g) =>
            g.id === nextScheduled.id
              ? { ...g, status: 'active', startedAt: new Date().toISOString() }
              : g,
          ),
        );
        return;
      } else {
        return;
      }

      if (teamAId === teamBId && activeSession.teamIds.length > 1) {
        teamBId = activeSession.teamIds.find((id) => id !== teamAId) || teamBId;
      }

      const newGame: Game = {
        id: `game-${Date.now()}`,
        sessionId: activeSession.id,
        type: activeSession.type!,
        sequenceNumber: sessionGames.length + 1,
        teamAId,
        teamBId,
        scoreA: 0,
        scoreB: 0,
        status: 'active',
        pointIds: [],
        startedAt: new Date().toISOString(),
      };

      setGames((prev) => [...prev, newGame]);
    },
    [currentGame, activeSession, sessionGames, getConsecutiveWinsForTeam, setGames],
  );

  // ── Undo last point ───────────────────────────────────────────────────────
  const undoLastPoint = useCallback(() => {
    if (!currentGame || sessionPoints.length === 0) return;

    const currentGamePoints = sessionPoints
      .filter((p) => p.gameId === currentGame.id)
      .sort(
        (a, b) =>
          (a.sequenceNumber || 0) - (b.sequenceNumber || 0) ||
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );

    if (currentGamePoints.length === 0) return;
    const lastPoint = currentGamePoints[currentGamePoints.length - 1];

    setPointEvents((prev) => prev.filter((p) => p.id !== lastPoint.id));
    setGameReports((prev) => prev.filter((report) => report.gameId !== currentGame.id));
    setGames((prev) =>
      prev.map((g) => {
        if (g.id !== currentGame.id) return g;
        
        let newSets = g.sets ? [...g.sets] : [];
        if (newSets.length > 0) {
          const lastSet = newSets[newSets.length - 1];
          if (
            lastPoint.scoreAfter.teamA === lastSet.scoreA &&
            lastPoint.scoreAfter.teamB === lastSet.scoreB
          ) {
            newSets.pop();
          }
        }

        return {
          ...g,
          scoreA: lastPoint.scoreBefore.teamA,
          scoreB: lastPoint.scoreBefore.teamB,
          sets: newSets,
          pointIds: g.pointIds.filter((id) => id !== lastPoint.id),
          status: 'active' as const,
          winnerTeamId: null,
          loserTeamId: null,
          finishedAt: null,
          finishReason: null,
        };
      }),
    );
  }, [currentGame, sessionPoints, setPointEvents, setGames, setGameReports]);

  // ── Next match preview (free_play only) ───────────────────────────────────
  const nextMatchPreview = useMemo(() => {
    if (!currentGame || !activeSession || currentGame.status !== 'finished') return null;

    if (activeSession.type === 'tournament') {
      const next = sessionGames
        .filter((g) => g.status === 'scheduled')
        .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))[0];
      if (!next) return null;
      return { nextCourtTeams: [next.teamAId, next.teamBId] as [string, string], nextQueue: [] };
    }

    if (activeSession.type !== 'free_play' || activeSession.config?.type !== 'free_play')
      return null;

    const cfg = activeSession.config as FreePlayConfig;
    const winnerId = currentGame.winnerTeamId!;
    const loserId = currentGame.loserTeamId!;

    return rotateTeams({
      courtTeams: [currentGame.teamAId, currentGame.teamBId],
      queue: cfg.initialQueue || [],
      winnerId,
      loserId,
      rotationSystem: cfg.rotationSystem,
      consecutiveGamesByTeam: {
        [winnerId]: getConsecutiveWinsForTeam(winnerId, currentGame.id),
        [loserId]: getConsecutiveWinsForTeam(loserId, currentGame.id),
      },
      maxConsecutiveGames: cfg.maxConsecutiveGames,
    });
  }, [currentGame, activeSession, sessionGames, getConsecutiveWinsForTeam]);

  const registerWalkover = useCallback(
    (gameId: string, winnerTeamId: string) => {
      if (!activeSession?.config) return;
      const pointsPerGame = activeSession.config.maxPoints || 15;
      setGames((prev) =>
        prev.map((game) => {
          if (game.id !== gameId || !['scheduled', 'active', 'paused'].includes(game.status))
            return game;
          return createWalkoverResult(game, winnerTeamId, pointsPerGame);
        }),
      );
    },
    [activeSession?.config, setGames],
  );

  const pauseGame = useCallback(
    (gameId: string, paused: boolean) => {
      setGames((prev) =>
        prev.map((game) => {
          if (game.id !== gameId) return game;
          if (paused && game.status === 'active') return { ...game, status: 'paused' as const };
          if (!paused && game.status === 'paused') return { ...game, status: 'active' as const };
          return game;
        }),
      );
    },
    [setGames],
  );

  const reopenGame = useCallback(
    (gameId: string) => {
      setGames((prev) =>
        prev.map((game) => {
          if (game.id !== gameId || !isResultGame(game)) return game;
          return {
            ...game,
            status: 'active' as const,
            winnerTeamId: null,
            loserTeamId: null,
            finishedAt: null,
            finishReason: null,
          };
        }),
      );
      setGameReports((prev) => prev.filter((report) => report.gameId !== gameId));
    },
    [setGames, setGameReports],
  );

  const cancelGame = useCallback(
    (gameId: string) => {
      setGames((prev) =>
        prev.map((game) =>
          game.id === gameId
            ? {
                ...game,
                status: 'cancelled' as const,
                finishedAt: new Date().toISOString(),
                finishReason: null,
              }
            : game,
        ),
      );
    },
    [setGames],
  );

  const updateFinalScore = useCallback(
    (gameId: string, scoreA: number, scoreB: number) => {
      if (scoreA === scoreB) return;
      const game = games.find((g) => g.id === gameId);
      if (!game) return;
      const winnerTeamId = scoreA > scoreB ? game.teamAId : game.teamBId;
      const loserTeamId = scoreA > scoreB ? game.teamBId : game.teamAId;
      const updatedGame: Game = {
        ...game,
        scoreA,
        scoreB,
        winnerTeamId,
        loserTeamId,
        status: 'finished',
        finishedAt: game.finishedAt || new Date().toISOString(),
        finishReason: game.finishReason || 'manual',
      };
      setGames((prev) => prev.map((g) => (g.id === gameId ? updatedGame : g)));
      const report = generateGameReport(updatedGame, pointEvents, sessionTeams, players);
      setGameReports((prev) => [...prev.filter((r) => r.gameId !== gameId), report]);
    },
    [games, pointEvents, sessionTeams, players, setGames, setGameReports],
  );

  const reorderScheduledGame = useCallback(
    (gameId: string, direction: 'up' | 'down') => {
      setGames((prev) => {
        const otherGames = prev.filter((g) => g.sessionId !== activeSession?.id);
        const sessionOrdered = prev
          .filter((g) => g.sessionId === activeSession?.id)
          .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
        const index = sessionOrdered.findIndex((g) => g.id === gameId);
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (index < 0 || targetIndex < 0 || targetIndex >= sessionOrdered.length) return prev;
        
        const gameA = sessionOrdered[index];
        const gameB = sessionOrdered[targetIndex];
        
        if (
          gameA.status !== 'scheduled' ||
          gameB.status !== 'scheduled'
        )
          return prev;
          
        if (gameA.stage !== gameB.stage)
          return prev;
          
        [sessionOrdered[index], sessionOrdered[targetIndex]] = [
          sessionOrdered[targetIndex],
          sessionOrdered[index],
        ];
        return [
          ...otherGames,
          ...sessionOrdered.map((game, idx) => ({ ...game, sequenceNumber: idx + 1 })),
        ];
      });
    },
    [activeSession?.id, setGames],
  );

  // ── Share helpers ──────────────────────────────────────────────────────────
  const shareGameToWhatsApp = useCallback(
    (gameId: string) => {
      const game = games.find((g) => g.id === gameId);
      if (!game) return;

      if (game.status === 'scheduled') {
        openWhatsAppShare(
          formatScheduledMatchForWhatsApp({
            game,
            teams: sessionTeams,
            sessionName: activeSession?.name || 'Sessão',
          }),
        );
        return;
      }

      const report = gameReports.find((r) => r.gameId === gameId);
      if (report) {
        openWhatsAppShare(formatGameReportForWhatsApp(report));
        return;
      }

      openWhatsAppShare(
        formatTournamentGameForWhatsApp({
          game,
          teams: sessionTeams,
          players,
          points: pointEvents,
        }),
      );
    },
    [gameReports, games, sessionTeams, players, pointEvents, activeSession?.name],
  );

  const copyGameToClipboard = useCallback(
    async (gameId: string) => {
      const game = games.find((g) => g.id === gameId);
      if (!game) return false;

      if (game.status === 'scheduled') {
        return copyToClipboard(
          formatScheduledMatchForWhatsApp({
            game,
            teams: sessionTeams,
            sessionName: activeSession?.name || 'Sessão',
          }),
        );
      }

      const report = gameReports.find((r) => r.gameId === gameId);
      if (report) return copyToClipboard(formatGameReportForWhatsApp(report));

      return copyToClipboard(
        formatTournamentGameForWhatsApp({
          game,
          teams: sessionTeams,
          players,
          points: pointEvents,
        }),
      );
    },
    [gameReports, games, sessionTeams, players, pointEvents, activeSession?.name],
  );

  return {
    currentGame,
    sessionGames,
    sessionPoints,
    teamStats,
    scoringRanking,
    tournamentStandings,
    pointModalTeamId,
    setPointModalTeamId,
    registerPoint,
    registerHighlight,
    deleteHighlight,
    finishCurrentGameManually,
    startNextGame,
    undoLastPoint,
    registerWalkover,
    pauseGame,
    reopenGame,
    cancelGame,
    updateFinalScore,
    reorderScheduledGame,
    nextMatchPreview,
    shareGameToWhatsApp,
    copyGameToClipboard,
  };
}
