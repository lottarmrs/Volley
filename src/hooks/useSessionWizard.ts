import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Session, Player, Team, Division, Game, Community } from '../types';
import type { AuthorizedFormationStage, CandidateSetPublicationState } from '../types';
import type {
  AuthorizedFormationGateway,
  TeamCandidateSetGateway,
} from '../application/authorizedFormationGateways';
import {
  classifyFormationAuthority,
  precheckAuthorizedSelection,
} from '../application/authorizedTeamFormationRules';
import { prepareAuthorizedTeamFormation } from '../application/authorizedTeamFormationUseCases';
import {
  clearCandidateSetPublication,
  publishTeamCandidateSet,
} from '../application/teamCandidateSetUseCases';
import type { DivisionGenerationPlan } from '../application/sessionLifecycleUseCases';
import { buildBalanceErrorResponse } from '../logic/balancerMessages';
import type { BalanceResponse } from '../logic/balancerMessages';
import { saveSessionDraft, clearSessionDraft } from '../logic/sessionDraft';
import { generateTournamentSchedule } from '../logic/tournament';
import { generateUUID } from '../logic/uuid';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import {
  buildDivisionConfirmationApplicationResult,
  buildDivisionFallbackBalanceResult,
  buildDivisionGenerationCancelApplicationResult,
  buildDivisionGenerationCompletionApplicationResult,
  buildDivisionGenerationPlan,
  buildDivisionWorkerFallbackApplicationResult,
  buildDivisionWorkerMessageResult,
  buildDivisionWorkerStartApplicationResult,
  buildDivisionWorkerUnavailableApplicationResult,
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
  buildWizardCancelRequestResult,
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
  communities?: Community[];
  authorizedFormationGateway?: AuthorizedFormationGateway;
  teamCandidateSetGateway?: TeamCandidateSetGateway;
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
  communities = [],
  authorizedFormationGateway,
  teamCandidateSetGateway,
}: UseSessionWizardProps) {
  const [wizardStep, setWizardStep] = useState(0);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [bestDivisions, setBestDivisions] = useState<Division[]>([]);
  const [selectedDivisionIndex, setSelectedDivisionIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const [generationStage, setGenerationStage] = useState<AuthorizedFormationStage | null>(null);
  const [authorizedDraw, setAuthorizedDraw] = useState<{
    estimatedCount: number;
    participantCount: number;
  } | null>(null);
  const preparationRef = useRef(0);
  const [publicationBusy, setPublicationBusy] = useState(false);
  const [publicationError, setPublicationError] = useState<string | null>(null);
  const [publishedSetId, setPublishedSetId] = useState<string | null>(null);
  const activeSessionIdRef = useRef<string | null>(activeSession?.id ?? null);

  useEffect(() => {
    activeSessionIdRef.current = activeSession?.id ?? null;
  }, [activeSession?.id]);

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
      rawSelection: localStorage.getItem(STORAGE_KEYS.lastSelectedPlayerIds),
      now: new Date().toISOString(),
    });
    if (result.nextActiveSession) setActiveSession(result.nextActiveSession);
    if (result.warningMessage) {
      console.warn(result.warningMessage);
    }
    result.storageRemovals.forEach((target) => {
      localStorage.removeItem(STORAGE_KEYS[target]);
    });
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

  const clearGenerationError = () =>
    setValidationErrors((current) => {
      if (current.generation === undefined) return current;
      const { generation: _cleared, ...rest } = current;
      return rest;
    });

  const startBalancing = (plan: DivisionGenerationPlan, advanceStep: boolean) => {
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
      try {
        const result = buildDivisionFallbackBalanceResult(plan);
        if (!result) return;
        if (result.type === 'infeasible') {
          // A domain refusal on the synchronous path: same presentation as the worker path,
          // so the wizard never sits spinning with no message.
          applyGenerationStatusState(result.generationStatus);
          setValidationErrors((current) => ({ ...current, generation: result.message }));
          return;
        }
        finish(result.divisions);
      } catch (error) {
        // Same classifier the worker uses, so the synchronous fallback path and the worker
        // path cannot disagree about whether a failure is a domain refusal or a crash.
        const action = buildDivisionWorkerMessageResult(buildBalanceErrorResponse(error), plan);

        if (action.type === 'infeasible') {
          // A domain refusal: the constraints admit no division, so say exactly that.
          applyGenerationStatusState(action.generationStatus);
          setValidationErrors((current) => ({ ...current, generation: action.message }));
          return;
        }

        // The fallback itself failed. Rethrowing here escaped into React's event handler
        // and left the wizard spinning with no message, so the user saw nothing happen.
        // Surface a recoverable message instead and stop generating.
        applyGenerationStatusState(
          buildDivisionGenerationCancelApplicationResult(null).generationStatus,
        );
        setValidationErrors((current) => ({
          ...current,
          generation: 'Não foi possível gerar os times. Tente novamente.',
        }));
      }
    };
    // Encerra qualquer cálculo anterior ainda em andamento.
    terminateWorker(workerRef.current);

    // Fallback síncrono quando Web Workers não estão disponíveis (ex.: testes/SSR).
    if (typeof Worker === 'undefined') {
      const fallback = buildDivisionWorkerUnavailableApplicationResult();
      applyGenerationStatusState(fallback.generationStatus);
      if (fallback.shouldRunFallback) runFallback();
      return;
    }

    const worker = new Worker(new URL('../logic/balancer.worker.ts', import.meta.url), {
      type: 'module',
    });
    const start = buildDivisionWorkerStartApplicationResult(plan);
    if (!start) return;
    workerRef.current = worker;
    applyGenerationStatusState(start.generationStatus);

    worker.onmessage = (e: MessageEvent<BalanceResponse>) => {
      const action = buildDivisionWorkerMessageResult(e.data, plan);
      if (action.type === 'progress') {
        setProgress(action.percent);
      } else if (action.type === 'done') {
        terminateWorker(worker);
        finish(action.divisions);
      } else if (action.type === 'infeasible') {
        terminateWorker(worker);
        applyGenerationStatusState(action.generationStatus);
        setValidationErrors((current) => ({ ...current, generation: action.message }));
      } else {
        // erro: encerra e cai no cálculo síncrono para não travar o fluxo.
        const fallback = buildDivisionWorkerFallbackApplicationResult({
          source: 'worker-message',
          message: action.message,
        });
        console.error(fallback.logMessage);
        if (fallback.shouldTerminateWorker) terminateWorker(worker);
        if (fallback.shouldRunFallback) runFallback();
      }
    };

    worker.onerror = (err) => {
      const fallback = buildDivisionWorkerFallbackApplicationResult({
        source: 'runtime-error',
        message: err.message,
      });
      console.error(fallback.logMessage);
      if (fallback.shouldTerminateWorker) terminateWorker(worker);
      if (fallback.shouldRunFallback) runFallback();
    };

    worker.postMessage(start.message);
  };

  const stopGenerationWithError = (message: string) => {
    setGenerationStage(null);
    applyGenerationStatusState(
      buildDivisionGenerationCancelApplicationResult(null).generationStatus,
    );
    setValidationErrors((current) => ({ ...current, generation: message }));
  };

  const prepareAndBalance = async (
    plan: DivisionGenerationPlan,
    advanceStep: boolean,
    session: Session,
    communityCloudId: string | null,
    selectedPlayers: Player[],
  ) => {
    const token = preparationRef.current + 1;
    preparationRef.current = token;
    const isCancelled = () => preparationRef.current !== token;
    terminateWorker(workerRef.current);
    applyGenerationStatusState({ nextIsGenerating: true, nextProgress: 0 });
    setGenerationStage('session');

    const output = await prepareAuthorizedTeamFormation(
      {
        session,
        communityCloudId,
        players: selectedPlayers,
        teamCount: plan.updatedConfig.teamCount,
        config: plan.updatedConfig,
        createId: generateUUID,
        onStage: (stage) => {
          if (!isCancelled()) setGenerationStage(stage);
        },
        onSessionChange: (next) => {
          if (activeSessionIdRef.current === next.id) setActiveSession(next);
        },
        isCancelled,
      },
      authorizedFormationGateway,
    );

    if (isCancelled() || output.result === null) return;
    setGenerationStage(null);
    if (!output.result.ok) {
      stopGenerationWithError(output.result.error.message);
      return;
    }
    const cleared = clearCandidateSetPublication(output.session);
    if (cleared !== output.session && activeSessionIdRef.current === cleared.id) {
      setActiveSession(cleared);
    }
    setPublishedSetId(null);
    setPublicationError(null);
    setAuthorizedDraw({
      estimatedCount: output.result.value.estimatedCount,
      participantCount: output.result.value.participantCount,
    });
    startBalancing(
      { ...plan, request: { ...plan.request, request: output.result.value.request } },
      advanceStep,
    );
  };

  const generateDivisions = (advanceStep = true) => {
    const plan = buildDivisionGenerationPlan({
      activeSession,
      players,
      seed: Math.floor(Math.random() * 1000000),
      partnershipMatrix,
    });
    if (!plan || !activeSession) return;

    clearGenerationError();

    const authority = classifyFormationAuthority(activeSession, communities);
    if (authority.kind === 'local') {
      setAuthorizedDraw(null);
      updateSession(plan.sessionPatch);
      startBalancing(plan, advanceStep);
      return;
    }

    const session =
      buildSessionPatchResult({
        activeSession,
        patch: plan.sessionPatch,
        now: new Date().toISOString(),
      }) ?? activeSession;
    setActiveSession(session);

    const precheck = precheckAuthorizedSelection(session, players);
    if (!precheck.ok) {
      stopGenerationWithError(precheck.error.message);
      return;
    }
    void prepareAndBalance(plan, advanceStep, session, authority.communityCloudId, precheck.value);
  };

  const publishCandidateSet = async () => {
    if (!activeSession || bestDivisions.length === 0 || publicationBusy) return;
    setPublicationBusy(true);
    setPublicationError(null);
    const output = await publishTeamCandidateSet(
      {
        session: activeSession,
        divisions: bestDivisions,
        players,
        createId: generateUUID,
        onSessionChange: (next) => {
          if (activeSessionIdRef.current === next.id) setActiveSession(next);
        },
      },
      teamCandidateSetGateway,
    );
    setPublicationBusy(false);
    if (output.result.ok) {
      setPublishedSetId(output.result.value.setId);
    } else {
      setPublicationError(output.result.error.message);
    }
  };

  const publicationState: CandidateSetPublicationState = publicationBusy
    ? 'publishing'
    : publicationError
      ? 'error'
      : publishedSetId || activeSession?.authorizedFormation?.publishedCandidateSetId
        ? 'published'
        : 'idle';

  const cancelGeneration = () => {
    preparationRef.current += 1;
    setGenerationStage(null);
    const result = buildDivisionGenerationCancelApplicationResult(workerRef.current);
    terminateWorker(result.workerToTerminate);
    applyGenerationStatusState(result.generationStatus);
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

    const result = buildDivisionConfirmationApplicationResult({
      activeSession,
      division: currentDiv,
      sessions,
      teams,
      games,
      now: new Date().toISOString(),
      createGameId: generateUUID,
      generateTournamentSchedule,
    });

    setActiveSession(result.nextActiveSession);
    setSessions(result.nextSessions);
    setTeams(result.nextTeams);
    if (result.nextGames) setGames(result.nextGames);

    const completion = result.completion;
    completion.storageWrites.forEach((write) => {
      localStorage.setItem(STORAGE_KEYS[write.target], write.value);
    });

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
    preparationRef.current += 1;
    const request = buildWizardCancelRequestResult();
    const result = buildWizardCancelApplicationResult(confirm(request.confirmationMessage));
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
    generationStage,
    authorizedDraw,
    publishCandidateSet,
    publicationState,
    publicationError,
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
