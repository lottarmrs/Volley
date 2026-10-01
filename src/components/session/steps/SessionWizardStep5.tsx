import {
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Settings as SettingsIcon,
  Shield,
  Lock,
  Unlock,
  Share2,
  Copy,
} from 'lucide-react';
import { isPlayerEstimated } from '../../../logic/balancingCompatibility';
import { buildRosterIntegrityIssues } from '../../../application/sessionLifecycleUseCases';
import { CandidateSetPublication } from '../CandidateSetPublication';
import { calculateGeneralOverall } from '../../../logic/calculations';
import type { SessionWizardScreen } from '../useSessionWizardScreen';

export function SessionWizardStep5({ screen }: { screen: SessionWizardScreen }) {
  const {
    dispatch,
    setShowConstraintsModal,
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
    handleShareSorteio,
    handleCopySorteio,
    selectedPlayers,
    getEffectivePosition,
    updateGeneratedTeam,
    movePlayerBetweenGeneratedTeams,
    handleSelectPlayerForMove,
    handleCancelMoveSelection,
    handleMoveSelectedPlayerToTeam,
    activeSession,
    players,
    validationErrors,
    bestDivisions,
    selectedDivisionIndex,
    isGenerating,
    authorizedDraw,
    publicationState,
    publicationError,
    positionLabels,
  } = screen;
  if (!activeSession) return null;
  // Results
  if (bestDivisions.length === 0) return null;
  const currentDiv = bestDivisions[selectedDivisionIndex];
  const rosterIssues = buildRosterIntegrityIssues(
    currentDiv,
    selectedPlayers.map((p) => p.id),
    players,
  );
  const estimatedCount = [...new Set(currentDiv.teams.flatMap((t) => t.playerIds))].filter((id) => {
    const player = players.find((p) => p.id === id);
    return player ? isPlayerEstimated(player) : false;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-center gap-2 mb-4 bg-base-200 p-2 rounded-2xl border border-base-300">
        {bestDivisions.map((div, i) => (
          <button
            key={i}
            onClick={() => dispatch({ kind: 'selectDivisionIndex', index: i })}
            className={`btn btn-sm ${selectedDivisionIndex === i ? 'btn-accent' : 'btn-ghost'}`}
          >
            {div.qualityLabel || `Opção ${i + 1}`}
            <span className="badge badge-sm font-mono">{div.score.toFixed(0)}pts</span>
          </button>
        ))}
        <div className="divider divider-horizontal mx-1 hidden sm:flex" />
        <button
          onClick={() => dispatch({ kind: 'generateDivisions', advanceStep: false })}
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
        <button onClick={() => setShowConstraintsModal(true)} className="btn btn-sm btn-outline">
          <SettingsIcon className="w-3.5 h-3.5" />{' '}
          <span className="hidden sm:inline">Configurações e Vínculos</span>
        </button>
        <div className="divider divider-horizontal mx-1 hidden sm:flex" />
        <div
          className="flex items-center gap-2 px-1"
          title="Escolha o que incluir ao compartilhar/copiar o sorteio."
        >
          <span className="text-[9px] font-bold uppercase text-base-content/40 tracking-wider hidden md:inline">
            Incluir:
          </span>
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input
              type="checkbox"
              className="toggle toggle-xs toggle-success"
              checked={shareIncludePositions}
              onChange={(e) => setShareIncludePositions(e.target.checked)}
            />
            <span className="text-[9px] font-bold uppercase text-base-content/60 tracking-wider">
              Posições
            </span>
          </label>
          <label className="flex items-center gap-1 cursor-pointer select-none">
            <input
              type="checkbox"
              className="toggle toggle-xs toggle-success"
              checked={shareIncludeRatings}
              onChange={(e) => setShareIncludeRatings(e.target.checked)}
            />
            <span className="text-[9px] font-bold uppercase text-base-content/60 tracking-wider">
              Ratings
            </span>
          </label>
        </div>
        <button
          onClick={handleShareSorteio}
          className="btn btn-sm btn-success btn-soft text-success"
        >
          <Share2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Compartilhar</span>
        </button>
        <button onClick={handleCopySorteio} className="btn btn-sm btn-outline">
          <Copy className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Copiar</span>
        </button>
      </div>

      {selectedMovePlayer && (
        <div className="flex flex-col sm:flex-row justify-between items-center bg-primary/10 border border-primary/20 p-4 rounded-xl shadow-md gap-3 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <span className="text-xl">👉</span>
            <p className="text-xs text-base-content font-bold uppercase">
              <span className="text-primary font-black">
                {players.find((p) => p.id === selectedMovePlayer.playerId)?.nome}
              </span>{' '}
              selecionado. Toque em outro time para mover ou em outro atleta para trocar.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancelMoveSelection}
            className="btn btn-error btn-soft btn-xs uppercase font-bold tracking-wider"
          >
            Cancelar seleção
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {currentDiv.teams.map((team, tIdx) => (
          <div
            key={tIdx}
            className="card card-border bg-base-200 overflow-hidden border-t-8 shadow-2xl"
            style={{
              borderTopColor:
                team.color || ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#8b5cf6'][tIdx % 5],
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
                  movePlayerBetweenGeneratedTeams(selectedDivisionIndex, dragPlayerId, team.id);
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
              {selectedMovePlayer && selectedMovePlayer.sourceTeamId !== team.id && (
                <button
                  type="button"
                  onClick={() => handleMoveSelectedPlayerToTeam(team.id)}
                  className="w-full flex items-center justify-center h-8 rounded-lg border-2 border-dashed border-primary hover:bg-primary/10 text-[9px] font-bold uppercase text-primary mb-1 cursor-pointer transition-all"
                >
                  Tocar para mover para cá
                </button>
              )}
              {team.playerIds.map((pid) => {
                const p = players.find((x) => x.id === pid);
                if (!p) return null;
                const isLocked =
                  activeSession.config?.balanceConstraints?.lockedPlayerIdxs?.[p.id] === tIdx;
                const isDragging = dragPlayerId === p.id;
                const isSelectedToMove = selectedMovePlayer?.playerId === p.id;
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
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button')) return;
                      handleSelectPlayerForMove(p.id, team.id, isLocked);
                    }}
                    className={`flex justify-between items-center p-2 rounded-lg border transition-all ${
                      isDragging
                        ? 'opacity-40 border-primary bg-primary/10'
                        : isSelectedToMove
                          ? 'ring-2 ring-primary border-primary bg-primary/10 shadow-md'
                          : isLocked
                            ? 'opacity-65 bg-base-300/10 border-base-300/40 cursor-not-allowed'
                            : 'bg-base-300/30 border-base-300/60 hover:bg-base-300/60'
                    } ${!isLocked ? 'cursor-grab active:cursor-grabbing' : ''}`}
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
                      <span className="font-bold text-[11px] text-base-content truncate max-w-[110px]">
                        {p.nome}
                      </span>
                      {isLocked && (
                        <span className="badge badge-accent badge-xs font-black uppercase tracking-wider scale-90">
                          Fixado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {(() => {
                        const effPos = getEffectivePosition(p);
                        const overridden = effPos !== p.posicaoPrincipal;
                        return (
                          <span
                            className={`text-[8px] font-bold uppercase ${overridden ? 'text-accent/80' : 'text-base-content/40'}`}
                            title={
                              overridden
                                ? `Função nesta sessão · cadastro: ${
                                    p.posicaoPrincipal ? positionLabels[p.posicaoPrincipal] : '--'
                                  }`
                                : undefined
                            }
                          >
                            {effPos ? positionLabels[effPos] : '--'}
                            {overridden ? ' *' : ''}
                          </span>
                        );
                      })()}
                      <span className="font-bold font-mono text-sm text-accent/80">
                        {calculateGeneralOverall(p)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          dispatch({
                            kind: 'togglePlayerLock',
                            playerId: p.id,
                            teamIdx: tIdx,
                          })
                        }
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
                  <p className="text-[10px] font-bold font-mono text-base-content/50">{s.val}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {rosterIssues.length > 0 && (
        <div className="space-y-2">
          {rosterIssues.map((issue, i) => (
            <div key={i} role="alert" className="alert alert-error alert-soft p-2 items-start">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="text-[9px] font-bold uppercase leading-relaxed tracking-tighter block text-left">
                {issue}
              </span>
            </div>
          ))}
        </div>
      )}

      {validationErrors.generation && (
        <div role="alert" className="alert alert-error alert-soft text-xs font-semibold">
          {validationErrors.generation}
        </div>
      )}

      {authorizedDraw ? (
        <div className="space-y-2">
          <span className="badge badge-accent badge-soft text-xs font-semibold">
            Notas autorizadas da comunidade
          </span>
          <CandidateSetPublication
            state={publicationState}
            error={publicationError}
            onPublish={() => dispatch({ kind: 'publishCandidateSet' })}
          />
          {authorizedDraw.estimatedCount > 0 && (
            <div role="alert" className="alert alert-warning alert-soft p-2 items-start">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="text-[9px] font-bold uppercase leading-relaxed tracking-tighter block text-left">
                {authorizedDraw.estimatedCount} de {authorizedDraw.participantCount} atletas sem
                avaliação — sorteio com notas estimadas. Avalie pelo perfil do atleta.
              </span>
            </div>
          )}
        </div>
      ) : (
        estimatedCount > 0 && (
          <div className="space-y-2">
            <div role="alert" className="alert alert-warning alert-soft p-2 items-start">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span className="text-[9px] font-bold uppercase leading-relaxed tracking-tighter block text-left">
                {estimatedCount} atleta(s) entraram com avaliação estimada pela média da turma.
              </span>
            </div>
          </div>
        )
      )}

      {currentDiv.diagnostics && (
        <div className="card card-border bg-base-200">
          <div className="card-body p-6 space-y-6">
            <div className="border-b border-base-300 pb-4">
              <h4 className="card-title text-[10px] font-bold text-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                <Shield className="w-4 h-4 text-accent" /> DIAGNÓSTICO DE EQUILÍBRIO
              </h4>
              <p className="text-[9px] text-text-muted/75 uppercase font-bold mt-1 leading-relaxed">
                A divisão considera força geral, ataque, defesa, levantamento, bloqueio, altura,
                gênero, forma atual e condição física.
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
                    <span className="text-text-muted">Bloqueio:</span>
                    <span className="text-base-content font-bold">
                      {currentDiv.diagnostics.blockSpread.toFixed(1)} pts
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Altura Média:</span>
                    <span className="text-base-content font-bold">
                      {Math.round(currentDiv.diagnostics.heightSpread)} cm
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Gênero:</span>
                    <span className="text-base-content font-bold">
                      {currentDiv.diagnostics.genderSpread}{' '}
                      {currentDiv.diagnostics.genderSpread === 1 ? 'atleta' : 'atletas'} de dif.
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Forma Média:</span>
                    <span className="text-base-content font-bold">
                      {currentDiv.diagnostics.formSpread.toFixed(1)} pts
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Lesionados:</span>
                    <span className="text-base-content font-bold">
                      {currentDiv.diagnostics.injuredSpread}{' '}
                      {currentDiv.diagnostics.injuredSpread === 1 ? 'atleta' : 'atletas'} de dif.
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
                    <span className="text-base-content font-bold font-mono">{currentDiv.seed}</span>
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
            dispatch({ kind: 'prev' });
          }}
          className="btn btn-ghost flex-1 text-xs"
        >
          Voltar
        </button>
        <button
          onClick={() => dispatch({ kind: 'confirmDivision' })}
          disabled={rosterIssues.length > 0}
          className="btn btn-primary flex-[2]"
        >
          Gerar tabela
        </button>
      </div>
    </div>
  );
}
