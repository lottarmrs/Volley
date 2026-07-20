import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Session, Player, Team, Division, Game, TournamentConfig } from '../types';
import { balanceTeams } from '../logic/balancing';
import type { BalanceRequest, BalanceResponse } from '../logic/balancerMessages';
import { saveSessionDraft, loadSessionDraft, clearSessionDraft } from '../logic/sessionDraft';
import { generateTournamentSchedule } from '../logic/tournament';
import { buildPartnershipMatrix } from '../logic/partnershipHistory';
import { generateUUID } from '../logic/uuid';
import {
  buildFreePlayDivisionConfirmationResult,
  buildTournamentDivisionConfirmationResult,
} from '../application/sessionLifecycleUseCases';
import {
  addPlayerPairConstraint,
  removePlayerPairConstraint,
  selectPlayablePlayerIds,
  toggleLockedPlayerTeam,
  toggleSessionPlayerSelection,
  validateSessionWizardStep,
} from '../domain/sessionSetup';

interface UseSessionWizardProps {
  players: Player[];
  activeSession: Session | null;
  setActiveSession: (session: Session | null) => void;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  games: Game[];
  setGames: React.Dispatch<React.SetStateAction<Game[]>>;
  setPage: (page: any) => void;
  sessions: Session[];
  teams: Team[];
}

export function useSessionWizard({
  players,
  activeSession,
  setActiveSession,
  setSessions,
  setTeams,
  games,
  setGames,
  setPage,
  sessions,
  teams,
}: UseSessionWizardProps) {
  const [wizardStep, setWizardStep] = useState(0);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [bestDivisions, setBestDivisions] = useState<Division[]>([]);
  const [selectedDivisionIndex, setSelectedDivisionIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  const partnershipMatrix = useMemo(() => {
    if (!activeSession || !activeSession.communityId) return undefined;
    const historySessions = sessions.filter((s) => s.communityId === activeSession.communityId);
    return buildPartnershipMatrix(historySessions, teams);
  }, [activeSession?.communityId, sessions, teams]);

  // Garante que o worker é encerrado se o componente desmontar no meio do cálculo.
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (activeSession && activeSession.status === 'draft') {
      saveSessionDraft({
        session: activeSession,
        wizardStep,
        bestDivisions,
        selectedDivisionIndex,
        updatedAt: new Date().toISOString(),
      });
    }
  }, [activeSession, wizardStep, bestDivisions, selectedDivisionIndex]);

  const updateSession = (patch: Partial<Session>) => {
    if (!activeSession) return;
    setActiveSession({ ...activeSession, ...patch, updatedAt: new Date().toISOString() });
  };

  const nextStep = () => setWizardStep((prev) => prev + 1);
  const prevStep = () => setWizardStep((prev) => prev - 1);
  const goToStep = (step: number) => setWizardStep(step);

  const togglePlayer = (playerId: string) => {
    if (!activeSession) return;
    updateSession({
      selectedPlayerIds: toggleSessionPlayerSelection(activeSession.selectedPlayerIds, playerId),
    });
    if (validationErrors.players) setValidationErrors((prev) => ({ ...prev, players: '' }));
  };

  const selectAllActivePlayers = () => {
    updateSession({ selectedPlayerIds: selectPlayablePlayerIds(players) });
  };

  const clearSelectedPlayers = () => updateSession({ selectedPlayerIds: [] });

  const useLastSelection = () => {
    const last = localStorage.getItem('vpg_last_selected_player_ids');
    if (!last) return;

    try {
      const selectedPlayerIds = JSON.parse(last);
      if (Array.isArray(selectedPlayerIds)) {
        updateSession({ selectedPlayerIds });
      }
    } catch (err) {
      console.warn('Ignoring invalid last player selection from storage:', err);
      localStorage.removeItem('vpg_last_selected_player_ids');
    }
  };

  const validateCurrentStep = () => {
    if (!activeSession) {
      setValidationErrors({});
      return false;
    }

    const errors = validateSessionWizardStep(activeSession, wizardStep);
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const generateDivisions = (advanceStep = true) => {
    if (!activeSession || !activeSession.config) return;
    const sessionPlayers = players.filter((p) => activeSession.selectedPlayerIds.includes(p.id));
    const { config } = activeSession;
    const sessionId = activeSession.id;

    // Generate new random seed per run
    const seed = Math.floor(Math.random() * 1000000);
    const updatedConfig = {
      ...config,
      balanceSeed: seed,
    };

    updateSession({ config: updatedConfig });

    const finish = (divisions: Division[]) => {
      setBestDivisions(divisions);
      setSelectedDivisionIndex(0);
      setIsGenerating(false);
      setProgress(100);
      if (advanceStep) nextStep();
    };

    // Encerra qualquer cálculo anterior ainda em andamento.
    workerRef.current?.terminate();
    workerRef.current = null;

    // Fallback síncrono quando Web Workers não estão disponíveis (ex.: testes/SSR).
    if (typeof Worker === 'undefined') {
      setIsGenerating(true);
      setProgress(0);
      const divisions = balanceTeams(
        sessionPlayers,
        updatedConfig.teamCount,
        sessionId,
        updatedConfig,
        undefined,
        partnershipMatrix,
      );
      finish(divisions);
      return;
    }

    const worker = new Worker(new URL('../logic/balancer.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    setIsGenerating(true);
    setProgress(0);

    worker.onmessage = (e: MessageEvent<BalanceResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setProgress(msg.percent);
      } else if (msg.type === 'done') {
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        finish(msg.divisions);
      } else {
        // erro: encerra e cai no cálculo síncrono para não travar o fluxo.
        console.error('Balancer worker error:', msg.message);
        worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
        const divisions = balanceTeams(
          sessionPlayers,
          updatedConfig.teamCount,
          sessionId,
          updatedConfig,
          undefined,
          partnershipMatrix,
        );
        finish(divisions);
      }
    };

    worker.onerror = (err) => {
      console.error('Balancer worker failed, falling back to sync:', err.message);
      worker.terminate();
      if (workerRef.current === worker) workerRef.current = null;
      const divisions = balanceTeams(
        sessionPlayers,
        updatedConfig.teamCount,
        sessionId,
        updatedConfig,
        undefined,
        partnershipMatrix,
      );
      finish(divisions);
    };

    const request: BalanceRequest = {
      type: 'balance',
      players: sessionPlayers,
      numTeams: updatedConfig.teamCount,
      sessionId,
      config: updatedConfig,
      partnershipMatrix,
    };
    worker.postMessage(request);
  };

  const cancelGeneration = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setIsGenerating(false);
    setProgress(0);
  };

  const togglePlayerLock = (playerId: string, teamIdx: number) => {
    if (!activeSession || !activeSession.config) return;
    updateSession({ config: toggleLockedPlayerTeam(activeSession.config, playerId, teamIdx) });
  };

  const addPairConstraint = (p1: string, p2: string, type: 'together' | 'separated') => {
    if (!activeSession || !activeSession.config) return;
    updateSession({ config: addPlayerPairConstraint(activeSession.config, p1, p2, type) });
  };

  const removePairConstraint = (p1: string, p2: string, type: 'together' | 'separated') => {
    if (!activeSession || !activeSession.config) return;
    updateSession({ config: removePlayerPairConstraint(activeSession.config, p1, p2, type) });
  };

  const confirmDivision = () => {
    if (!activeSession || bestDivisions.length === 0) return;
    const currentDiv = bestDivisions[selectedDivisionIndex];

    let finalSession: Session;
    const now = new Date().toISOString();

    if (activeSession.type === 'tournament') {
      const cfg = activeSession.config as TournamentConfig;
      const schedule = generateTournamentSchedule(
        currentDiv.teams.map((t) => t.id),
        cfg.format,
        cfg,
      );
      const result = buildTournamentDivisionConfirmationResult({
        activeSession,
        division: currentDiv,
        sessions,
        teams,
        games,
        schedule,
        now,
        createGameId: generateUUID,
      });
      finalSession = result.finalSession;
      setSessions(result.updatedSessions);
      setTeams(result.updatedTeams);
      setGames(result.updatedGames);
    } else {
      const result = buildFreePlayDivisionConfirmationResult({
        activeSession,
        division: currentDiv,
        sessions,
        teams,
        now,
      });
      finalSession = result.finalSession;
      setSessions(result.updatedSessions);
      setTeams(result.updatedTeams);
    }

    setActiveSession(finalSession);

    localStorage.setItem(
      'vpg_last_selected_player_ids',
      JSON.stringify(finalSession.selectedPlayerIds),
    );
    localStorage.setItem('vpg_last_session_config', JSON.stringify(finalSession.config));

    clearSessionDraft();
    if (finalSession.type === 'tournament') {
      nextStep();
    } else {
      setPage('session-active');
    }
  };

  const startGeneratedTournament = () => {
    if (!activeSession || activeSession.type !== 'tournament') return;
    const startedSession: Session = {
      ...activeSession,
      status: 'active',
      updatedAt: new Date().toISOString(),
    };
    setActiveSession(startedSession);
    setSessions((prev) => prev.map((s) => (s.id === startedSession.id ? startedSession : s)));
    setGames((prev: any[]) => {
      const sessionGames = prev
        .filter((g) => g.sessionId === activeSession.id)
        .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
      const firstScheduled = sessionGames.find((g) => g.status === 'scheduled');
      return prev.map((g) =>
        g.id === firstScheduled?.id
          ? { ...g, status: 'active', startedAt: new Date().toISOString() }
          : g,
      );
    });
    setPage('session-active');
  };

  const cancelWizard = () => {
    if (confirm('Deseja cancelar a criação da sessão? O progresso será perdido.')) {
      clearSessionDraft();
      setActiveSession(null);
      setPage('dashboard');
    }
  };

  const resumeDraft = (draft: any) => {
    setActiveSession(draft.session);
    setWizardStep(draft.wizardStep);
    setBestDivisions(draft.bestDivisions);
    setSelectedDivisionIndex(draft.selectedDivisionIndex);
    setPage('session-wizard');
  };

  return {
    wizardStep,
    setWizardStep,
    validationErrors,
    bestDivisions,
    setBestDivisions,
    selectedDivisionIndex,
    setSelectedDivisionIndex,
    isGenerating,
    progress,
    nextStep,
    prevStep,
    goToStep,
    updateSession,
    togglePlayer,
    selectAllActivePlayers,
    clearSelectedPlayers,
    useLastSelection,
    validateCurrentStep,
    generateDivisions,
    cancelGeneration,
    confirmDivision,
    startGeneratedTournament,
    cancelWizard,
    resumeDraft,
    togglePlayerLock,
    addPairConstraint,
    removePairConstraint,
    partnershipMatrix,
  };
}
