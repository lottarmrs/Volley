import React, { useState, useEffect, useRef } from 'react';
import {
  Session,
  Player,
  Team,
  Division,
  SessionStatus,
  FreePlayConfig,
  TournamentConfig,
} from '../types';
import { balanceTeams } from '../logic/balancing';
import type { BalanceRequest, BalanceResponse } from '../logic/balancerMessages';
import { saveSessionDraft, loadSessionDraft, clearSessionDraft } from '../logic/sessionDraft';
import { generateTournamentSchedule } from '../logic/tournament';
import { buildPartnershipMatrix } from '../logic/partnershipHistory';

interface UseSessionWizardProps {
  players: Player[];
  activeSession: Session | null;
  setActiveSession: (session: Session | null) => void;
  setSessions: React.Dispatch<React.SetStateAction<Session[]>>;
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  setGames: React.Dispatch<React.SetStateAction<any[]>>;
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
    const current = activeSession.selectedPlayerIds;
    const next = current.includes(playerId)
      ? current.filter((id) => id !== playerId)
      : [...current, playerId];
    updateSession({ selectedPlayerIds: next });
    if (validationErrors.players) setValidationErrors((prev) => ({ ...prev, players: '' }));
  };

  const selectAllActivePlayers = () => {
    const activeIds = players.filter((p) => p.ativo && !p.status.lesionado).map((p) => p.id);
    updateSession({ selectedPlayerIds: activeIds });
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
    if (!activeSession) return false;
    const errors: Record<string, string> = {};
    if (wizardStep === 0) {
      if (!activeSession.name.trim()) errors.name = 'O nome da sessão é obrigatório.';
      if (!activeSession.date) errors.date = 'A data é obrigatória.';
    } else if (wizardStep === 1) {
      if (activeSession.selectedPlayerIds.length < 4)
        errors.players = 'Selecione pelo menos 4 atletas.';
    } else if (wizardStep === 3) {
      const teamCount = activeSession.config?.teamCount ?? 0;
      const minPlayers = activeSession.type === 'tournament' ? 3 : 3;
      if (activeSession.selectedPlayerIds.length < teamCount * minPlayers) {
        errors.teamCount = `Para ${teamCount} times, selecione pelo menos ${teamCount * minPlayers} jogadores.`;
      }
      if (activeSession.type === 'free_play' && teamCount < 3) {
        errors.teamCount = 'Jogo livre exige pelo menos 3 times.';
      }
      if (activeSession.type === 'tournament' && teamCount < 2) {
        errors.teamCount = 'Torneio exige pelo menos 2 times.';
      }
      if (activeSession.type === 'tournament' && activeSession.config?.type === 'tournament') {
        const cfg = activeSession.config as TournamentConfig;
        if ((cfg.format === 'groups_knockout' || cfg.format === 'group_stage') && teamCount < 4) {
          errors.teamCount = 'Fase de grupos exige pelo menos 4 times.';
        }
      }
    }
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

    // Build partnership matrix if community ID exists
    const partnershipMatrix = activeSession.communityId
      ? buildPartnershipMatrix(
          sessions.filter((s) => s.communityId === activeSession.communityId),
          teams,
        )
      : undefined;

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
    const currentConstraints = activeSession.config.balanceConstraints || {};
    const lockedPlayerIdxs = { ...(currentConstraints.lockedPlayerIdxs || {}) };

    if (lockedPlayerIdxs[playerId] === teamIdx) {
      delete lockedPlayerIdxs[playerId];
    } else {
      lockedPlayerIdxs[playerId] = teamIdx;
    }

    const nextConfig = {
      ...activeSession.config,
      balanceConstraints: {
        ...currentConstraints,
        lockedPlayerIdxs,
      },
    };
    updateSession({ config: nextConfig });
  };

  const addPairConstraint = (p1: string, p2: string, type: 'together' | 'separated') => {
    if (!activeSession || !activeSession.config) return;
    const currentConstraints = activeSession.config.balanceConstraints || {};

    if (type === 'together') {
      const pairsTogether = [...(currentConstraints.pairsTogether || [])];
      if (!pairsTogether.some(([a, b]) => (a === p1 && b === p2) || (a === p2 && b === p1))) {
        pairsTogether.push([p1, p2]);
      }
      const nextConfig = {
        ...activeSession.config,
        balanceConstraints: {
          ...currentConstraints,
          pairsTogether,
        },
      };
      updateSession({ config: nextConfig });
    } else {
      const pairsSeparated = [...(currentConstraints.pairsSeparated || [])];
      if (!pairsSeparated.some(([a, b]) => (a === p1 && b === p2) || (a === p2 && b === p1))) {
        pairsSeparated.push([p1, p2]);
      }
      const nextConfig = {
        ...activeSession.config,
        balanceConstraints: {
          ...currentConstraints,
          pairsSeparated,
        },
      };
      updateSession({ config: nextConfig });
    }
  };

  const removePairConstraint = (p1: string, p2: string, type: 'together' | 'separated') => {
    if (!activeSession || !activeSession.config) return;
    const currentConstraints = activeSession.config.balanceConstraints || {};

    if (type === 'together') {
      const pairsTogether = (currentConstraints.pairsTogether || []).filter(
        ([a, b]) => !((a === p1 && b === p2) || (a === p2 && b === p1)),
      );
      const nextConfig = {
        ...activeSession.config,
        balanceConstraints: {
          ...currentConstraints,
          pairsTogether,
        },
      };
      updateSession({ config: nextConfig });
    } else {
      const pairsSeparated = (currentConstraints.pairsSeparated || []).filter(
        ([a, b]) => !((a === p1 && b === p2) || (a === p2 && b === p1)),
      );
      const nextConfig = {
        ...activeSession.config,
        balanceConstraints: {
          ...currentConstraints,
          pairsSeparated,
        },
      };
      updateSession({ config: nextConfig });
    }
  };

  const confirmDivision = () => {
    if (!activeSession || bestDivisions.length === 0) return;
    const currentDiv = bestDivisions[selectedDivisionIndex];

    let finalSession: Session;

    if (activeSession.type === 'tournament') {
      const cfg = activeSession.config as TournamentConfig;
      let updatedConfig = { ...cfg };
      if (cfg.format === 'groups_knockout' || cfg.format === 'group_stage') {
        const groupATeamIds = currentDiv.teams.filter((_, idx) => idx % 2 === 0).map((t) => t.id);
        const groupBTeamIds = currentDiv.teams.filter((_, idx) => idx % 2 === 1).map((t) => t.id);
        updatedConfig = {
          ...cfg,
          groups: [
            { id: 'A', name: 'Grupo A', teamIds: groupATeamIds },
            { id: 'B', name: 'Grupo B', teamIds: groupBTeamIds },
          ],
        };
      }

      const schedule = generateTournamentSchedule(
        currentDiv.teams.map((t) => t.id),
        cfg.format,
        cfg,
      );
      const scheduledGames = schedule.map((match, idx) => ({
        id: `game-${activeSession.id}-${idx}-${Date.now()}`,
        sessionId: activeSession.id,
        type: 'tournament' as const,
        sequenceNumber: idx + 1,
        round: match.round,
        stage: match.stage || ('group' as const),
        groupId: match.groupId || null,
        teamAId: match.teamAId,
        teamBId: match.teamBId,
        scoreA: 0,
        scoreB: 0,
        status: 'scheduled' as const,
        pointIds: [],
        startedAt: null,
        metadata: {
          originalTeamAId: match.teamAId,
          originalTeamBId: match.teamBId,
        },
      }));
      setGames((prev: any[]) => [
        ...prev.filter((g) => g.sessionId !== activeSession.id),
        ...scheduledGames,
      ]);

      finalSession = {
        ...activeSession,
        status: 'teams_generated' as SessionStatus,
        teamIds: currentDiv.teams.map((t) => t.id),
        config: updatedConfig,
        updatedAt: new Date().toISOString(),
      };
    } else {
      finalSession = {
        ...activeSession,
        status: 'active' as SessionStatus,
        teamIds: currentDiv.teams.map((t) => t.id),
        updatedAt: new Date().toISOString(),
        config: {
          ...(activeSession.config as FreePlayConfig),
          initialCourtTeams: [currentDiv.teams[0].id, currentDiv.teams[1].id] as [string, string],
          initialQueue: currentDiv.teams.slice(2).map((t) => t.id),
        },
      };
    }

    setActiveSession(finalSession);
    setSessions((prev) => [...prev.filter((s) => s.id !== finalSession.id), finalSession]);
    setTeams((prev) => [
      ...prev.filter((t) => t.sessionId !== finalSession.id),
      ...currentDiv.teams,
    ]);

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
  };
}
