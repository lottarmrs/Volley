import { motion } from 'motion/react';
import { ScheduleSessionPanel } from '../ScheduleSessionPanel';
import {
  Users,
  Trophy,
  Target,
  Zap,
  AlertTriangle,
  Sparkles,
  Settings as SettingsIcon,
  Scale,
  RotateCw,
} from 'lucide-react';
import { Team, TournamentFormat } from '../../../types';
import type { SessionWizardScreen } from '../useSessionWizardScreen';

export function SessionWizardStep3({ screen }: { screen: SessionWizardScreen }) {
  const { model, dispatch, selectedPlayers, activeSession, validationErrors } = screen;
  if (!activeSession) return null;
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
                {activeSession.type === 'free_play' ? 'Regras do Jogo Livre' : 'Regras do Torneio'}
              </h3>
              <p className="text-[9px] text-text-muted uppercase font-bold">
                Ajuste os parâmetros da noite
              </p>
            </div>
          </div>

          <div className="space-y-6">
            {config.type === 'tournament' && (
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
                      const isSelected = config.format === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() =>
                            dispatch({
                              kind: 'updateSession',
                              patch: {
                                config: { ...config, format: f.id as TournamentFormat },
                              },
                            })
                          }
                          className={`card card-border cursor-pointer text-left hover:scale-[1.01] transition-all p-4 bg-base-200 border border-base-300 flex flex-row items-start gap-4 ${
                            isSelected ? 'border-accent bg-accent/5' : 'hover:border-accent/30'
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

                {(config.format === 'knockout' || config.format === 'groups_knockout') && (
                  <div className="fieldset pt-4 border-t border-base-300">
                    <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest mb-3">
                      Fases do Mata-Mata
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="label cursor-pointer justify-start gap-3 bg-neutral/40 p-4 rounded-xl flex-1 border border-base-300 hover:border-accent/30 transition-all">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-primary checkbox-sm"
                          checked={config.hasFinal !== false}
                          onChange={(e) =>
                            dispatch({
                              kind: 'updateSession',
                              patch: {
                                config: { ...config, hasFinal: e.target.checked },
                              },
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
                          checked={config.hasThirdPlaceMatch !== false}
                          onChange={(e) =>
                            dispatch({
                              kind: 'updateSession',
                              patch: {
                                config: {
                                  ...config,
                                  hasThirdPlaceMatch: e.target.checked,
                                },
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

                {config.format === 'round_robin' && (
                  <div className="fieldset pt-4 border-t border-base-300">
                    <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest mb-3">
                      Playoffs do Campeonato
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="label cursor-pointer justify-start gap-3 bg-neutral/40 p-4 rounded-xl flex-1 border border-base-300 hover:border-accent/30 transition-all">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-primary checkbox-sm"
                          checked={config.roundRobinPlayoffs === true}
                          onChange={(e) =>
                            dispatch({
                              kind: 'updateSession',
                              patch: {
                                config: {
                                  ...config,
                                  roundRobinPlayoffs: e.target.checked,
                                  hasFinal: e.target.checked,
                                  hasThirdPlaceMatch: e.target.checked,
                                  playoffSetTargets: e.target.checked ? [12, 12, 7] : undefined,
                                },
                              },
                            })
                          }
                        />
                        <div>
                          <span className="label-text text-xs font-bold uppercase block text-base-content">
                            Gerar Playoffs (Final / 3º)
                          </span>
                          <span className="text-[9px] text-text-muted uppercase block font-semibold mt-0.5">
                            Gera partidas adicionais de 1ºx2º e 3ºx4º
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
                  Cada time terá em média {(selectedPlayers.length / config.teamCount).toFixed(1)}{' '}
                  atletas
                </span>
              </div>
              <div className="join w-full">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() =>
                      dispatch({
                        kind: 'updateSession',
                        patch: { config: { ...config, teamCount: n } },
                      })
                    }
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
                        dispatch({
                          kind: 'updateSession',
                          patch: { config: { ...config, maxPoints: pts } },
                        })
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
                  {(
                    [
                      {
                        id: 'direct_3',
                        icon: <Target className="w-3.5 h-3.5 text-accent" />,
                        label: '3 Direto',
                        tip: 'Empate no set point encerra ao abrir 3 pontos extras ou atingir o limite.',
                      },
                      {
                        id: 'win_by_2',
                        icon: <Scale className="w-3.5 h-3.5 text-primary" />,
                        label: 'Vai a 2 (Vantagem)',
                        tip: 'Set point exige 2 pontos consecutivos de vantagem para finalizar.',
                      },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        dispatch({
                          kind: 'updateSession',
                          patch: {
                            config:
                              config.type === 'tournament'
                                ? {
                                    ...config,
                                    tieBreakMethod: m.id,
                                    victoryRule: m.id,
                                  }
                                : { ...config, tieBreakMethod: m.id },
                          },
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
            {config.type === 'free_play' && (
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
                        dispatch({
                          kind: 'updateSession',
                          patch: {
                            config: { ...config, rotationSystem: 'winner_stays' },
                          },
                        })
                      }
                      className={`btn text-left p-4 h-auto block ${config.rotationSystem === 'winner_stays' ? 'btn-success btn-soft' : 'btn-neutral'}`}
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
                        dispatch({
                          kind: 'updateSession',
                          patch: {
                            config: {
                              ...config,
                              rotationSystem: 'max_consecutive_games',
                            },
                          },
                        })
                      }
                      className={`btn text-left p-4 h-auto block ${config.rotationSystem === 'max_consecutive_games' ? 'btn-info btn-soft' : 'btn-neutral'}`}
                    >
                      <div className="flex items-center gap-2">
                        <RotateCw className="w-4 h-4 text-info" />
                        <span className="text-[10px] font-bold uppercase">Limite de Vitórias</span>
                      </div>
                      <p className="text-[8px] opacity-70 uppercase font-bold mt-1">
                        Sai após atingir limite de vitórias consecutivas.
                      </p>
                    </button>
                  </div>
                </div>

                {config.rotationSystem === 'max_consecutive_games' && (
                  <div className="fieldset">
                    <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest mb-2">
                      Vitórias máximas consecutivas
                    </label>
                    <div className="join w-full">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() =>
                            dispatch({
                              kind: 'updateSession',
                              patch: {
                                config: { ...config, maxConsecutiveGames: n },
                              },
                            })
                          }
                          className={`btn join-item flex-1 font-mono font-bold text-sm ${config.maxConsecutiveGames === n ? 'btn-info' : 'btn-neutral'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
            {/* End of balance rules */}
          </div>

          {(validationErrors.config || validationErrors.teamCount) && (
            <div role="alert" className="alert alert-error alert-soft mt-4">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-[10px] font-bold uppercase tracking-tight">
                {validationErrors.config ?? validationErrors.teamCount}
              </span>
            </div>
          )}

          {validationErrors.teamCount && model.canSchedule && (
            <div className="mt-4">
              <ScheduleSessionPanel
                compact
                communityId={activeSession.communityId ?? null}
                sessionId={activeSession.id}
                isScheduled={model.isScheduled}
                error={model.scheduleError}
                onSchedule={() => dispatch({ kind: 'scheduleSession' })}
              />
            </div>
          )}
        </div>
      </div>

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
        <button onClick={() => dispatch({ kind: 'next' })} className="btn btn-primary flex-[2]">
          Revisar
        </button>
      </div>
    </div>
  );
}
