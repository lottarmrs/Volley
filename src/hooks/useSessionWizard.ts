import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Session, Player, Team, Division, Game } from '../types';
import type { BalanceResponse } from '../logic/balancerMessages';
import { saveSessionDraft, loadSessionDraft, clearSessionDraft } from '../logic/sessionDraft';
import { generateTournamentSchedule } from '../logic/tournament';
import { generateUUID } from '../logic/uuid';
import {
  buildDivisionConfirmationResult,
  buildDivisionConfirmationCompletionResult,
  buildDivisionFallbackBalanceResult,
  buildDivisionGenerationCompletionApplicationResult,
  buildDivisionGenerationPlan,
  buildDivisionGenerationStatusApplicationResult,
  buildDivisionWorkerMessageResult,
  buildGeneratedTournamentStartApplicationResult,
  buildSessionDraftResumeResult,
  buildSessionDraftPersistenceResult,
  buildSessionLastSelectionApplicationResult,
  buildSessionPatchResult,
  buildSessionPartnershipMatrixResult,
  buildSessionPlayerBulkSelectionResult,
  buildSessionPlayerLockResult,
  buildSessionPlayerPairConstraintResult,
  buildSessionPlayerToggleResult,
  buildSessionStepValidationResult,
  buildWizardCancelApplicationResult,
  shouldClearDivisionWorkerReference,
} from '../application/sessionLifecycleUseCases';

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
    return buildSessionPartnershipMatrixResult({
      activeSession,
      sessions,
      teams,
    }).partnershipMatrix;
  }, [activeSession?.communityId, sessions, teams]);

  // Garante que o worker é encerrado se o componente desmontar no meio do cálculo.
  useEffect(() => {
    return () => {
      terminateWorker(workerRef.current);
    };
  }, []);

  useEffect(() => {
    const result = buildSessionDraftPersistenceResult({
      activeSession,
      wizardStep,
      bestDivisions,
      selectedDivisionIndex,
      now: new Date().toISOString(),
    });
    if (result.draft) saveSessionDraft(result.draft);
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
    const result = buildSessionPlayerToggleResult({
      activeSession,
      playerId,
      validationErrors,
      now: new Date().toISOString(),
    });
    if (result.nextActiveSession) setActiveSession(result.nextActiveSession);
    if (result.nextValidationErrors) setValidationErrors(result.nextValidationErrors);
  };

  const selectAllActivePlayers = () => {
    const result = buildSessionPlayerBulkSelectionResult({
      activeSession,
      players,
      mode: 'select-playable',
      now: new Date().toISOString(),
    });
    if (result.nextActiveSession) setActiveSession(result.nextActiveSession);
  };

  const clearSelectedPlayers = () => {
    const result = buildSessionPlayerBulkSelectionResult({
      activeSession,
      players,
      mode: 'clear',
      now: new Date().toISOString(),
    });
    if (result.nextActiveSession) setActiveSession(result.nextActiveSession);
  };

  const useLastSelection = () => {
    const result = buildSessionLastSelectionApplicationResult({
      activeSession,
      rawSelection: localStorage.getItem('vpg_last_selected_player_ids'),
      now: new Date().toISOString(),
    });
    if (result.nextActiveSession) setActiveSession(result.nextActiveSession);
    if (result.shouldWarnInvalidSelection) {
      console.warn('Ignoring invalid last player selection from storage');
    }
    if (result.shouldRemoveStoredSelection) {
      localStorage.removeItem('vpg_last_selected_player_ids');
    }
  };

  const validateCurrentStep = () => {
    const result = buildSessionStepValidationResult(activeSession, wizardStep);
    setValidationErrors(result.errors);
    return result.isValid;
  };

  const applyGenerationStatusState = (result: {
    nextIsGenerating: boolean;
    nextProgress: number;
  }) => {
    setIsGenerating(result.nextIsGenerating);
    setProgress(result.nextProgress);
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

    const finish = (divisions: Division[]) => {
      const result = buildDivisionGenerationCompletionApplicationResult({
        divisions,
        advanceStep,
        currentWizardStep: wizardStep,
      });
      setBestDivisions(result.nextBestDivisions);
      setSelectedDivisionIndex(result.nextSelectedDivisionIndex);
      setIsGenerating(result.nextIsGenerating);
      setProgress(result.nextProgress);
      if (result.nextWizardStep !== null) setWizardStep(result.nextWizardStep);
    };
    const runFallback = () => {
      const result = buildDivisionFallbackBalanceResult(plan);
      if (result) finish(result.divisions);
    };
    // Encerra qualquer cálculo anterior ainda em andamento.
    terminateWorker(workerRef.current);

    // Fallback síncrono quando Web Workers não estão disponíveis (ex.: testes/SSR).
    if (typeof Worker === 'undefined') {
      applyGenerationStatusState(buildDivisionGenerationStatusApplicationResult('start'));
      runFallback();
      return;
    }

    const worker = new Worker(new URL('../logic/balancer.worker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;
    applyGenerationStatusState(buildDivisionGenerationStatusApplicationResult('start'));

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
    applyGenerationStatusState(buildDivisionGenerationStatusApplicationResult('cancel'));
  };

  const togglePlayerLock = (playerId: string, teamIdx: number) => {
    const result = buildSessionPlayerLockResult({
      activeSession,
      playerId,
      teamIndex: teamIdx,
      now: new Date().toISOString(),
    });
    if (result.nextActiveSession) setActiveSession(result.nextActiveSession);
  };

  const addPairConstraint = (p1: string, p2: string, type: 'together' | 'separated') => {
    const result = buildSessionPlayerPairConstraintResult({
      activeSession,
      playerAId: p1,
      playerBId: p2,
      type,
      mode: 'add',
      now: new Date().toISOString(),
    });
    if (result.nextActiveSession) setActiveSession(result.nextActiveSession);
  };

  const removePairConstraint = (p1: string, p2: string, type: 'together' | 'separated') => {
    const result = buildSessionPlayerPairConstraintResult({
      activeSession,
      playerAId: p1,
      playerBId: p2,
      type,
      mode: 'remove',
      now: new Date().toISOString(),
    });
    if (result.nextActiveSession) setActiveSession(result.nextActiveSession);
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
    const result = buildGeneratedTournamentStartApplicationResult({
      activeSession,
      sessions,
      games,
      now: new Date().toISOString(),
    });
    if (!result) return;
    setActiveSession(result.startedSession);
    setSessions(result.updatedSessions);
    setGames(result.updatedGames);
    setPage(result.nextPage);
  };

  const cancelWizard = () => {
    const result = buildWizardCancelApplicationResult(
      confirm('Deseja cancelar a criação da sessão? O progresso será perdido.'),
    );
    if (!result) return;
    if (result.shouldClearSessionDraft) clearSessionDraft();
    setActiveSession(result.nextActiveSession);
    setPage(result.nextPage);
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
