import { motion, AnimatePresence } from 'motion/react';
import { ChevronLeft, Trash2, Sparkles, Settings as SettingsIcon, RotateCw, X } from 'lucide-react';
import { SessionWizardProgress } from './SessionWizardProgress';
import { SessionSetupSummary } from './SessionSetupSummary';
import type { ScreenContract } from '@app/screens/screenContract';
import type { SessionWizardModel } from '@app/screens/sessionWizard/sessionWizardModel';
import type { SessionWizardIntent } from '@app/screens/sessionWizard/sessionWizardIntents';
import { GuestPlayerModal } from '../player/GuestPlayerModal';
import { useSessionWizardScreen } from './useSessionWizardScreen';
import { SessionWizardStep0 } from './steps/SessionWizardStep0';
import { SessionWizardStep1 } from './steps/SessionWizardStep1';
import { SessionWizardStep2 } from './steps/SessionWizardStep2';
import { SessionWizardStep3 } from './steps/SessionWizardStep3';
import { SessionWizardStep4 } from './steps/SessionWizardStep4';
import { SessionWizardStep5 } from './steps/SessionWizardStep5';
import { SessionWizardStep6 } from './steps/SessionWizardStep6';

interface SessionWizardProps {
  contract: ScreenContract<SessionWizardModel, SessionWizardIntent>;
  firstStep?: number;
  title?: string;
  exitLabel?: string;
}

export function SessionWizard({ contract, firstStep = 0, title, exitLabel }: SessionWizardProps) {
  const screen = useSessionWizardScreen(contract);
  const {
    model,
    dispatch,
    showGuestModal,
    setShowGuestModal,
    showConstraintsModal,
    setShowConstraintsModal,
    constraintPlayerA,
    setConstraintPlayerA,
    constraintPlayerB,
    setConstraintPlayerB,
    constraintType,
    setConstraintType,
    toastMessage,
    selectedPlayers,
    activeSession,
    players,
    wizardStep,
    stepLabels,
  } = screen;

  if (!activeSession) return null;

  const renderStep = () => {
    switch (wizardStep) {
      case 0:
        return <SessionWizardStep0 screen={screen} />;
      case 1:
        return <SessionWizardStep1 screen={screen} />;
      case 2:
        return <SessionWizardStep2 screen={screen} />;
      case 3:
        return <SessionWizardStep3 screen={screen} />;
      case 4:
        return <SessionWizardStep4 screen={screen} />;
      case 5:
        return <SessionWizardStep5 screen={screen} />;
      case 6:
        return <SessionWizardStep6 screen={screen} />;
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
            dispatch({ kind: 'cancel' });
          }}
          className="btn btn-ghost btn-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>{exitLabel ?? 'Cancelar'}</span>
        </button>

        <h1 className="text-lg font-black text-base-content">{title ?? 'Nova pelada'}</h1>
      </div>

      <SessionWizardProgress
        currentStep={wizardStep}
        steps={stepLabels
          .map((label, i) => ({ id: i, label }))
          .filter((step) => step.id >= firstStep)}
      />

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
                      Configurações e Vínculos
                    </h3>
                    <p className="text-[9px] text-text-muted uppercase font-bold">
                      Ajuste parâmetros do balanceador e relacionamentos de atletas
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
                {/* Rotação Histórica / Anti-Repetição */}
                <div className="bg-base-100 p-4 rounded-xl border border-base-300 space-y-3">
                  <h4 className="text-[10px] font-bold text-base-content/70 uppercase tracking-wider flex items-center gap-1.5">
                    <RotateCw className="w-3.5 h-3.5 text-accent" /> Rotação Histórica
                    (Anti-Repetição)
                  </h4>
                  <label className="label cursor-pointer justify-start gap-3 bg-neutral/40 p-3 rounded-lg border border-base-300 hover:border-accent/30 transition-all w-full">
                    <input
                      type="checkbox"
                      className="toggle toggle-primary toggle-sm"
                      checked={(activeSession.config?.repetitionWeight ?? 0.8) > 0}
                      onChange={(e) => {
                        dispatch({
                          kind: 'updateSession',
                          patch: {
                            config: {
                              ...activeSession.config!,
                              repetitionWeight: e.target.checked ? 0.8 : 0,
                            },
                          },
                        });
                      }}
                    />
                    <div className="flex-1">
                      <span className="label-text text-[11px] font-bold uppercase block text-base-content">
                        Evitar repetição de parcerias
                      </span>
                      <span className="text-[8px] text-text-muted uppercase block font-semibold mt-0.5">
                        Prioriza misturar atletas que jogaram juntos recentemente
                      </span>
                    </div>
                  </label>

                  {(activeSession.config?.repetitionWeight ?? 0.8) > 0 && (
                    <div className="mt-2 space-y-1.5 pl-1">
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
                              dispatch({
                                kind: 'updateSession',
                                patch: {
                                  config: {
                                    ...activeSession.config!,
                                    repetitionWeight: opt.value,
                                  },
                                },
                              })
                            }
                            className={`btn btn-xs join-item flex-1 font-bold ${
                              activeSession.config?.repetitionWeight === opt.value ||
                              (opt.value === 0.8 &&
                                activeSession.config?.repetitionWeight === undefined)
                                ? 'btn-primary'
                                : 'btn-neutral'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

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
                        dispatch({
                          kind: 'addPairConstraint',
                          p1: constraintPlayerA,
                          p2: constraintPlayerB,
                          type: constraintType,
                        });
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

                  <div className="space-y-2 sm:max-h-[220px] sm:overflow-y-auto pr-1 custom-scrollbar">
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
                              onClick={() =>
                                dispatch({
                                  kind: 'removePairConstraint',
                                  p1: p1,
                                  p2: p2,
                                  type: 'together',
                                })
                              }
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
                              onClick={() =>
                                dispatch({
                                  kind: 'removePairConstraint',
                                  p1: p1,
                                  p2: p2,
                                  type: 'separated',
                                })
                              }
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
        onAddGuestPlayer={(player, editDetails) =>
          dispatch({ kind: 'addGuestPlayer', player, editDetails })
        }
        onReactivateGuestPlayer={(playerId, editDetails) =>
          dispatch({ kind: 'reactivateGuestPlayer', playerId, editDetails })
        }
        defaultCommunityId={activeSession?.communityId}
        canEditDetails={model.canEditGuestDetails}
      />

      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-base-300/90 text-base-content border border-accent/40 backdrop-blur-md px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold text-xs uppercase tracking-wider"
          >
            <Sparkles className="w-4 h-4 text-accent animate-pulse" />
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
