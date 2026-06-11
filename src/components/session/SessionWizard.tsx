import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  Search,
  Filter,
  Users,
  Trash2,
  History,
  Trophy,
  Clock,
  Target,
  Zap,
  Info,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  Settings as SettingsIcon,
  Scale,
  RotateCw,
  Shield,
  Lock,
  Unlock,
  X,
  Share2,
  Copy,
} from 'lucide-react';
import {
  Session,
  Player,
  Team,
  Division,
  Position,
  Community,
  Game,
  RotationType,
} from '../../types';
import { resolveComposition, mapPlayerToAthleteVector } from '../../logic/balancing';
import { TournamentBracket } from '../tournament/TournamentBracket';
import { SessionWizardProgress } from './SessionWizardProgress';
import { SessionSetupSummary } from './SessionSetupSummary';
import { SelectablePlayerCard } from './cards/SelectablePlayerCard';
import { getSessionSetupWarnings } from '../../logic/setupWarnings';
import { calculateGeneralOverall, calculateTeamStrength } from '../../logic/calculations';
import { generateTournamentSchedule, getTeamDisplayName } from '../../logic/tournament';
import { openWhatsAppShare, copyToClipboard, formatDrawForWhatsApp } from '../../logic/exporters';
import { GuestPlayerModal } from '../player/GuestPlayerModal';

interface SessionWizardProps {
  activeSession: Session | null;
  players: Player[];
  communities: Community[];
  wizardStep: number;
  validationErrors: Record<string, string>;
  bestDivisions: Division[];
  setBestDivisions: React.Dispatch<React.SetStateAction<Division[]>>;
  selectedDivisionIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onCancel: () => void;
  onUpdateSession: (patch: Partial<Session>) => void;
  onTogglePlayer: (id: string) => void;
  onSelectAllActive: () => void;
  onClearSelection: () => void;
  onUseLastSelection: () => void;
  onGenerateDivisions: (advanceStep?: boolean) => void;
  onCancelGeneration: () => void;
  isGenerating: boolean;
  generationProgress: number;
  onConfirmDivision: () => void;
  onStartGeneratedTournament: () => void;
  setSelectedDivisionIndex: (i: number) => void;
  togglePlayerLock: (playerId: string, teamIdx: number) => void;
  addPairConstraint: (p1: string, p2: string, type: 'together' | 'separated') => void;
  removePairConstraint: (p1: string, p2: string, type: 'together' | 'separated') => void;
  onAddGuestPlayer: (player: Player, editDetails: boolean) => void;
}

const WIZARD_STEPS = [
  { id: 0, label: 'Sessão' },
  { id: 1, label: 'Atletas' },
  { id: 2, label: 'Formato' },
  { id: 3, label: 'Regras' },
  { id: 4, label: 'Revisão' },
  { id: 5, label: 'Times' },
  { id: 6, label: 'Tabela' },
];

export function SessionWizard({
  activeSession,
  players,
  communities,
  wizardStep,
  validationErrors,
  bestDivisions,
  setBestDivisions,
  selectedDivisionIndex,
  onNext,
  onPrev,
  onCancel,
  onUpdateSession,
  onTogglePlayer,
  onSelectAllActive,
  onClearSelection,
  onUseLastSelection,
  onGenerateDivisions,
  onCancelGeneration,
  isGenerating,
  generationProgress,
  onConfirmDivision,
  onStartGeneratedTournament,
  setSelectedDivisionIndex,
  togglePlayerLock,
  addPairConstraint,
  removePairConstraint,
  onAddGuestPlayer,
}: SessionWizardProps) {
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
  // Drag & Drop state for team player swapping
  const [dragPlayerId, setDragPlayerId] = useState<string | null>(null);
  const [dragSourceTeamId, setDragSourceTeamId] = useState<string | null>(null);
  const [dropTargetTeamId, setDropTargetTeamId] = useState<string | null>(null);

  useEffect(() => {
    if (activeSession?.communityId) {
      setCommunityFilter(activeSession.communityId);
    }
  }, [activeSession?.communityId]);

  const handleShareSorteio = () => {
    if (bestDivisions.length === 0) return;
    const text = formatDrawForWhatsApp(activeSession?.name || 'Sessão', bestDivisions, players);
    openWhatsAppShare(text);
  };

  const handleCopySorteio = async () => {
    if (bestDivisions.length === 0) return;
    const text = formatDrawForWhatsApp(activeSession?.name || 'Sessão', bestDivisions, players);
    const ok = await copyToClipboard(text);
    if (ok) alert('Sorteio copiado!');
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
    if (ok) alert('Tabela copiada!');
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

  const rotationComposition = useMemo(() => {
    if (rotationType !== '5x1') return null;
    const teamCount = activeSession?.config?.teamCount ?? 0;
    if (teamCount <= 0 || selectedPlayers.length === 0) return null;
    return resolveComposition(selectedPlayers.map(mapPlayerToAthleteVector), teamCount);
  }, [rotationType, activeSession?.config?.teamCount, selectedPlayers]);

  const updateGeneratedTeam = (divisionIndex: number, teamId: string, patch: Partial<Team>) => {
    setBestDivisions((prev) =>
      prev.map((division, idx) => {
        if (idx !== divisionIndex) return division;
        return {
          ...division,
          teams: division.teams.map((team) => {
            if (team.id !== teamId) return team;
            const updated = { ...team, ...patch };
            const teamPlayers = players.filter((player) => updated.playerIds.includes(player.id));
            return { ...updated, strengthSnapshot: calculateTeamStrength(teamPlayers) };
          }),
        };
      }),
    );
  };

  const movePlayerBetweenGeneratedTeams = (
    divisionIndex: number,
    playerId: string,
    targetTeamId: string,
  ) => {
    setBestDivisions((prev) =>
      prev.map((division, idx) => {
        if (idx !== divisionIndex) return division;
        const nextTeams = division.teams
          .map((team) => ({
            ...team,
            playerIds:
              team.id === targetTeamId
                ? Array.from(new Set([...team.playerIds, playerId]))
                : team.playerIds.filter((id) => id !== playerId),
          }))
          .map((team) => ({
            ...team,
            strengthSnapshot: calculateTeamStrength(
              players.filter((player) => team.playerIds.includes(player.id)),
            ),
          }));
        return { ...division, teams: nextTeams };
      }),
    );
  };

  if (!activeSession) return null;

  const renderStep = () => {
    switch (wizardStep) {
      case 0: // Details
        return (
          <div className="space-y-6">
            <div className="card card-border bg-base-200">
              <div className="card-body space-y-6">
                <h3 className="card-title text-sm font-bold uppercase text-base-content tracking-[0.2em] border-b border-base-300 pb-4">
                  Informações da Sessão
                </h3>
                <div className="space-y-6">
                  <div className="fieldset">
                    <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest">
                      Nome da Sessão
                    </label>
                    <input
                      type="text"
                      value={activeSession.name}
                      onChange={(e) => onUpdateSession({ name: e.target.value })}
                      className={`input input-bordered w-full ${validationErrors.name ? 'input-error' : ''}`}
                      placeholder="Ex: Vôlei de Domingo"
                    />
                    {validationErrors.name && (
                      <p className="text-[10px] font-bold text-error uppercase mt-1">
                        {validationErrors.name}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="fieldset">
                      <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest">
                        Data do Evento
                      </label>
                      <input
                        type="date"
                        value={activeSession.date}
                        onChange={(e) => onUpdateSession({ date: e.target.value })}
                        className={`input input-bordered w-full font-mono ${validationErrors.date ? 'input-error' : ''}`}
                      />
                    </div>
                    <div className="fieldset">
                      <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest">
                        Local (Opcional)
                      </label>
                      <input
                        type="text"
                        value={activeSession.location ?? ''}
                        onChange={(e) => onUpdateSession({ location: e.target.value })}
                        className="input input-bordered w-full"
                        placeholder="Ex: Arena Pro"
                      />
                    </div>
                  </div>

                  <div className="fieldset">
                    <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest">
                      Observações (Opcional)
                    </label>
                    <textarea
                      value={activeSession.notes ?? ''}
                      onChange={(e) => onUpdateSession({ notes: e.target.value })}
                      className="textarea textarea-bordered w-full min-h-[100px] resize-none"
                      placeholder="Detalhes sobre a reserva, convidados, etc."
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  onCancel();
                }}
                className="btn btn-ghost flex-1"
              >
                Cancelar
              </button>
              <button type="button" onClick={onNext} className="btn btn-primary flex-[3]">
                Escolher Atletas
              </button>
            </div>
          </div>
        );

      case 1: {
        // Player Selection
        const avgOverall =
          selectedPlayers.length > 0
            ? Math.round(
                selectedPlayers.reduce((acc, p) => acc + calculateGeneralOverall(p), 0) /
                  selectedPlayers.length,
              )
            : 0;
        const avgHeight =
          selectedPlayers.length > 0
            ? Math.round(
                selectedPlayers.reduce((acc, p) => acc + (p.alturaCm || 0), 0) /
                  selectedPlayers.filter((p) => !!p.alturaCm).length,
              ) || 0
            : 0;
        const injuredCount = selectedPlayers.filter((p) => p.status.lesionado).length;

        return (
          <div className="space-y-6">
            {/* Summary Bar */}
            <div className="stats stats-vertical sm:stats-horizontal shadow w-full bg-base-200 border border-base-300">
              {[
                {
                  label: 'Selecionados',
                  val: selectedPlayers.length,
                  color: 'text-base-content',
                  icon: <Users className="w-5 h-5 text-primary" />,
                },
                {
                  label: 'Média Power',
                  val: avgOverall,
                  color: 'text-accent',
                  icon: <Zap className="w-5 h-5 text-accent" />,
                },
                {
                  label: 'Média Altura',
                  val: `${avgHeight}cm`,
                  color: 'text-base-content',
                  icon: <Scale className="w-5 h-5 text-info" />,
                },
                {
                  label: 'Lesionados',
                  val: injuredCount,
                  color: injuredCount > 0 ? 'text-error font-bold' : 'text-text-muted',
                  icon: (
                    <AlertTriangle
                      className={`w-5 h-5 ${injuredCount > 0 ? 'text-error' : 'text-text-muted/70'}`}
                    />
                  ),
                },
              ].map((s) => (
                <div key={s.label} className="stat">
                  <div className="stat-figure">{s.icon}</div>
                  <div className="stat-title text-[9px] font-bold uppercase tracking-wider">
                    {s.label}
                  </div>
                  <div className={`stat-value text-xl font-mono ${s.color}`}>{s.val}</div>
                </div>
              ))}
            </div>

            {/* Filters Card */}
            <div className="card card-border bg-base-200">
              <div className="card-body p-5 space-y-4">
                {/* Search & Selector Dropdowns */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Search Input */}
                  <label className="input input-bordered flex items-center gap-2 w-full">
                    <Search className="w-4 h-4 opacity-70" />
                    <input
                      type="text"
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      placeholder="Buscar atleta por nome..."
                      className="grow text-xs"
                    />
                  </label>

                  {/* Dropdowns */}
                  <div className="flex flex-wrap sm:flex-nowrap gap-3">
                    {/* Position Filter */}
                    <div className="flex-1 min-w-[130px] fieldset">
                      <label className="fieldset-legend text-[9px] font-bold uppercase text-text-muted">
                        Posição
                      </label>
                      <select
                        value={positionFilter}
                        onChange={(e) => setPositionFilter(e.target.value as any)}
                        className="select select-bordered w-full select-sm uppercase text-[10px]"
                      >
                        <option value="all">Todas</option>
                        <option value="levantador">Levantador</option>
                        <option value="oposto">Oposto</option>
                        <option value="ponteiro">Ponteiro</option>
                        <option value="central">Central</option>
                        <option value="libero">Líbero</option>
                        <option value="all-rounder">Coringa</option>
                      </select>
                    </div>

                    {/* Community Filter */}
                    <div className="flex-1 min-w-[130px] fieldset">
                      <label className="fieldset-legend text-[9px] font-bold uppercase text-text-muted">
                        Comunidade
                      </label>
                      <select
                        value={communityFilter}
                        onChange={(e) => setCommunityFilter(e.target.value)}
                        disabled={communities.length === 0}
                        className="select select-bordered w-full select-sm uppercase text-[10px]"
                      >
                        <option value="all">Todas</option>
                        {communities.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Segmented Button Filters & Quick Actions */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-base-300">
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Gender Filter */}
                    <div className="join">
                      {(
                        [
                          ['all', 'Todos Gêneros'],
                          ['M', 'Masc'],
                          ['F', 'Fem'],
                        ] as const
                      ).map(([g, label]) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setGenderFilter(g)}
                          className={`btn btn-xs join-item ${genderFilter === g ? 'btn-active btn-neutral' : 'btn-ghost'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Status Filter */}
                    <div className="join">
                      {(
                        [
                          ['all', 'Todos Status'],
                          ['active', 'Saudáveis'],
                          ['injured', 'Lesionados'],
                        ] as const
                      ).map(([s, label]) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStatusFilter(s)}
                          className={`btn btn-xs join-item ${statusFilter === s ? 'btn-active btn-neutral' : 'btn-ghost'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowGuestModal(true)}
                      className="btn btn-xs btn-primary font-bold uppercase"
                    >
                      + Convidado
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const healthyActiveFilteredIds = filteredPlayers
                          .filter((p) => p.ativo && !p.status.lesionado)
                          .map((p) => p.id);
                        onUpdateSession({ selectedPlayerIds: healthyActiveFilteredIds });
                      }}
                      className="btn btn-xs btn-outline"
                    >
                      Selecionar Filtrados
                    </button>
                    <button
                      type="button"
                      onClick={onUseLastSelection}
                      className="btn btn-xs btn-outline btn-accent text-accent"
                    >
                      Última Lista
                    </button>
                    <button
                      type="button"
                      onClick={onClearSelection}
                      className="btn btn-xs btn-outline btn-error text-error"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredPlayers.map((p) => (
                <SelectablePlayerCard
                  key={p.id}
                  player={p}
                  isSelected={activeSession.selectedPlayerIds.includes(p.id)}
                  onToggle={() => onTogglePlayer(p.id)}
                  communities={communities}
                />
              ))}
              {filteredPlayers.length === 0 && (
                <div className="col-span-full py-12 text-center card card-border bg-base-200 border-dashed">
                  <div className="card-body items-center justify-center">
                    <p className="text-text-muted text-xs uppercase font-bold">
                      Nenhum jogador encontrado com estes filtros.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {validationErrors.players && (
              <div role="alert" className="alert alert-error alert-soft">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span className="text-xs font-bold uppercase">{validationErrors.players}</span>
              </div>
            )}

            <div className="flex gap-4 pt-4 border-t border-base-300">
              <button
                type="button"
                onClick={() => {
                  onPrev();
                }}
                className="btn btn-ghost flex-1"
              >
                Dados Básicos
              </button>
              <button onClick={onNext} className="btn btn-primary flex-[2]">
                Continuar
              </button>
            </div>
          </div>
        );
      }

      case 2: // Mode Selection
        return (
          <div className="space-y-8 py-4">
            <div className="text-center space-y-2 mb-4">
              <h3 className="text-sm font-bold uppercase text-accent tracking-[0.4em]">
                ESCOLHA O FORMATO DO EVENTO
              </h3>
              <p className="text-[10px] text-text-muted uppercase font-bold italic">
                O formato define como os times serão organizados em quadra
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <button
                onClick={() => {
                  onUpdateSession({
                    type: 'free_play',
                    config: {
                      type: 'free_play',
                      teamCount: 3,
                      maxPoints: 15,
                      tieBreakMethod: 'direct_3',
                      rotationSystem: 'winner_stays',
                      maxConsecutiveGames: 3,
                      initialCourtTeams: ['', ''],
                      initialQueue: [],
                      queuePolicy: 'fifo',
                      balanceSpeed: 'advanced',
                    },
                  });
                  onNext();
                }}
                className={`card card-border cursor-pointer text-left hover:scale-[1.02] transition-all bg-base-200 ${activeSession.type === 'free_play' ? 'border-accent bg-accent/5' : 'hover:border-accent/30'}`}
              >
                <div className="card-body items-center text-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
                    <Clock className="w-8 h-8 text-accent" />
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <h4 className="card-title font-bold uppercase text-lg text-base-content">
                        Jogo Livre
                      </h4>
                      <span className="badge badge-accent badge-sm uppercase font-bold">
                        Recomendado
                      </span>
                    </div>
                    <p className="text-xs text-text-muted uppercase font-bold leading-relaxed max-w-xs mx-auto">
                      Ideal para noite dinâmica. Dois times jogam, os demais ficam em fila. O
                      sistema controla rotação, vitórias e pontuação.
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  onUpdateSession({
                    type: 'tournament',
                    config: {
                      type: 'tournament',
                      format: 'round_robin',
                      teamCount: 3,
                      useGroupStage: false,
                      roundTrip: false,
                      maxPoints: 15,
                      tieBreakMethod: 'direct_3',
                      victoryRule: 'direct_3',
                      hasFinal: false,
                      hasThirdPlaceMatch: false,
                      classificationPoints: { win: 3, loss: 0, walkoverWin: 3, walkoverLoss: 0 },
                      standingsRules: [
                        'classificationPoints',
                        'wins',
                        'pointDifference',
                        'pointsFor',
                        'headToHead',
                        'pointsAgainst',
                      ],
                      balanceSpeed: 'advanced',
                    },
                  });
                  onNext();
                }}
                className={`card card-border cursor-pointer text-left hover:scale-[1.02] transition-all bg-base-200 ${activeSession.type === 'tournament' ? 'border-primary bg-primary/5' : 'hover:border-primary/30'}`}
              >
                <div className="card-body items-center text-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Trophy className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <h4 className="card-title font-bold uppercase text-lg text-base-content">
                        Torneio
                      </h4>
                      <span className="badge badge-primary badge-sm uppercase font-bold">Novo</span>
                    </div>
                    <p className="text-xs text-text-muted uppercase font-bold leading-relaxed max-w-xs mx-auto">
                      Tabela de classificação, rodadas completas em rodízio e campeão da noite.
                      Todos jogam contra todos.
                    </p>
                  </div>
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                onPrev();
              }}
              className="btn btn-ghost btn-sm w-full"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Voltar para Seleção de Atletas
            </button>
          </div>
        );

      case 3: {
        // Config
        const config = activeSession.config;
        if (!config) return null;

        return (
          <div className="space-y-6">
            <div className="card card-border bg-base-200">
              <div className="card-body p-6 space-y-6">
                <div className="flex items-center gap-3 border-b border-base-300 pb-4">
                  <SettingsIcon className="w-5 h-5 text-accent" />
                  <div>
                    <h3 className="card-title text-sm font-bold uppercase tracking-widest text-base-content">
                      {activeSession.type === 'free_play'
                        ? 'Regras do Jogo Livre'
                        : 'Regras do Torneio'}
                    </h3>
                    <p className="text-[9px] text-text-muted uppercase font-bold">
                      Ajuste os parâmetros da noite
                    </p>
                  </div>
                </div>

                <div className="space-y-6">
                  {activeSession.type === 'tournament' && (
                    <div className="space-y-6">
                      <div className="fieldset">
                        <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest mb-3">
                          Formato do Torneio
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                          {[
                            {
                              id: 'round_robin',
                              label: 'Todos contra todos',
                              desc: 'Cada time joga contra todos os outros em turno único.',
                              icon: <Users className="w-5 h-5 text-accent" />,
                              badge: 'Clássico',
                            },
                            {
                              id: 'double_round_robin',
                              label: 'Turno e returno',
                              desc: 'Cada time enfrenta os adversários duas vezes (jogos de ida e volta).',
                              icon: <RotateCw className="w-5 h-5 text-primary" />,
                              badge: 'Competitivo',
                            },
                            {
                              id: 'knockout',
                              label: 'Mata-mata',
                              desc: 'Chaveamento de eliminação direta de alta tensão.',
                              icon: <Trophy className="w-5 h-5 text-warning" />,
                              badge: 'Tensão Máxima',
                            },
                            {
                              id: 'group_stage',
                              label: 'Fase de grupos',
                              desc: 'Times divididos em dois grupos (Grupo A/B) disputando classificação.',
                              icon: <Scale className="w-5 h-5 text-info" />,
                              badge: 'Novo',
                            },
                            {
                              id: 'groups_knockout',
                              label: 'Grupos + mata-mata',
                              desc: 'Fase de grupos inicial seguida por semifinais e finais emocionantes.',
                              icon: <Sparkles className="w-5 h-5 text-success" />,
                              badge: 'Completo',
                            },
                          ].map((f) => {
                            const isSelected = (config as any).format === f.id;
                            return (
                              <button
                                key={f.id}
                                type="button"
                                onClick={() =>
                                  onUpdateSession({ config: { ...(config as any), format: f.id } })
                                }
                                className={`card card-border cursor-pointer text-left hover:scale-[1.01] transition-all p-4 bg-base-200 border border-base-300 flex flex-row items-start gap-4 ${
                                  isSelected
                                    ? 'border-accent bg-accent/5'
                                    : 'hover:border-accent/30'
                                }`}
                              >
                                <div className="w-10 h-10 rounded-xl bg-base-300 flex items-center justify-center shrink-0 mt-1">
                                  {f.icon}
                                </div>
                                <div className="flex-1 space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-bold uppercase text-xs text-base-content">
                                      {f.label}
                                    </span>
                                    {f.badge && (
                                      <span
                                        className={`badge badge-[8px] px-1.5 py-0.5 rounded uppercase font-bold text-[8px] ${
                                          isSelected
                                            ? 'badge-accent'
                                            : 'bg-base-300 text-text-muted border-none'
                                        }`}
                                      >
                                        {f.badge}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-text-muted uppercase leading-relaxed font-semibold">
                                    {f.desc}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {((config as any).format === 'knockout' ||
                        (config as any).format === 'groups_knockout') && (
                        <div className="fieldset pt-4 border-t border-base-300">
                          <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest mb-3">
                            Fases do Mata-Mata
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <label className="label cursor-pointer justify-start gap-3 bg-neutral/40 p-4 rounded-xl flex-1 border border-base-300 hover:border-accent/30 transition-all">
                              <input
                                type="checkbox"
                                className="checkbox checkbox-primary checkbox-sm"
                                checked={(config as any).hasFinal !== false}
                                onChange={(e) =>
                                  onUpdateSession({
                                    config: { ...(config as any), hasFinal: e.target.checked },
                                  })
                                }
                              />
                              <div>
                                <span className="label-text text-xs font-bold uppercase block text-base-content">
                                  Grande Final
                                </span>
                                <span className="text-[9px] text-text-muted uppercase block font-semibold mt-0.5">
                                  Decidir o campeão em jogo único
                                </span>
                              </div>
                            </label>
                            <label className="label cursor-pointer justify-start gap-3 bg-neutral/40 p-4 rounded-xl flex-1 border border-base-300 hover:border-accent/30 transition-all">
                              <input
                                type="checkbox"
                                className="checkbox checkbox-secondary checkbox-sm"
                                checked={(config as any).hasThirdPlaceMatch !== false}
                                onChange={(e) =>
                                  onUpdateSession({
                                    config: {
                                      ...(config as any),
                                      hasThirdPlaceMatch: e.target.checked,
                                    },
                                  })
                                }
                              />
                              <div>
                                <span className="label-text text-xs font-bold uppercase block text-base-content">
                                  Disputa de 3º Lugar
                                </span>
                                <span className="text-[9px] text-text-muted uppercase block font-semibold mt-0.5">
                                  Jogo entre perdedores da semi
                                </span>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Team Count */}
                  <div className="fieldset">
                    <div className="flex justify-between items-end w-full mb-1">
                      <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest">
                        Quantidade de Times
                      </label>
                      <span className="text-[9px] font-bold text-accent uppercase tracking-tighter italic">
                        Cada time terá em média{' '}
                        {(selectedPlayers.length / config.teamCount).toFixed(1)} atletas
                      </span>
                    </div>
                    <div className="join w-full">
                      {[2, 3, 4, 5, 6].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => onUpdateSession({ config: { ...config, teamCount: n } })}
                          disabled={activeSession.type === 'free_play' && n < 3}
                          className={`btn join-item flex-1 font-mono font-bold text-sm ${config.teamCount === n ? 'btn-accent' : 'btn-neutral'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    {activeSession.type === 'free_play' && config.teamCount < 3 && (
                      <p className="text-[9px] text-warning font-bold uppercase italic mt-1">
                        O modo jogo livre requer pelo menos 3 equipes para gerenciar a fila.
                      </p>
                    )}
                  </div>

                  {/* Points & TieBreak */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div className="fieldset">
                      <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest mb-2">
                        Pontos por Jogo
                      </label>
                      <div className="grid grid-cols-2 gap-2 w-full">
                        {[12, 15, 21, 25].map((pts) => (
                          <button
                            key={pts}
                            type="button"
                            onClick={() =>
                              onUpdateSession({ config: { ...config, maxPoints: pts } })
                            }
                            className={`btn btn-sm ${config.maxPoints === pts ? 'btn-neutral' : 'btn-ghost btn-outline'}`}
                          >
                            {pts} Pts
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="fieldset">
                      <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest mb-2">
                        Formato de Vitória
                      </label>
                      <div className="flex flex-col gap-2 w-full">
                        {[
                          {
                            id: 'direct_3',
                            icon: <Target className="w-3.5 h-3.5" />,
                            label: '3 Direto',
                            tip: 'Quando empatar perto do ponto final, joga até 3 pontos extras.',
                          },
                          {
                            id: 'win_by_2',
                            icon: <Scale className="w-3.5 h-3.5" />,
                            label: 'Vai a 2',
                            tip: 'O jogo só termina quando um time abrir 2 pontos de vantagem.',
                          },
                        ].map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() =>
                              onUpdateSession({
                                config:
                                  activeSession.type === 'tournament'
                                    ? {
                                        ...(config as any),
                                        tieBreakMethod: m.id,
                                        victoryRule: m.id,
                                      }
                                    : { ...(config as any), tieBreakMethod: m.id },
                              })
                            }
                            className={`btn text-left p-3 h-auto block ${config.tieBreakMethod === m.id ? 'btn-primary' : 'btn-neutral'}`}
                          >
                            <div className="flex items-center gap-2">
                              {m.icon}
                              <span className="text-xs font-bold uppercase tracking-widest">
                                {m.label}
                              </span>
                            </div>
                            <span className="text-[9px] font-medium uppercase opacity-70 leading-relaxed block mt-1">
                              {m.tip}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Rotation Rules (Free Play) */}
                  {activeSession.type === 'free_play' && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-6 pt-4 border-t border-base-300"
                    >
                      <div className="fieldset">
                        <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest mb-2">
                          Sistema de Rotação em Fila
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSession({
                                config: { ...(config as any), rotationSystem: 'winner_stays' },
                              })
                            }
                            className={`btn text-left p-4 h-auto block ${(config as any).rotationSystem === 'winner_stays' ? 'btn-success btn-soft' : 'btn-neutral'}`}
                          >
                            <div className="flex items-center gap-2">
                              <Zap className="w-4 h-4 text-success" />
                              <span className="text-[10px] font-bold uppercase">Ganhou Fica</span>
                            </div>
                            <p className="text-[8px] opacity-70 uppercase font-bold mt-1">
                              Vencedor permanece até perder.
                            </p>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateSession({
                                config: {
                                  ...(config as any),
                                  rotationSystem: 'max_consecutive_games',
                                },
                              })
                            }
                            className={`btn text-left p-4 h-auto block ${(config as any).rotationSystem === 'max_consecutive_games' ? 'btn-info btn-soft' : 'btn-neutral'}`}
                          >
                            <div className="flex items-center gap-2">
                              <RotateCw className="w-4 h-4 text-info" />
                              <span className="text-[10px] font-bold uppercase">
                                Limite de Jogos
                              </span>
                            </div>
                            <p className="text-[8px] opacity-70 uppercase font-bold mt-1">
                              Sai após atingir limite de jogos.
                            </p>
                          </button>
                        </div>
                      </div>

                      {(config as any).rotationSystem === 'max_consecutive_games' && (
                        <div className="fieldset">
                          <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest mb-2">
                            Partidas máximas consecutivas
                          </label>
                          <div className="join w-full">
                            {[1, 2, 3, 4, 5].map((n) => (
                              <button
                                key={n}
                                type="button"
                                onClick={() =>
                                  onUpdateSession({
                                    config: { ...(config as any), maxConsecutiveGames: n },
                                  })
                                }
                                className={`btn join-item flex-1 font-mono font-bold text-sm ${(config as any).maxConsecutiveGames === n ? 'btn-info' : 'btn-neutral'}`}
                              >
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Anti-Repetição (Rotação Social) */}
                  <div className="fieldset pt-4 border-t border-base-300">
                    <label className="label cursor-pointer justify-start gap-3 bg-neutral/40 p-4 rounded-xl flex-1 border border-base-300 hover:border-accent/30 transition-all">
                      <input
                        type="checkbox"
                        className="toggle toggle-primary toggle-sm"
                        checked={((config as any).repetitionWeight ?? 0) > 0}
                        onChange={(e) => {
                          onUpdateSession({
                            config: {
                              ...config,
                              repetitionWeight: e.target.checked ? 0.8 : 0,
                            } as any,
                          });
                        }}
                      />
                      <div className="flex-1">
                        <span className="label-text text-xs font-bold uppercase block text-base-content">
                          Misturar o grupo (Anti-Repetição)
                        </span>
                        <span className="text-[9px] text-text-muted uppercase block font-semibold mt-0.5">
                          Evita repetir as mesmas parcerias de sessões anteriores
                        </span>
                      </div>
                    </label>

                    {((config as any).repetitionWeight ?? 0) > 0 && (
                      <div className="mt-3 pl-2 space-y-2">
                        <label className="text-[9px] font-bold uppercase text-text-muted tracking-wider">
                          Intensidade da Mistura
                        </label>
                        <div className="join w-full">
                          {[
                            { label: 'Leve', value: 0.4 },
                            { label: 'Normal', value: 0.8 },
                            { label: 'Intensa', value: 1.6 },
                          ].map((opt) => (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() =>
                                onUpdateSession({
                                  config: {
                                    ...config,
                                    repetitionWeight: opt.value,
                                  } as any,
                                })
                              }
                              className={`btn btn-xs join-item flex-1 font-bold ${
                                (config as any).repetitionWeight === opt.value ? 'btn-primary' : 'btn-neutral'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {validationErrors.teamCount && (
                  <div role="alert" className="alert alert-error alert-soft mt-4">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-tight">
                      {validationErrors.teamCount}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  onPrev();
                }}
                className="btn btn-ghost flex-1 text-xs"
              >
                Voltar
              </button>
              <button onClick={onNext} className="btn btn-primary flex-[2]">
                Revisar Sessão
              </button>
            </div>
          </div>
        );
      }

      case 4: {
        // Review
        const warnings = getSessionSetupWarnings(activeSession, selectedPlayers);

        return (
          <div className="space-y-6">
            <div className="card card-border bg-base-200">
              <div className="card-body p-6 space-y-6">
                <div className="flex items-center gap-3 border-b border-base-300 pb-4">
                  <Sparkles className="w-5 h-5 text-accent" />
                  <h3 className="card-title text-sm font-bold uppercase tracking-widest text-base-content">
                    Revisão Final
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-6">
                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase text-text-muted tracking-widest border-l-2 border-accent pl-2">
                      Dados do Evento
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between border-b border-base-300/40 pb-1">
                        <span className="text-[10px] font-bold text-text-muted uppercase">
                          Nome
                        </span>
                        <span className="text-[10px] font-bold text-base-content uppercase">
                          {activeSession.name}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-base-300/40 pb-1">
                        <span className="text-[10px] font-bold text-text-muted uppercase">
                          Data
                        </span>
                        <span className="text-[10px] font-bold text-base-content uppercase font-mono">
                          {activeSession.date}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-base-300/40 pb-1">
                        <span className="text-[10px] font-bold text-text-muted uppercase">
                          Local
                        </span>
                        <span className="text-[10px] font-bold text-base-content uppercase">
                          {activeSession.location || 'Não definido'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-[10px] font-bold uppercase text-text-muted tracking-widest border-l-2 border-success pl-2">
                      Formato & Regras
                    </p>
                    <div className="space-y-2">
                      <div className="flex justify-between border-b border-base-300/40 pb-1">
                        <span className="text-[10px] font-bold text-text-muted uppercase">
                          Tipo
                        </span>
                        <span className="text-[10px] font-bold text-base-content uppercase">
                          {activeSession.type === 'free_play' ? 'Jogo Livre' : 'Torneio'}
                        </span>
                      </div>
                      {activeSession.type === 'tournament' && (
                        <div className="flex justify-between border-b border-base-300/40 pb-1">
                          <span className="text-[10px] font-bold text-text-muted uppercase">
                            Formato
                          </span>
                          <span className="text-[10px] font-bold text-base-content uppercase">
                            {(activeSession.config as any).format === 'round_robin'
                              ? 'Todos contra todos'
                              : (activeSession.config as any).format === 'double_round_robin'
                                ? 'Turno e Returno'
                                : (activeSession.config as any).format === 'knockout'
                                  ? 'Mata-mata'
                                  : (activeSession.config as any).format === 'group_stage'
                                    ? 'Fase de Grupos'
                                    : (activeSession.config as any).format === 'groups_knockout'
                                      ? 'Grupos + Mata-mata'
                                      : 'Torneio'}
                          </span>
                        </div>
                      )}
                      {activeSession.type === 'tournament' &&
                        ((activeSession.config as any).format === 'knockout' ||
                          (activeSession.config as any).format === 'groups_knockout') && (
                          <>
                            <div className="flex justify-between border-b border-base-300/40 pb-1">
                              <span className="text-[10px] font-bold text-text-muted uppercase">
                                Grande Final
                              </span>
                              <span className="text-[10px] font-bold text-base-content uppercase">
                                {(activeSession.config as any).hasFinal !== false ? 'Sim' : 'Não'}
                              </span>
                            </div>
                            <div className="flex justify-between border-b border-base-300/40 pb-1">
                              <span className="text-[10px] font-bold text-text-muted uppercase">
                                Disputa de 3º Lugar
                              </span>
                              <span className="text-[10px] font-bold text-base-content uppercase">
                                {(activeSession.config as any).hasThirdPlaceMatch !== false
                                  ? 'Sim'
                                  : 'Não'}
                              </span>
                            </div>
                          </>
                        )}
                      <div className="flex justify-between border-b border-base-300/40 pb-1">
                        <span className="text-[10px] font-bold text-text-muted uppercase">
                          Times
                        </span>
                        <span className="text-[10px] font-bold text-base-content uppercase">
                          {activeSession.config?.teamCount} Equipes
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-base-300/40 pb-1">
                        <span className="text-[10px] font-bold text-text-muted uppercase">
                          Pontos
                        </span>
                        <span className="text-[10px] font-bold text-base-content uppercase font-mono">
                          {activeSession.config?.maxPoints} Pontos
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-base-300/40 pb-1">
                        <span className="text-[10px] font-bold text-text-muted uppercase">
                          Regra
                        </span>
                        <span className="text-[10px] font-bold text-base-content uppercase">
                          {activeSession.config?.tieBreakMethod === 'direct_3'
                            ? '3 direto'
                            : 'Vai a 2'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-base-300/40 pb-1">
                        <span className="text-[10px] font-bold text-text-muted uppercase">
                          Anti-Repetição
                        </span>
                        <span className="text-[10px] font-bold text-base-content uppercase">
                          {!((activeSession.config as any)?.repetitionWeight ?? 0)
                            ? 'Desativado'
                            : (activeSession.config as any).repetitionWeight === 0.4
                              ? 'Leve'
                              : (activeSession.config as any).repetitionWeight === 0.8
                                ? 'Normal'
                                : 'Intenso'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 sm:col-span-2 pt-4 border-t border-base-300">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-text-muted tracking-widest border-l-2 border-accent pl-2 font-bold">
                        Configurações do Balanceamento Inteligente
                      </p>
                      <p className="text-[9px] text-text-muted/75 uppercase font-bold mt-1.5 pl-2 leading-relaxed">
                        O app analisa os atributos dos atletas e testa diferentes combinações para
                        formar times mais equilibrados.
                      </p>
                    </div>

                    <div className="w-full">
                      {/* Perfil de Balanceamento */}
                      <div className="fieldset">
                        <label className="fieldset-legend text-[9px] font-bold uppercase text-text-muted tracking-wider mb-2">
                          Perfil Técnico
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                          {[
                            { id: 'balanced', label: 'Equilibrado', desc: 'Distribuição geral' },
                            { id: 'competitive', label: 'Competitivo', desc: 'Foco técnico total' },
                            { id: 'social', label: 'Social', desc: 'Gênero e tamanho' },
                            { id: 'mixed', label: 'Misto', desc: 'Cota de gênero' },
                          ].map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() =>
                                onUpdateSession({
                                  config: { ...(activeSession.config as any), balanceMode: m.id },
                                })
                              }
                              className={`btn btn-sm text-left h-auto block p-2 ${(activeSession.config as any)?.balanceMode === m.id || (!(activeSession.config as any)?.balanceMode && m.id === 'balanced') ? 'btn-accent' : 'btn-neutral'}`}
                            >
                              <span className="text-[9px] font-bold uppercase block">
                                {m.label}
                              </span>
                              <span className="text-[7px] lowercase opacity-70 block mt-0.5 leading-none">
                                {m.desc}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Sistema de Rotação (6x0 / 5x1) */}
                    <div className="w-full">
                      <div className="fieldset">
                        <label className="fieldset-legend text-[9px] font-bold uppercase text-text-muted tracking-wider mb-2">
                          Sistema de Rotação
                        </label>
                        <div className="grid grid-cols-2 gap-2 w-full">
                          {[
                            {
                              id: '6x0' as RotationType,
                              label: '6x0',
                              desc: 'Todos levantam',
                            },
                            {
                              id: '5x1' as RotationType,
                              label: '5x1',
                              desc: 'Levantador fixo',
                            },
                          ].map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() =>
                                onUpdateSession({
                                  config: {
                                    ...(activeSession.config as any),
                                    rotationType: r.id,
                                  },
                                })
                              }
                              className={`btn btn-sm text-left h-auto block p-2 ${
                                rotationType === r.id ? 'btn-accent' : 'btn-neutral'
                              }`}
                            >
                              <span className="text-[9px] font-bold uppercase block">
                                {r.label}
                              </span>
                              <span className="text-[7px] lowercase opacity-70 block mt-0.5 leading-none">
                                {r.desc}
                              </span>
                            </button>
                          ))}
                        </div>

                        {rotationType === '5x1' && rotationComposition && (
                          <div className="mt-2 space-y-1.5">
                            <p className="text-[8px] font-bold uppercase text-text-muted/80 tracking-wider">
                              Composição por time:{' '}
                              <span className="text-base-content">
                                {rotationComposition.perTeam.levantador} Levantador ·{' '}
                                {rotationComposition.perTeam.ponteiro} Ponteiros ·{' '}
                                {rotationComposition.perTeam.oposto} Oposto ·{' '}
                                {rotationComposition.perTeam.central} Central
                                {rotationComposition.perTeam.libero > 0
                                  ? ` · ${rotationComposition.perTeam.libero} Líbero`
                                  : ''}
                              </span>
                            </p>
                            {rotationComposition.warnings.map((w, i) => (
                              <p
                                key={i}
                                className="text-[8px] font-bold uppercase text-warning tracking-tight italic leading-tight"
                              >
                                {w}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {warnings.length > 0 && (
                  <div className="space-y-3 pt-4 border-t border-base-300">
                    <p className="text-[10px] font-bold uppercase text-warning tracking-widest flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5" /> Analise de Pré-Jogo
                    </p>
                    <div className="space-y-2">
                      {warnings.map((w, i) => (
                        <div key={i} role="alert" className="alert alert-warning alert-soft p-3">
                          <span className="text-[10px] text-base-content/80 font-bold uppercase leading-relaxed tracking-tighter italic">
                            {w}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!warnings.length && (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <div className="w-12 h-12 rounded-full bg-success/15 flex items-center justify-center mb-3">
                      <CheckCircle2 className="w-6 h-6 text-success" />
                    </div>
                    <p className="text-[10px] font-bold text-success uppercase tracking-widest">
                      Sessão estruturada com sucesso!
                    </p>
                  </div>
                )}
              </div>
            </div>

            {isGenerating ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase text-text-muted tracking-widest flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse text-accent" /> Equilibrando os
                    times…
                  </p>
                  <span className="text-[10px] font-mono font-bold text-accent">
                    {generationProgress}%
                  </span>
                </div>
                <progress
                  className="progress progress-accent w-full"
                  value={generationProgress}
                  max={100}
                />
                <p className="text-[9px] text-text-muted/80 uppercase font-semibold leading-normal mt-1 p-3 bg-neutral/30 rounded-xl border border-base-300">
                  ℹ️ Estamos testando milhares de combinações para achar o time mais equilibrado. Isso pode levar alguns segundos — quanto maior o grupo, um pouquinho mais.
                </p>
                <button
                  type="button"
                  onClick={onCancelGeneration}
                  className="btn btn-ghost btn-sm w-full text-xs"
                >
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
              </div>
            ) : (
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => {
                    onPrev();
                  }}
                  className="btn btn-ghost flex-1 text-xs"
                >
                  Voltar às Regras
                </button>
                <button onClick={onGenerateDivisions} className="btn btn-accent flex-[2] group">
                  Gerar Times Equilibrados{' '}
                  <Sparkles className="w-4 h-4 inline-block ml-2 group-hover:animate-pulse" />
                </button>
              </div>
            )}
          </div>
        );
      }

      case 5: {
        // Results
        if (bestDivisions.length === 0) return null;
        const currentDiv = bestDivisions[selectedDivisionIndex];

        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-center gap-2 mb-4 bg-base-200 p-2 rounded-2xl border border-base-300">
              {bestDivisions.map((div, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedDivisionIndex(i)}
                  className={`btn btn-sm ${selectedDivisionIndex === i ? 'btn-accent' : 'btn-ghost'}`}
                >
                  {div.qualityLabel || `Opção ${i + 1}`}
                  <span className="badge badge-sm font-mono">{div.score.toFixed(0)}pts</span>
                </button>
              ))}
              <div className="divider divider-horizontal mx-1 hidden sm:flex" />
              <button
                onClick={() => onGenerateDivisions(false)}
                disabled={isGenerating}
                className="btn btn-sm btn-ghost btn-circle"
                title="Regerar equipes com as travas/restrições atuais"
              >
                {isGenerating ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={() => setShowConstraintsModal(true)}
                className="btn btn-sm btn-outline"
              >
                <SettingsIcon className="w-3.5 h-3.5" />{' '}
                <span className="hidden sm:inline">Vínculos de Atletas</span>
              </button>
              <div className="divider divider-horizontal mx-1 hidden sm:flex" />
              <button
                onClick={handleShareSorteio}
                className="btn btn-sm btn-success btn-soft text-success"
              >
                <Share2 className="w-3.5 h-3.5" />{' '}
                <span className="hidden sm:inline">Compartilhar</span>
              </button>
              <button onClick={handleCopySorteio} className="btn btn-sm btn-outline">
                <Copy className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Copiar</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {currentDiv.teams.map((team, tIdx) => (
                <div
                  key={tIdx}
                  className="card card-border bg-base-200 overflow-hidden border-t-8 shadow-2xl"
                  style={{
                    borderTopColor:
                      team.color ||
                      ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#8b5cf6'][tIdx % 5],
                  }}
                >
                  <div className="p-5 flex justify-between items-center border-b border-base-300">
                    <div>
                      <h3 className="card-title font-bold uppercase tracking-tight text-xl text-base-content">
                        {team.name}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <input
                          value={team.name}
                          onChange={(e) =>
                            updateGeneratedTeam(selectedDivisionIndex, team.id, {
                              name: e.target.value,
                            })
                          }
                          className="input input-xs input-bordered w-32"
                          aria-label="Editar nome do time"
                        />
                        <input
                          type="color"
                          value={
                            team.color ||
                            ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#8b5cf6'][tIdx % 5]
                          }
                          onChange={(e) =>
                            updateGeneratedTeam(selectedDivisionIndex, team.id, {
                              color: e.target.value,
                            })
                          }
                          className="w-8 h-6 rounded cursor-pointer border border-base-300"
                          aria-label="Trocar cor do time"
                        />
                      </div>
                      <div className="flex gap-2 mt-2">
                        <span className="badge badge-xs badge-info font-bold uppercase">
                          {team.strengthSnapshot.maleCount}M
                        </span>
                        <span className="badge badge-xs badge-secondary font-bold uppercase">
                          {team.strengthSnapshot.femaleCount}F
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-bold font-mono text-base-content leading-none tracking-tighter">
                        {Math.round(team.strengthSnapshot.overall)}
                      </span>
                      <p className="text-[8px] uppercase text-text-muted font-bold tracking-widest mt-1">
                        RATING GERAL
                      </p>
                    </div>
                  </div>
                  <div
                    className={`p-4 space-y-1.5 bg-base-100/50 min-h-[160px] rounded-b-xl transition-colors ${
                      dropTargetTeamId === team.id && dragSourceTeamId !== team.id
                        ? 'bg-primary/10 ring-2 ring-primary ring-inset'
                        : ''
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropTargetTeamId(team.id);
                    }}
                    onDragLeave={() => setDropTargetTeamId(null)}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragPlayerId && dragSourceTeamId && dragSourceTeamId !== team.id) {
                        movePlayerBetweenGeneratedTeams(
                          selectedDivisionIndex,
                          dragPlayerId,
                          team.id,
                        );
                      }
                      setDragPlayerId(null);
                      setDragSourceTeamId(null);
                      setDropTargetTeamId(null);
                    }}
                  >
                    {dropTargetTeamId === team.id && dragSourceTeamId !== team.id && (
                      <div className="flex items-center justify-center h-8 rounded-lg border-2 border-dashed border-primary/50 text-[9px] font-bold uppercase text-primary/60 mb-1">
                        Soltar aqui
                      </div>
                    )}
                    {team.playerIds.map((pid) => {
                      const p = players.find((x) => x.id === pid);
                      if (!p) return null;
                      const isLocked =
                        activeSession.config?.balanceConstraints?.lockedPlayerIdxs?.[p.id] === tIdx;
                      const isDragging = dragPlayerId === p.id;
                      return (
                        <div
                          key={p.id}
                          draggable={!isLocked}
                          onDragStart={() => {
                            setDragPlayerId(p.id);
                            setDragSourceTeamId(team.id);
                          }}
                          onDragEnd={() => {
                            setDragPlayerId(null);
                            setDragSourceTeamId(null);
                            setDropTargetTeamId(null);
                          }}
                          className={`flex justify-between items-center p-2 rounded-lg border transition-all ${
                            isDragging
                              ? 'opacity-40 border-primary bg-primary/10'
                              : 'bg-base-300/30 border-base-300/60 hover:bg-base-300/60'
                          } ${!isLocked ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-1.5 h-6 rounded-full ${p.genero === 'M' ? 'bg-info' : 'bg-secondary'}`}
                            />
                            {!isLocked && (
                              <span
                                className="text-base-content/20 select-none"
                                title="Arrastar para mover"
                              >
                                ⠿
                              </span>
                            )}
                            <span className="font-bold text-[11px] uppercase text-base-content truncate max-w-[110px]">
                              {p.nome}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-bold text-base-content/40 uppercase">
                              {p.posicaoPrincipal}
                            </span>
                            <span className="font-bold font-mono text-sm text-accent/80">
                              {calculateGeneralOverall(p)}
                            </span>
                            <button
                              type="button"
                              onClick={() => togglePlayerLock(p.id, tIdx)}
                              className={`btn btn-xs btn-ghost btn-circle ${isLocked ? 'text-accent' : 'text-base-content/30 hover:text-base-content'}`}
                              title={isLocked ? 'Desafixar atleta' : 'Fixar atleta neste time'}
                            >
                              {isLocked ? (
                                <Lock className="w-3.5 h-3.5" />
                              ) : (
                                <Unlock className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="p-3 bg-base-300/40 grid grid-cols-4 gap-1">
                    {[
                      { label: 'ATQ', val: Math.round(team.strengthSnapshot.attack) },
                      { label: 'DEF', val: Math.round(team.strengthSnapshot.defense) },
                      { label: 'LEV', val: Math.round(team.strengthSnapshot.setting) },
                      { label: 'RED', val: Math.round(team.strengthSnapshot.netPresence) },
                    ].map((s) => (
                      <div key={s.label} className="text-center">
                        <p className="text-[7px] font-bold text-text-muted uppercase">{s.label}</p>
                        <p className="text-[10px] font-bold font-mono text-base-content/50">
                          {s.val}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {currentDiv.diagnostics && (
              <div className="card card-border bg-base-200">
                <div className="card-body p-6 space-y-6">
                  <div className="border-b border-base-300 pb-4">
                    <h4 className="card-title text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                      <Shield className="w-4 h-4 text-accent" /> DIAGNÓSTICO DE EQUILÍBRIO
                    </h4>
                    <p className="text-[9px] text-text-muted/75 uppercase font-bold mt-1 leading-relaxed">
                      A divisão considera força geral, ataque, defesa, levantamento, bloqueio,
                      altura, gênero, forma atual e condição física.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Visual Speedometer Gauge */}
                    <div className="flex flex-col items-center justify-center bg-base-100 p-4 rounded-xl border border-base-300 text-center">
                      <p className="text-[8px] font-bold text-text-muted uppercase tracking-wider mb-2">
                        QUALIDADE DO EQUILÍBRIO
                      </p>
                      {(() => {
                        const q = currentDiv.diagnostics.qualityLabel;
                        let gaugeColor = '#10B981';
                        let label = 'Excelente';
                        let needleRotation = 60; // degrees from -90 to 90
                        let scoreColor = 'text-success';

                        if (q === 'GOOD') {
                          gaugeColor = '#3b82f6';
                          label = 'Boa';
                          needleRotation = 20;
                          scoreColor = 'text-info';
                        } else if (q === 'ACCEPTABLE') {
                          gaugeColor = '#f59e0b';
                          label = 'Aceitável';
                          needleRotation = -20;
                          scoreColor = 'text-warning';
                        } else if (q === 'UNBALANCED') {
                          gaugeColor = '#ef4444';
                          label = 'Desequilibrada';
                          needleRotation = -60;
                          scoreColor = 'text-error';
                        }

                        return (
                          <div className="flex flex-col items-center gap-3">
                            {/* Speedometer Gauge SVG — half-circle, pivot at center */}
                            <svg viewBox="0 0 100 55" className="w-36 h-auto" aria-hidden="true">
                              {/* Background arc */}
                              <path
                                d="M 10 50 A 40 40 0 0 1 90 50"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="7"
                                strokeLinecap="round"
                                className="text-base-300"
                              />
                              {/* Colored arc — full always shown, segments via strokeDasharray */}
                              <path
                                d="M 10 50 A 40 40 0 0 1 90 50"
                                fill="none"
                                stroke={gaugeColor}
                                strokeWidth="7"
                                strokeLinecap="round"
                                strokeDasharray={`${Math.round(((needleRotation + 90) / 180) * 125.6)} 125.6`}
                              />
                              {/* Needle — rotates from -90 (left) to +90 (right) */}
                              <g transform={`translate(50,50) rotate(${needleRotation})`}>
                                <line
                                  x1="0"
                                  y1="4"
                                  x2="0"
                                  y2="-34"
                                  stroke={gaugeColor}
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                />
                                <circle cx="0" cy="0" r="4" fill={gaugeColor} />
                                <circle cx="0" cy="0" r="2" fill="var(--color-base-200)" />
                              </g>
                            </svg>

                            {/* Value Display */}
                            <div className="text-center -mt-1">
                              <span
                                className={`text-[13px] font-black uppercase tracking-wider ${scoreColor}`}
                              >
                                {label}
                              </span>
                              <p className="text-[9px] font-mono text-base-content/50 mt-0.5">
                                Diferença: {currentDiv.score.toFixed(0)} pts
                              </p>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Dispersion Metrics */}
                    <div className="space-y-2">
                      <p className="text-[8px] font-bold text-text-muted tracking-wider">
                        MÉTRICAS DE DISPERSÃO (DIFERENÇA MÁXIMA)
                      </p>
                      <div className="space-y-1.5 bg-base-100 p-4 rounded-xl border border-base-300 text-[10px] font-mono uppercase">
                        <div className="flex justify-between">
                          <span className="text-text-muted">Força Geral:</span>
                          <span className="text-base-content font-bold">
                            {currentDiv.diagnostics.overallSpread.toFixed(1)} pts
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Ataque:</span>
                          <span className="text-base-content font-bold">
                            {currentDiv.diagnostics.attackSpread.toFixed(1)} pts
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Defesa:</span>
                          <span className="text-base-content font-bold">
                            {currentDiv.diagnostics.defenseSpread.toFixed(1)} pts
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Levantamento:</span>
                          <span className="text-base-content font-bold">
                            {currentDiv.diagnostics.settingSpread.toFixed(1)} pts
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Altura Média:</span>
                          <span className="text-base-content font-bold">
                            {Math.round(currentDiv.diagnostics.heightSpread)} cm
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Engine Metadata */}
                    <div className="space-y-2">
                      <p className="text-[8px] font-bold text-text-muted tracking-wider">
                        METADADOS DO MOTOR (SA)
                      </p>
                      <div className="space-y-1.5 bg-base-100 p-4 rounded-xl border border-base-300 text-[10px] font-mono uppercase">
                        <div className="flex justify-between">
                          <span className="text-text-muted">Algoritmo:</span>
                          <span
                            className="text-base-content font-bold text-[8px] truncate max-w-[110px]"
                            title={currentDiv.algorithm}
                          >
                            Smart Balance Engine
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Iterações:</span>
                          <span className="text-base-content font-bold">
                            {currentDiv.iterations} / 25k
                          </span>
                        </div>
                        <div className="flex justify-between text-text-muted">
                          <span>Tempo:</span>
                          <span className="text-base-content font-bold">
                            {currentDiv.runtimeMillis} ms
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-text-muted">Seed:</span>
                          <span className="text-base-content font-bold font-mono">
                            {currentDiv.seed}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {currentDiv.explanation && currentDiv.explanation.length > 0 && (
                    <div className="space-y-2 pt-4 border-t border-base-300">
                      <p className="text-[8px] font-bold text-text-muted tracking-wider">
                        ANÁLISE DE EQUILÍBRIO & ALERTAS
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {currentDiv.explanation.map((exp, i) => {
                          const isWarning =
                            exp.includes('sem') ||
                            exp.includes('Desequilíbrio') ||
                            exp.includes('vulnerabilidade') ||
                            exp.includes('múltiplos') ||
                            exp.includes('Não foi possível');
                          return (
                            <div
                              key={i}
                              role="alert"
                              className={`alert ${isWarning ? 'alert-warning alert-soft' : 'alert-success alert-soft'} p-2 items-start`}
                            >
                              {isWarning ? (
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0 mt-0.5" />
                              )}
                              <span className="text-[9px] italic font-bold uppercase leading-relaxed tracking-tighter block text-left">
                                {exp}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => {
                  onPrev();
                }}
                className="btn btn-ghost flex-1 text-xs"
              >
                Voltar
              </button>
              <button onClick={onConfirmDivision} className="btn btn-primary flex-[2]">
                Gerar tabela
              </button>
            </div>
          </div>
        );
      }

      case 6: {
        // Generated schedule
        if (bestDivisions.length === 0) return null;
        const selectedDivision = bestDivisions[selectedDivisionIndex];
        const schedule = generateTournamentSchedule(
          selectedDivision.teams.map((t) => t.id),
          activeSession.config?.type === 'tournament' ? activeSession.config.format : 'round_robin',
          activeSession.config?.type === 'tournament' ? activeSession.config : undefined,
        );
        const teamName = (teamId: string) => getTeamDisplayName(teamId, selectedDivision.teams);
        const rounds = schedule.reduce<Record<number, typeof schedule>>((acc, match) => {
          acc[match.round] = acc[match.round] || [];
          acc[match.round].push(match);
          return acc;
        }, {});

        const format =
          activeSession.config?.type === 'tournament' ? activeSession.config.format : 'round_robin';
        const dummyGames: Game[] = schedule.map((match, idx) => ({
          id: `dummy-${idx}`,
          sessionId: activeSession.id,
          type: 'tournament',
          sequenceNumber: idx + 1,
          round: match.round,
          stage: match.stage || 'group',
          groupId: match.groupId || null,
          teamAId: match.teamAId,
          teamBId: match.teamBId,
          scoreA: 0,
          scoreB: 0,
          status: 'scheduled',
          pointIds: [],
          startedAt: null,
        }));

        return (
          <div className="space-y-6">
            <div className="card card-border bg-base-200">
              <div className="card-body p-6 space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-base-300 pb-4">
                  <div>
                    <h3 className="card-title text-sm font-bold uppercase tracking-widest text-base-content">
                      Tabela gerada
                    </h3>
                    <p className="text-[10px] text-text-muted uppercase mt-1">
                      {schedule.length} jogos | {Object.keys(rounds).length} rodadas |{' '}
                      {format === 'round_robin'
                        ? 'Todos contra todos'
                        : format === 'double_round_robin'
                          ? 'Turno e returno'
                          : format === 'knockout'
                            ? 'Mata-mata'
                            : format === 'group_stage'
                              ? 'Fase de grupos'
                              : 'Grupos + mata-mata'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleShareSchedule}
                      className="btn btn-sm btn-success btn-soft text-success"
                    >
                      <Share2 className="w-3.5 h-3.5" />{' '}
                      <span className="hidden sm:inline">Compartilhar Tabela</span>
                    </button>
                    <button onClick={handleCopySchedule} className="btn btn-sm btn-outline">
                      <Copy className="w-3.5 h-3.5" />{' '}
                      <span className="hidden sm:inline">Copiar Tabela</span>
                    </button>
                    <Trophy className="w-5 h-5 text-accent" />
                  </div>
                </div>

                {format === 'knockout' || format === 'groups_knockout' ? (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                      <TournamentBracket games={dummyGames} teams={selectedDivision.teams} />
                    </div>
                    <div className="lg:col-span-1 space-y-4 max-h-[440px] overflow-y-auto pr-2">
                      {Object.entries(rounds).map(([round, matches]) => (
                        <div key={round} className="space-y-2">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-accent">
                            Rodada {round}
                          </p>
                          {matches.map((match, index) => (
                            <div
                              key={`${match.teamAId}-${match.teamBId}`}
                              className="flex items-center justify-between p-3 bg-base-100 border border-base-300 rounded-xl"
                            >
                              <span className="text-[9px] font-mono text-text-muted">
                                Jogo {index + 1}
                              </span>
                              <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-base-content">
                                <span className="truncate max-w-[70px]">
                                  {teamName(match.teamAId)}
                                </span>
                                <span className="text-accent">x</span>
                                <span className="truncate max-w-[70px]">
                                  {teamName(match.teamBId)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[440px] overflow-y-auto pr-2">
                    {Object.entries(rounds).map(([round, matches]) => (
                      <div key={round} className="space-y-2">
                        <p className="text-[9px] font-bold uppercase tracking-widest text-accent">
                          Rodada {round}
                        </p>
                        {matches.map((match, index) => (
                          <div
                            key={`${match.teamAId}-${match.teamBId}`}
                            className="flex items-center justify-between p-3 bg-base-100 border border-base-300 rounded-xl"
                          >
                            <span className="text-[9px] font-mono text-text-muted">
                              Jogo {index + 1}
                            </span>
                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase text-base-content">
                              <span>{teamName(match.teamAId)}</span>
                              <span className="text-accent">x</span>
                              <span>{teamName(match.teamBId)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-4">
              <button type="button" onClick={onPrev} className="btn btn-ghost flex-1 text-xs">
                Voltar aos times
              </button>
              <button onClick={onStartGeneratedTournament} className="btn btn-primary flex-[2]">
                Iniciar torneio
              </button>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8">
        <button
          type="button"
          onClick={() => {
            onCancel();
          }}
          className="btn btn-ghost btn-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Cancelar Criação</span>
        </button>

        <div className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-accent animate-pulse" />
          <span className="text-[10px] font-bold uppercase text-base-content tracking-[0.3em]">
            Setup de Sessão
          </span>
          <div className="badge badge-neutral font-mono text-[8px]"> v1.2</div>
        </div>
      </div>

      <SessionWizardProgress currentStep={wizardStep} steps={WIZARD_STEPS} />

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
        <motion.div
          key={wizardStep}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="min-h-[500px]"
        >
          {renderStep()}
        </motion.div>

        <div className="hidden lg:block">
          <SessionSetupSummary session={activeSession} selectedPlayers={selectedPlayers} />
        </div>
      </div>

      <AnimatePresence>
        {showConstraintsModal && (
          <div className="modal modal-open fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="modal-box relative w-full max-w-xl bg-base-200 border border-base-300 rounded-2xl shadow-2xl p-6 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex justify-between items-center border-b border-base-300 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <SettingsIcon className="w-5 h-5 text-accent" />
                  <div>
                    <h3 className="card-title text-sm font-bold uppercase tracking-widest text-base-content">
                      Vínculos de Atletas
                    </h3>
                    <p className="text-[9px] text-text-muted uppercase font-bold">
                      Defina relacionamentos entre atletas
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConstraintsModal(false)}
                  className="btn btn-ghost btn-circle btn-sm"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4 overflow-y-auto pr-1 flex-1 custom-scrollbar">
                <div className="bg-base-100 p-4 rounded-xl border border-base-300 space-y-3">
                  <h4 className="text-[10px] font-bold text-base-content/70 uppercase tracking-wider">
                    Novo Vínculo
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="fieldset">
                      <label className="fieldset-legend text-[8px] font-bold uppercase text-text-muted tracking-widest">
                        Atleta A
                      </label>
                      <select
                        value={constraintPlayerA}
                        onChange={(e) => setConstraintPlayerA(e.target.value)}
                        className="select select-sm select-bordered w-full text-xs text-base-content"
                      >
                        <option value="">Selecione o Atleta A...</option>
                        {selectedPlayers.map((p) => (
                          <option key={p.id} value={p.id} disabled={p.id === constraintPlayerB}>
                            {p.apelido || p.nome} ({p.posicaoPrincipal})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="fieldset">
                      <label className="fieldset-legend text-[8px] font-bold uppercase text-text-muted tracking-widest">
                        Atleta B
                      </label>
                      <select
                        value={constraintPlayerB}
                        onChange={(e) => setConstraintPlayerB(e.target.value)}
                        className="select select-sm select-bordered w-full text-xs text-base-content"
                      >
                        <option value="">Selecione o Atleta B...</option>
                        {selectedPlayers.map((p) => (
                          <option key={p.id} value={p.id} disabled={p.id === constraintPlayerA}>
                            {p.apelido || p.nome} ({p.posicaoPrincipal})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="fieldset">
                    <label className="fieldset-legend text-[8px] font-bold uppercase text-text-muted tracking-widest mb-1">
                      Tipo de Vínculo
                    </label>
                    <div className="join w-full">
                      <button
                        type="button"
                        onClick={() => setConstraintType('together')}
                        className={`btn btn-sm join-item flex-1 ${constraintType === 'together' ? 'btn-accent' : 'btn-neutral'}`}
                      >
                        Jogar Juntos
                      </button>
                      <button
                        type="button"
                        onClick={() => setConstraintType('separated')}
                        className={`btn btn-sm join-item flex-1 ${constraintType === 'separated' ? 'btn-primary' : 'btn-neutral'}`}
                      >
                        Forçar Separação
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (
                        constraintPlayerA &&
                        constraintPlayerB &&
                        constraintPlayerA !== constraintPlayerB
                      ) {
                        addPairConstraint(constraintPlayerA, constraintPlayerB, constraintType);
                        setConstraintPlayerA('');
                        setConstraintPlayerB('');
                      }
                    }}
                    disabled={!constraintPlayerA || !constraintPlayerB}
                    className="btn btn-neutral btn-sm w-full"
                  >
                    Vincular Atletas
                  </button>
                </div>

                <div className="space-y-2.5">
                  <h4 className="text-[10px] font-bold text-base-content/70 uppercase tracking-wider">
                    Vínculos Ativos
                  </h4>

                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                    {!activeSession.config?.balanceConstraints?.pairsTogether?.length &&
                      !activeSession.config?.balanceConstraints?.pairsSeparated?.length && (
                        <p className="text-[9px] text-text-muted uppercase font-bold text-center py-4 border border-dashed border-base-300 rounded-xl">
                          Nenhum vínculo ativo configurado.
                        </p>
                      )}

                    {activeSession.config?.balanceConstraints?.pairsTogether?.map(
                      ([p1, p2], idx) => {
                        const player1 = players.find((p) => p.id === p1);
                        const player2 = players.find((p) => p.id === p2);
                        if (!player1 || !player2) return null;
                        return (
                          <div
                            key={`together-${idx}`}
                            className="flex justify-between items-center p-3 rounded-lg bg-success/10 border border-success/20 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-success" />
                              <span className="font-bold text-base-content/90">
                                {player1.apelido || player1.nome}
                              </span>
                              <span className="text-text-muted">&</span>
                              <span className="font-bold text-base-content/90">
                                {player2.apelido || player2.nome}
                              </span>
                              <span className="badge badge-success badge-xs uppercase ml-2">
                                Juntos
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removePairConstraint(p1, p2, 'together')}
                              className="btn btn-ghost btn-xs btn-circle text-error hover:bg-error/10"
                              title="Remover vínculo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      },
                    )}

                    {activeSession.config?.balanceConstraints?.pairsSeparated?.map(
                      ([p1, p2], idx) => {
                        const player1 = players.find((p) => p.id === p1);
                        const player2 = players.find((p) => p.id === p2);
                        if (!player1 || !player2) return null;
                        return (
                          <div
                            key={`separated-${idx}`}
                            className="flex justify-between items-center p-3 rounded-lg bg-error/10 border border-error/20 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-error" />
                              <span className="font-bold text-base-content/90">
                                {player1.apelido || player1.nome}
                              </span>
                              <span className="text-text-muted">&</span>
                              <span className="font-bold text-base-content/90">
                                {player2.apelido || player2.nome}
                              </span>
                              <span className="badge badge-error badge-xs uppercase ml-2">
                                Separados
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removePairConstraint(p1, p2, 'separated')}
                              className="btn btn-ghost btn-xs btn-circle text-error hover:bg-error/10"
                              title="Remover vínculo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      },
                    )}
                  </div>
                </div>
              </div>

              <div className="modal-action mt-6 pt-4 border-t border-base-300">
                <button
                  type="button"
                  onClick={() => setShowConstraintsModal(false)}
                  className="btn btn-neutral w-full"
                >
                  Fechar Vínculos
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <GuestPlayerModal
        isOpen={showGuestModal}
        onClose={() => setShowGuestModal(false)}
        players={players}
        onAddGuestPlayer={onAddGuestPlayer}
        defaultCommunityId={activeSession?.communityId}
      />
    </div>
  );
}
