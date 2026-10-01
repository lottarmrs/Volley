import { ScheduleSessionPanel } from '../ScheduleSessionPanel';
import { Search, Users, Zap, AlertTriangle, Scale, X } from 'lucide-react';
import { Player, Position } from '../../../types';
import { SelectablePlayerCard } from '../cards/SelectablePlayerCard';
import { calculateGeneralOverall } from '../../../logic/calculations';
import type { SessionWizardScreen } from '../useSessionWizardScreen';

export function SessionWizardStep1({ screen }: { screen: SessionWizardScreen }) {
  const {
    model,
    dispatch,
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
    filteredPlayers,
    selectedPlayers,
    activeSession,
    communities,
    validationErrors,
  } = screen;
  if (!activeSession) return null;
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

      {/* Distilled Filters & Quick Action Bar */}
      <div className="card card-border bg-base-200 overflow-hidden">
        <div className="p-4 space-y-3">
          {/* Search Bar & Primary Action */}
          <div className="flex gap-2 items-center">
            <label className="input input-bordered flex items-center gap-2 flex-1 min-h-[44px]">
              <Search className="w-4 h-4 opacity-70 text-primary" />
              <input
                type="text"
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
                placeholder="Buscar atleta por nome..."
                className="grow text-xs font-medium"
              />
              {playerSearch && (
                <button
                  type="button"
                  onClick={() => setPlayerSearch('')}
                  className="btn btn-ghost btn-xs btn-circle"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </label>
            <button
              type="button"
              onClick={() => setShowGuestModal(true)}
              className="btn btn-primary min-h-[44px] px-4 font-bold uppercase text-xs tracking-wider shrink-0"
            >
              + Convidado
            </button>
          </div>

          {/* Filter Pills Row */}
          <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-base-300">
            <div className="flex flex-wrap items-center gap-2 py-1 max-w-full">
              {/* Gender Filter Pills */}
              <div className="join bg-base-300/40 p-1 rounded-lg border border-base-300 shrink-0">
                {(
                  [
                    ['all', 'Todos'],
                    ['M', 'Masc'],
                    ['F', 'Fem'],
                  ] as const
                ).map(([g, label]) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGenderFilter(g)}
                    className={`btn btn-xs join-item font-bold uppercase tracking-wider ${
                      genderFilter === g ? 'btn-primary' : 'btn-ghost text-base-content/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Position Selector */}
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value as 'all' | Position)}
                className="select select-bordered select-xs uppercase font-bold text-[10px] rounded-lg shrink-0"
              >
                <option value="all">Todas Posições</option>
                <option value="levantador">Levantador</option>
                <option value="oposto">Oposto</option>
                <option value="ponteiro">Ponteiro</option>
                <option value="central">Central</option>
                <option value="libero">Líbero</option>
                <option value="all-rounder">Coringa</option>
              </select>

              {/* Community Selector */}
              {communities.length > 0 && (
                <select
                  value={communityFilter}
                  onChange={(e) => setCommunityFilter(e.target.value)}
                  className="select select-bordered select-xs uppercase font-bold text-[10px] rounded-lg shrink-0 max-w-[140px]"
                >
                  <option value="all">Todas Comunidades</option>
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}

              {/* Status Toggle Pill */}
              <button
                type="button"
                onClick={() => setStatusFilter((prev) => (prev === 'injured' ? 'all' : 'injured'))}
                className={`btn btn-xs font-bold uppercase tracking-wider rounded-lg shrink-0 ${
                  statusFilter === 'injured'
                    ? 'btn-error'
                    : 'btn-ghost text-base-content/60 border border-base-300'
                }`}
              >
                {statusFilter === 'injured' ? '⚠️ Só Lesionados' : 'Lesionados'}
              </button>
            </div>

            {/* Batch Selection Controls */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const healthyActiveFilteredIds = filteredPlayers
                    .filter((p) => p.ativo && !p.status.lesionado)
                    .map((p) => p.id);
                  dispatch({
                    kind: 'updateSession',
                    patch: { selectedPlayerIds: healthyActiveFilteredIds },
                  });
                }}
                className="btn btn-xs btn-outline"
              >
                Selecionar Filtrados
              </button>
              <button
                type="button"
                onClick={() => dispatch({ kind: 'useLastSelection' })}
                className="btn btn-xs btn-outline btn-accent text-accent"
              >
                Última Lista
              </button>
              <button
                type="button"
                onClick={() => dispatch({ kind: 'clearSelection' })}
                className="btn btn-xs btn-outline btn-error text-error"
              >
                Limpar
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:max-h-[400px] sm:overflow-y-auto pr-2 custom-scrollbar">
        {filteredPlayers.map((p) => (
          <SelectablePlayerCard
            key={p.id}
            player={p}
            isSelected={activeSession.selectedPlayerIds.includes(p.id)}
            onToggle={() => dispatch({ kind: 'togglePlayer', id: p.id })}
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
      {validationErrors.players && model.canSchedule && (
        <ScheduleSessionPanel
          compact
          communityId={activeSession.communityId ?? null}
          sessionId={activeSession.id}
          isScheduled={model.isScheduled}
          error={model.scheduleError}
          onSchedule={() => dispatch({ kind: 'scheduleSession' })}
        />
      )}

      <div className="flex gap-4 pt-4 border-t border-base-300">
        <button
          type="button"
          onClick={() => {
            dispatch({ kind: 'prev' });
          }}
          className="btn btn-ghost flex-1"
        >
          Dados Básicos
        </button>
        <button onClick={() => dispatch({ kind: 'next' })} className="btn btn-primary flex-[2]">
          Continuar
        </button>
      </div>
    </div>
  );
}
