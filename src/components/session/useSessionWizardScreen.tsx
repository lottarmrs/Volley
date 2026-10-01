import { useEffect, useState, useMemo } from 'react';
import { Player, Team, Position, RotationType } from '../../types';
import { resolveComposition } from '../../logic/balancing';
import {
  mapPlayerToBalanceSnapshot,
  recalculateDivisionDiagnostics,
} from '../../logic/balancingCompatibility';
import type { ScreenContract } from '@app/screens/screenContract';
import type { SessionWizardModel } from '@app/screens/sessionWizard/sessionWizardModel';
import type { SessionWizardIntent } from '@app/screens/sessionWizard/sessionWizardIntents';
import { generateTournamentSchedule, getTeamDisplayName } from '../../logic/tournament';
import { openWhatsAppShare, copyToClipboard, formatDrawForWhatsApp } from '../../logic/exporters';

export function useSessionWizardScreen(
  contract: ScreenContract<SessionWizardModel, SessionWizardIntent>,
) {
  const { model, dispatch } = contract;
  const {
    activeSession,
    players,
    communities,
    wizardStep,
    validationErrors,
    bestDivisions,
    selectedDivisionIndex,
    isGenerating,
    generationProgress,
    generationStage,
    authorizedDraw,
    publicationState,
    publicationError,
    partnershipMatrix,
    stepLabels,
    positionLabels,
    positionOrder,
  } = model;
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState<'all' | 'M' | 'F'>('all');
  const [positionFilter, setPositionFilter] = useState<'all' | Position>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'injured'>('all');
  const [communityFilter, setCommunityFilter] = useState<'all' | string>('all');
  const [showConstraintsModal, setShowConstraintsModal] = useState(false);
  const [constraintPlayerA, setConstraintPlayerA] = useState('');
  const [constraintPlayerB, setConstraintPlayerB] = useState('');
  const [constraintType, setConstraintType] = useState<'together' | 'separated'>('together');
  // Compartilhar/copiar sorteio: escolher o que incluir (independentes).
  const [shareIncludePositions, setShareIncludePositions] = useState(true);
  const [shareIncludeRatings, setShareIncludeRatings] = useState(true);
  // Drag & Drop state for team player swapping
  const [dragPlayerId, setDragPlayerId] = useState<string | null>(null);
  const [dragSourceTeamId, setDragSourceTeamId] = useState<string | null>(null);
  const [dropTargetTeamId, setDropTargetTeamId] = useState<string | null>(null);

  // Click-to-Move state for touch devices
  const [selectedMovePlayer, setSelectedMovePlayer] = useState<{
    playerId: string;
    sourceTeamId: string;
  } | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage((current) => (current === message ? null : current));
    }, 3000);
  };

  useEffect(() => {
    if (activeSession?.communityId) {
      setCommunityFilter(activeSession.communityId);
    }
  }, [activeSession?.communityId]);

  const handleShareSorteio = () => {
    if (bestDivisions.length === 0) return;
    const text = formatDrawForWhatsApp(activeSession?.name || 'Pelada', bestDivisions, players, {
      includePositions: shareIncludePositions,
      includeRatings: shareIncludeRatings,
      playerPositions,
    });
    openWhatsAppShare(text);
  };

  const handleCopySorteio = async () => {
    if (bestDivisions.length === 0) return;
    const text = formatDrawForWhatsApp(activeSession?.name || 'Pelada', bestDivisions, players, {
      includePositions: shareIncludePositions,
      includeRatings: shareIncludeRatings,
      playerPositions,
    });
    const ok = await copyToClipboard(text);
    if (ok) showToast('Sorteio copiado com sucesso!');
  };

  const handleShareSchedule = () => {
    if (bestDivisions.length === 0) return;
    const selectedDivision = bestDivisions[selectedDivisionIndex];
    const schedule = generateTournamentSchedule(
      selectedDivision.teams.map((t) => t.id),
      activeSession?.config?.type === 'tournament' ? activeSession.config.format : 'round_robin',
      activeSession?.config?.type === 'tournament' ? activeSession.config : undefined,
    );
    const teamName = (teamId: string) => getTeamDisplayName(teamId, selectedDivision.teams);

    const rounds = schedule.reduce<Record<number, typeof schedule>>((acc, match) => {
      acc[match.round] = acc[match.round] || [];
      acc[match.round].push(match);
      return acc;
    }, {});

    const formattedSchedule = Object.entries(rounds)
      .map(([round, matches]) => {
        const matchesText = matches
          .map(
            (match, idx) =>
              `Jogo ${idx + 1}: ${teamName(match.teamAId)} x ${teamName(match.teamBId)}`,
          )
          .join('\n');
        return `*Rodada ${round}*\n${matchesText}`;
      })
      .join('\n\n');

    const text = [
      `🏐 *Tabela de Jogos — Torneio ${activeSession?.name || ''}*`,
      ``,
      formattedSchedule,
      ``,
      `Acompanhe no Panelinha 🏐`,
    ].join('\n');

    openWhatsAppShare(text);
  };

  const handleCopySchedule = async () => {
    if (bestDivisions.length === 0) return;
    const selectedDivision = bestDivisions[selectedDivisionIndex];
    const schedule = generateTournamentSchedule(
      selectedDivision.teams.map((t) => t.id),
      activeSession?.config?.type === 'tournament' ? activeSession.config.format : 'round_robin',
      activeSession?.config?.type === 'tournament' ? activeSession.config : undefined,
    );
    const teamName = (teamId: string) => getTeamDisplayName(teamId, selectedDivision.teams);

    const rounds = schedule.reduce<Record<number, typeof schedule>>((acc, match) => {
      acc[match.round] = acc[match.round] || [];
      acc[match.round].push(match);
      return acc;
    }, {});

    const formattedSchedule = Object.entries(rounds)
      .map(([round, matches]) => {
        const matchesText = matches
          .map(
            (match, idx) =>
              `Jogo ${idx + 1}: ${teamName(match.teamAId)} x ${teamName(match.teamBId)}`,
          )
          .join('\n');
        return `*Rodada ${round}*\n${matchesText}`;
      })
      .join('\n\n');

    const text = [
      `🏐 *Tabela de Jogos — Torneio ${activeSession?.name || ''}*`,
      ``,
      formattedSchedule,
      ``,
      `Acompanhe no Panelinha 🏐`,
    ].join('\n');

    const ok = await copyToClipboard(text);
    if (ok) showToast('Tabela de jogos copiada!');
  };

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      if (!p.ativo && statusFilter !== 'injured') return false; // Hide inactive unless specifically looking for injured who might be inactive
      if (genderFilter !== 'all' && p.genero !== genderFilter) return false;
      if (positionFilter !== 'all' && p.posicaoPrincipal !== positionFilter) return false;
      if (statusFilter === 'active' && p.status.lesionado) return false;
      if (statusFilter === 'injured' && !p.status.lesionado) return false;
      if (communityFilter !== 'all' && !(p.communityIds ?? []).includes(communityFilter))
        return false;
      if (playerSearch && !p.nome.toLowerCase().includes(playerSearch.toLowerCase())) return false;
      return true;
    });
  }, [players, playerSearch, genderFilter, positionFilter, statusFilter, communityFilter]);

  const selectedPlayers = useMemo(() => {
    return players.filter((p) => activeSession?.selectedPlayerIds.includes(p.id));
  }, [players, activeSession?.selectedPlayerIds]);

  const rotationType: RotationType =
    (activeSession?.config as { rotationType?: RotationType } | undefined)?.rotationType ?? '6x0';

  const playerPositions =
    (activeSession?.config as { playerPositions?: Record<string, Position> } | undefined)
      ?.playerPositions ?? {};

  /** Posição efetiva do atleta nesta sessão: ajuste manual, com fallback no cadastro. */
  const getEffectivePosition = (p: Player): Position | null =>
    playerPositions[p.id] ?? p.posicaoPrincipal;

  const setPlayerPosition = (playerId: string, pos: Position) => {
    if (!activeSession?.config) return;
    dispatch({
      kind: 'updateSession',
      patch: {
        config: {
          ...activeSession.config,
          playerPositions: { ...playerPositions, [playerId]: pos },
        },
      },
    });
  };

  const rotationComposition = useMemo(() => {
    if (rotationType !== '5x1') return null;
    const teamCount = activeSession?.config?.teamCount ?? 0;
    if (teamCount <= 0 || selectedPlayers.length === 0) return null;
    // Respeita as posições ajustadas para a sessão na prévia da composição.
    const vectors = selectedPlayers.map((p) =>
      mapPlayerToBalanceSnapshot(p, playerPositions[p.id]),
    );
    return resolveComposition(vectors, teamCount);
  }, [rotationType, activeSession?.config?.teamCount, selectedPlayers, playerPositions]);

  const updateGeneratedTeam = (divisionIndex: number, teamId: string, patch: Partial<Team>) => {
    const next = bestDivisions.map((division, idx) => {
      if (idx !== divisionIndex) return division;
      const updatedTeams = division.teams.map((team) => {
        if (team.id !== teamId) return team;
        return { ...team, ...patch };
      });
      const updatedDivision = { ...division, teams: updatedTeams };
      return recalculateDivisionDiagnostics(
        updatedDivision,
        selectedPlayers,
        activeSession?.config,
        partnershipMatrix,
      );
    });
    dispatch({ kind: 'setBestDivisions', divisions: next });
  };

  const movePlayerBetweenGeneratedTeams = (
    divisionIndex: number,
    playerId: string,
    targetTeamId: string,
  ) => {
    const next = bestDivisions.map((division, idx) => {
      if (idx !== divisionIndex) return division;
      const nextTeams = division.teams.map((team) => ({
        ...team,
        playerIds:
          team.id === targetTeamId
            ? Array.from(new Set([...team.playerIds, playerId]))
            : team.playerIds.filter((id) => id !== playerId),
      }));
      const updatedDivision = { ...division, teams: nextTeams };
      return recalculateDivisionDiagnostics(
        updatedDivision,
        selectedPlayers,
        activeSession?.config,
        partnershipMatrix,
      );
    });
    dispatch({ kind: 'setBestDivisions', divisions: next });
  };

  const swapPlayersBetweenGeneratedTeams = (
    divisionIndex: number,
    player1Id: string,
    player2Id: string,
    team1Id: string,
    team2Id: string,
  ) => {
    const next = bestDivisions.map((division, idx) => {
      if (idx !== divisionIndex) return division;
      const nextTeams = division.teams.map((team) => {
        let nextPlayerIds = [...team.playerIds];
        if (team.id === team1Id) {
          nextPlayerIds = nextPlayerIds.map((id) => (id === player1Id ? player2Id : id));
        } else if (team.id === team2Id) {
          nextPlayerIds = nextPlayerIds.map((id) => (id === player2Id ? player1Id : id));
        }
        return {
          ...team,
          playerIds: nextPlayerIds,
        };
      });
      const updatedDivision = { ...division, teams: nextTeams };
      return recalculateDivisionDiagnostics(
        updatedDivision,
        selectedPlayers,
        activeSession?.config,
        partnershipMatrix,
      );
    });
    dispatch({ kind: 'setBestDivisions', divisions: next });
  };

  const handleSelectPlayerForMove = (
    playerId: string,
    sourceTeamId: string,
    isLocked?: boolean,
  ) => {
    if (isLocked) {
      showToast('Atleta fixado: remova o bloqueio para mover.');
      return;
    }

    if (selectedMovePlayer?.playerId === playerId) {
      setSelectedMovePlayer(null);
    } else if (selectedMovePlayer) {
      if (selectedMovePlayer.sourceTeamId !== sourceTeamId) {
        handleSwapSelectedPlayerWithTarget(playerId, sourceTeamId);
      } else {
        setSelectedMovePlayer({ playerId, sourceTeamId });
      }
    } else {
      setSelectedMovePlayer({ playerId, sourceTeamId });
    }
  };

  const handleCancelMoveSelection = () => {
    setSelectedMovePlayer(null);
  };

  const handleMoveSelectedPlayerToTeam = (targetTeamId: string) => {
    if (!selectedMovePlayer) return;

    const division = bestDivisions[selectedDivisionIndex];
    if (division) {
      const sourceTeam = division.teams.find((t) => t.id === selectedMovePlayer.sourceTeamId);
      const targetTeam = division.teams.find((t) => t.id === targetTeamId);
      if (sourceTeam && targetTeam) {
        const nextTargetSize = targetTeam.playerIds.length + 1;
        const nextSourceSize = sourceTeam.playerIds.length - 1;
        if (nextTargetSize - nextSourceSize > 1) {
          showToast(
            'Limite de tamanho: os times precisam manter tamanho equilibrado (diferença máxima 1).',
          );
          return;
        }
      }
    }

    movePlayerBetweenGeneratedTeams(
      selectedDivisionIndex,
      selectedMovePlayer.playerId,
      targetTeamId,
    );
    setSelectedMovePlayer(null);
  };

  const handleSwapSelectedPlayerWithTarget = (targetPlayerId: string, targetTeamId: string) => {
    if (!selectedMovePlayer) return;

    const targetPlayerIsLocked =
      activeSession?.config?.balanceConstraints?.lockedPlayerIdxs?.[targetPlayerId] !== undefined;
    if (targetPlayerIsLocked) {
      showToast('Atleta destino fixado: remova o bloqueio para trocar.');
      return;
    }

    swapPlayersBetweenGeneratedTeams(
      selectedDivisionIndex,
      selectedMovePlayer.playerId,
      targetPlayerId,
      selectedMovePlayer.sourceTeamId,
      targetTeamId,
    );
    setSelectedMovePlayer(null);
  };

  return {
    model,
    dispatch,
    showGuestModal,
    setShowGuestModal,
    playerSearch,
    setPlayerSearch,
    genderFilter,
    setGenderFilter,
    positionFilter,
    setPositionFilter,
    statusFilter,
    setStatusFilter,
    communityFilter,
    setCommunityFilter,
    showConstraintsModal,
    setShowConstraintsModal,
    constraintPlayerA,
    setConstraintPlayerA,
    constraintPlayerB,
    setConstraintPlayerB,
    constraintType,
    setConstraintType,
    shareIncludePositions,
    setShareIncludePositions,
    shareIncludeRatings,
    setShareIncludeRatings,
    dragPlayerId,
    setDragPlayerId,
    dragSourceTeamId,
    setDragSourceTeamId,
    dropTargetTeamId,
    setDropTargetTeamId,
    selectedMovePlayer,
    setSelectedMovePlayer,
    toastMessage,
    setToastMessage,
    showToast,
    handleShareSorteio,
    handleCopySorteio,
    handleShareSchedule,
    handleCopySchedule,
    filteredPlayers,
    selectedPlayers,
    rotationType,
    playerPositions,
    getEffectivePosition,
    setPlayerPosition,
    rotationComposition,
    updateGeneratedTeam,
    movePlayerBetweenGeneratedTeams,
    swapPlayersBetweenGeneratedTeams,
    handleSelectPlayerForMove,
    handleCancelMoveSelection,
    handleMoveSelectedPlayerToTeam,
    handleSwapSelectedPlayerWithTarget,
    activeSession,
    players,
    communities,
    wizardStep,
    validationErrors,
    bestDivisions,
    selectedDivisionIndex,
    isGenerating,
    generationProgress,
    generationStage,
    authorizedDraw,
    publicationState,
    publicationError,
    partnershipMatrix,
    stepLabels,
    positionLabels,
    positionOrder,
  };
}

export type SessionWizardScreen = ReturnType<typeof useSessionWizardScreen>;
