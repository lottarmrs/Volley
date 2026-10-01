import { AlertTriangle, Sparkles, CheckCircle2 } from 'lucide-react';
import { Position, RotationType } from '../../../types';
import { SessionGenerationStatus } from '../SessionGenerationStatus';
import { getSessionSetupWarnings } from '../../../logic/setupWarnings';
import { calculateGeneralOverall, calculatePositionOverall } from '../../../logic/calculations';
import type { SessionWizardScreen } from '../useSessionWizardScreen';

export function SessionWizardStep4({ screen }: { screen: SessionWizardScreen }) {
  const {
    dispatch,
    selectedPlayers,
    rotationType,
    getEffectivePosition,
    setPlayerPosition,
    rotationComposition,
    activeSession,
    validationErrors,
    isGenerating,
    generationProgress,
    generationStage,
    positionLabels,
    positionOrder,
  } = screen;
  if (!activeSession) return null;
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
                  <span className="text-[10px] font-bold text-text-muted uppercase">Nome</span>
                  <span className="text-[10px] font-bold text-base-content uppercase">
                    {activeSession.name}
                  </span>
                </div>
                <div className="flex justify-between border-b border-base-300/40 pb-1">
                  <span className="text-[10px] font-bold text-text-muted uppercase">Data</span>
                  <span className="text-[10px] font-bold text-base-content uppercase font-mono">
                    {activeSession.date}
                  </span>
                </div>
                <div className="flex justify-between border-b border-base-300/40 pb-1">
                  <span className="text-[10px] font-bold text-text-muted uppercase">Local</span>
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
                  <span className="text-[10px] font-bold text-text-muted uppercase">Tipo</span>
                  <span className="text-[10px] font-bold text-base-content uppercase">
                    {activeSession.type === 'free_play' ? 'Jogo Livre' : 'Torneio'}
                  </span>
                </div>
                {activeSession.config?.type === 'tournament' && (
                  <div className="flex justify-between border-b border-base-300/40 pb-1">
                    <span className="text-[10px] font-bold text-text-muted uppercase">Formato</span>
                    <span className="text-[10px] font-bold text-base-content uppercase">
                      {activeSession.config.format === 'round_robin'
                        ? 'Todos contra todos'
                        : activeSession.config.format === 'double_round_robin'
                          ? 'Turno e Returno'
                          : activeSession.config.format === 'knockout'
                            ? 'Mata-mata'
                            : activeSession.config.format === 'group_stage'
                              ? 'Fase de Grupos'
                              : activeSession.config.format === 'groups_knockout'
                                ? 'Grupos + Mata-mata'
                                : 'Torneio'}
                    </span>
                  </div>
                )}
                {activeSession.config?.type === 'tournament' &&
                  (activeSession.config.format === 'knockout' ||
                    activeSession.config.format === 'groups_knockout') && (
                    <>
                      <div className="flex justify-between border-b border-base-300/40 pb-1">
                        <span className="text-[10px] font-bold text-text-muted uppercase">
                          Grande Final
                        </span>
                        <span className="text-[10px] font-bold text-base-content uppercase">
                          {activeSession.config.hasFinal !== false ? 'Sim' : 'Não'}
                        </span>
                      </div>
                      <div className="flex justify-between border-b border-base-300/40 pb-1">
                        <span className="text-[10px] font-bold text-text-muted uppercase">
                          Disputa de 3º Lugar
                        </span>
                        <span className="text-[10px] font-bold text-base-content uppercase">
                          {activeSession.config.hasThirdPlaceMatch !== false ? 'Sim' : 'Não'}
                        </span>
                      </div>
                    </>
                  )}
                <div className="flex justify-between border-b border-base-300/40 pb-1">
                  <span className="text-[10px] font-bold text-text-muted uppercase">Times</span>
                  <span className="text-[10px] font-bold text-base-content uppercase">
                    {activeSession.config?.teamCount} Equipes
                  </span>
                </div>
                <div className="flex justify-between border-b border-base-300/40 pb-1">
                  <span className="text-[10px] font-bold text-text-muted uppercase">Pontos</span>
                  <span className="text-[10px] font-bold text-base-content uppercase font-mono">
                    {activeSession.config?.maxPoints} Pontos
                  </span>
                </div>
                <div className="flex justify-between border-b border-base-300/40 pb-1">
                  <span className="text-[10px] font-bold text-text-muted uppercase">Regra</span>
                  <span className="text-[10px] font-bold text-base-content uppercase">
                    {activeSession.config?.tieBreakMethod === 'direct_3' ? '3 direto' : 'Vai a 2'}
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
                  O app analisa os atributos dos atletas e testa diferentes combinações para formar
                  times mais equilibrados.
                </p>
              </div>

              <div className="w-full">
                {/* Perfil de Balanceamento */}
                <div className="fieldset">
                  <label className="fieldset-legend text-[9px] font-bold uppercase text-text-muted tracking-wider mb-2">
                    Perfil Técnico
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full">
                    {(
                      [
                        { id: 'balanced', label: 'Equilibrado', desc: 'Distribuição geral' },
                        {
                          id: 'competitive',
                          label: 'Competitivo',
                          desc: 'Foco técnico total',
                        },
                        { id: 'social', label: 'Social', desc: 'Gênero e tamanho' },
                        { id: 'mixed', label: 'Misto', desc: 'Cota de gênero' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          dispatch({
                            kind: 'updateSession',
                            patch: {
                              config: { ...activeSession.config!, balanceMode: m.id },
                            },
                          })
                        }
                        className={`btn btn-sm text-left min-h-[44px] flex flex-col justify-center p-2.5 rounded-xl transition-all ${activeSession.config?.balanceMode === m.id || (!activeSession.config?.balanceMode && m.id === 'balanced') ? 'btn-accent shadow-md shadow-accent/20' : 'btn-neutral'}`}
                      >
                        <span className="text-[9px] font-bold uppercase block leading-tight">
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
                          dispatch({
                            kind: 'updateSession',
                            patch: {
                              config: {
                                ...activeSession.config!,
                                rotationType: r.id,
                              },
                            },
                          })
                        }
                        className={`btn btn-sm text-left min-h-[44px] flex flex-col justify-center p-2.5 rounded-xl transition-all ${
                          rotationType === r.id
                            ? 'btn-accent shadow-md shadow-accent/20'
                            : 'btn-neutral'
                        }`}
                      >
                        <span className="text-[9px] font-bold uppercase block leading-tight">
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

              {/* Posições dos Atletas (somente nesta sessão) */}
              <div className="w-full">
                <div className="fieldset">
                  <label className="fieldset-legend text-[9px] font-bold uppercase text-text-muted tracking-wider mb-1">
                    Posições dos Atletas
                  </label>
                  <p className="text-[8px] font-bold uppercase text-text-muted/70 tracking-wider mb-2 leading-relaxed">
                    Defina a função de cada atleta apenas para esta sessão. O padrão vem do
                    cadastro.
                  </p>
                  {selectedPlayers.length === 0 ? (
                    <p className="text-[9px] font-bold uppercase text-text-muted/60 italic">
                      Nenhum atleta selecionado.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-full">
                      {selectedPlayers.map((p) => {
                        const effPos = getEffectivePosition(p);
                        const overridden = effPos !== p.posicaoPrincipal;
                        const generalOverall = calculateGeneralOverall(p);
                        const posOverall = overridden
                          ? calculatePositionOverall(p, effPos)
                          : generalOverall;
                        const delta = posOverall - generalOverall;
                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-base-300/30 border border-base-300/60"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-1.5 h-5 rounded-full ${p.genero === 'M' ? 'bg-info' : 'bg-secondary'}`}
                              />
                              <span className="font-bold text-[10px] text-base-content truncate max-w-[90px]">
                                {p.apelido || p.nome}
                              </span>
                              <span className="font-bold font-mono text-[11px] text-accent/80">
                                {posOverall}
                              </span>
                              {overridden && (
                                <span
                                  className={`font-bold font-mono text-[9px] ${delta < 0 ? 'text-error/80' : 'text-success/80'}`}
                                  title={`Overall na função escolhida vs. geral (${generalOverall})`}
                                >
                                  {delta >= 0 ? `+${delta}` : delta}
                                </span>
                              )}
                            </div>
                            <select
                              value={effPos}
                              onChange={(e) => setPlayerPosition(p.id, e.target.value as Position)}
                              className="select select-xs select-bordered text-[9px] font-bold uppercase max-w-[120px]"
                            >
                              {positionOrder.map((pos) => (
                                <option key={pos} value={pos}>
                                  {positionLabels[pos]}
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
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

      {validationErrors.generation && (
        <div role="alert" className="alert alert-error alert-soft text-xs font-semibold">
          {validationErrors.generation}
        </div>
      )}

      {isGenerating ? (
        <SessionGenerationStatus
          stage={generationStage}
          progress={generationProgress}
          onCancel={() => dispatch({ kind: 'cancelGeneration' })}
        />
      ) : (
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => {
              dispatch({ kind: 'prev' });
            }}
            className="btn btn-ghost flex-1 text-xs"
          >
            Voltar às Regras
          </button>
          <button
            onClick={() => dispatch({ kind: 'generateDivisions' })}
            className="btn btn-accent flex-[2] group"
          >
            Gerar Times Equilibrados{' '}
            <Sparkles className="w-4 h-4 inline-block ml-2 group-hover:animate-pulse" />
          </button>
        </div>
      )}
    </div>
  );
}
