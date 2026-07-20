import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Session, Player, Team, Division, Game } from '../types';
import { balanceTeams } from '../logic/balancing';
import type { BalanceResponse } from '../logic/balancerMessages';
import { saveSessionDraft, loadSessionDraft, clearSessionDraft } from '../logic/sessionDraft';
import { generateTournamentSchedule } from '../logic/tournament';
import { buildPartnershipMatrix } from '../logic/partnershipHistory';
import { generateUUID } from '../logic/uuid';
import {
  buildDivisionConfirmationResult,
  buildDivisionConfirmationCompletionResult,
  buildDivisionFallbackBalanceInput,
  buildDivisionGenerationResult,
  buildDivisionGenerationPlan,
  buildDivisionGenerationStartResult,
  buildDivisionWorkerMessageResult,
  buildSessionDraftResumeResult,
  buildSessionLastSelectionResult,
  buildSessionPatchResult,
  buildTournamentStartResult,
  buildWizardCancelResult,
  shouldClearDivisionWorkerReference,
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

  const terminateWorker = (worker: Worker | null) => {
    worker?.terminate();
    if (shouldClearDivisionWorkerReference(workerRef.current, worker)) {
      workerRef.current = null;
    }
  };

  const partnershipMatrix = useMemo(() => {
    if (!activeSession || !activeSession.communityId) return undefined;
    const historySessions = sessions.filter((s) => s.communityId === activeSession.communityId);
    return buildPartnershipMatrix(historySessions, teams);
  }, [activeSession?.communityId, sessions, teams]);

  // Garante que o worker é encerrado se o componente desmontar no meio do cálculo.
  useEffect(() => {
    return () => {
      terminateWorker(workerRef.current);
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
    const nextSession = buildSessionPatchResult({
      activeSession,
      patch,
      now: new Date().toISOString(),
    });
    if (nextSession) setActiveSession(nextSession);
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
    const result = buildSessionLastSelectionResult(last);
    if (result.patch) updateSession(result.patch);
    if (result.shouldRemoveStoredSelection) {
      console.warn('Ignoring invalid last player selection from storage');
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
    const plan = buildDivisionGenerationPlan({
      activeSession,
      players,
      seed: Math.floor(Math.random() * 1000000),
      partnershipMatrix,
    });
    if (!plan) return;

    updateSession(plan.sessionPatch);

    const applyGenerationStartState = (mode: 'start' | 'cancel') => {
      const result = buildDivisionGenerationStartResult(mode);
      setIsGenerating(result.nextIsGenerating);
      setProgress(result.nextProgress);
    };

    const finish = (divisions: Division[]) => {
      const result = buildDivisionGenerationResult({ divisions, advanceStep });
      setBestDivisions(result.nextBestDivisions);
      setSelectedDivisionIndex(result.nextSelectedDivisionIndex);
      setIsGenerating(result.nextIsGenerating);
      setProgress(result.nextProgress);
      if (result.shouldAdvanceStep) nextStep();
    };
    const runFallback = () => {
      const fallbackInput = buildDivisionFallbackBalanceInput(plan);
      if (!fallbackInput) return;
      const divisions = balanceTeams(
        fallbackInput.players,
        fallbackInput.numTeams,
        fallbackInput.sessionId,
        fallbackInput.config,
        undefined,
        fallbackInput.partnershipMatrix,
      );
      finish(divisions);
    };
    // Encerra qualquer cálculo anterior ainda em andamento.
    terminateWorker(workerRef.current);

    // Fallback síncrono quando Web Workers não estão disponíveis (ex.: testes/SSR).
    if (typeof Worker === 'undefined') {
      applyGenerationStartState('start');
      runFallback();
      return;
    }

    const worker = new Worker(new URL('../logic/balancer.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    applyGenerationStartState('start');

    worker.onmessage = (e: MessageEvent<BalanceResponse>) => {
      const action = buildDivisionWorkerMessageResult(e.data);
      if (action.type === 'progress') {
        setProgress(action.percent);
      } else if (action.type === 'done') {
        terminateWorker(worker);
        finish(action.divisions);
      } else {
        // erro: encerra e cai no cálculo síncrono para não travar o fluxo.
        console.error('Balancer worker error:', action.message);
        terminateWorker(worker);
        runFallback();
      }
    };

    worker.onerror = (err) => {
      console.error('Balancer worker failed, falling back to sync:', err.message);
      terminateWorker(worker);
      runFallback();
    };

    worker.postMessage(plan.request);
  };

  const cancelGeneration = () => {
    terminateWorker(workerRef.current);
    const result = buildDivisionGenerationStartResult('cancel');
    setIsGenerating(result.nextIsGenerating);
    setProgress(result.nextProgress);
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

    const result = buildDivisionConfirmationResult({
      activeSession,
      division: currentDiv,
      sessions,
      teams,
      games,
      now: new Date().toISOString(),
      createGameId: generateUUID,
      generateTournamentSchedule,
    });
    const finalSession = result.finalSession;

    setActiveSession(finalSession);
    setSessions(result.updatedSessions);
    setTeams(result.updatedTeams);
    if (result.updatedGames) setGames(result.updatedGames);

    const completion = buildDivisionConfirmationCompletionResult(finalSession);
    localStorage.setItem('vpg_last_selected_player_ids', completion.selectedPlayerIdsValue);
    localStorage.setItem('vpg_last_session_config', completion.sessionConfigValue);

    if (completion.shouldClearSessionDraft) clearSessionDraft();
    if (completion.shouldAdvanceStep) {
      nextStep();
    } else if (completion.nextPage) {
      setPage(completion.nextPage);
    }
  };

  const startGeneratedTournament = () => {
    if (!activeSession || activeSession.type !== 'tournament') return;
    const result = buildTournamentStartResult({
      activeSession,
      sessions,
      games,
      now: new Date().toISOString(),
    });
    setActiveSession(result.startedSession);
    setSessions(result.updatedSessions);
    setGames(result.updatedGames);
    setPage('session-active');
  };

  const cancelWizard = () => {
    if (confirm('Deseja cancelar a criação da sessão? O progresso será perdido.')) {
      const result = buildWizardCancelResult();
      clearSessionDraft();
      setActiveSession(result.nextActiveSession);
      setPage(result.nextPage);
    }
  };

  const resumeDraft = (draft: any) => {
    const result = buildSessionDraftResumeResult(draft);
    setActiveSession(result.nextActiveSession);
    setWizardStep(result.nextWizardStep);
    setBestDivisions(result.nextBestDivisions);
    setSelectedDivisionIndex(result.nextSelectedDivisionIndex);
    setPage(result.nextPage);
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
