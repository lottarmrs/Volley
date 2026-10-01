import { ScheduleSessionPanel } from '../ScheduleSessionPanel';
import { suggestedRegistrationCapacity } from '@app/scheduleSessionUseCases';
import type { SessionWizardScreen } from '../useSessionWizardScreen';

export function SessionWizardStep0({ screen }: { screen: SessionWizardScreen }) {
  const { model, dispatch, activeSession, validationErrors } = screen;
  if (!activeSession) return null;
  return (
    <div className="space-y-6">
      <div className="card card-border bg-base-200">
        <div className="card-body space-y-6">
          <h3 className="card-title text-sm font-bold uppercase text-base-content tracking-[0.2em] border-b border-base-300 pb-4">
            Informações da pelada
          </h3>
          <div className="space-y-6">
            <div className="fieldset">
              <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest">
                Nome da pelada
              </label>
              <input
                type="text"
                value={activeSession.name}
                onChange={(e) =>
                  dispatch({ kind: 'updateSession', patch: { name: e.target.value } })
                }
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
                  onChange={(e) =>
                    dispatch({ kind: 'updateSession', patch: { date: e.target.value } })
                  }
                  className={`input input-bordered w-full font-mono ${validationErrors.date ? 'input-error' : ''}`}
                />
              </div>
              <div className="fieldset">
                <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest">
                  Vagas
                </label>
                {/* A vaga e o que o grupo disputa: campo proprio, nao
                      derivada do numero de times -- que e decisao de
                      sorteio e acontece depois da lista. */}
                <input
                  type="number"
                  min={1}
                  step={1}
                  aria-label="Vagas"
                  value={
                    activeSession.registrationCapacity ??
                    suggestedRegistrationCapacity(activeSession)
                  }
                  onChange={(e) =>
                    dispatch({
                      kind: 'updateSession',
                      patch: {
                        registrationCapacity: Math.max(1, Number(e.target.value) || 1),
                      },
                    })
                  }
                  className="input input-bordered w-full font-mono"
                />
                <p className="mt-1 text-[10px] leading-relaxed text-text-muted">
                  Quantas pessoas entram na lista. Quem chegar depois fica na reserva.
                </p>
              </div>
              <div className="fieldset">
                <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest">
                  Local (Opcional)
                </label>
                <input
                  type="text"
                  value={activeSession.location ?? ''}
                  onChange={(e) =>
                    dispatch({ kind: 'updateSession', patch: { location: e.target.value } })
                  }
                  className="input input-bordered w-full"
                  placeholder="Ex: Arena Pro"
                />
              </div>
            </div>

            {model.canSchedule && (
              <ScheduleSessionPanel
                communityId={activeSession.communityId ?? null}
                sessionId={activeSession.id}
                isScheduled={model.isScheduled}
                error={model.scheduleError}
                onSchedule={() => dispatch({ kind: 'scheduleSession' })}
              />
            )}

            <div className="fieldset">
              <label className="fieldset-legend text-[10px] font-bold uppercase text-text-muted tracking-widest">
                Observações (Opcional)
              </label>
              <textarea
                value={activeSession.notes ?? ''}
                onChange={(e) =>
                  dispatch({ kind: 'updateSession', patch: { notes: e.target.value } })
                }
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
            dispatch({ kind: 'cancel' });
          }}
          className="btn btn-ghost flex-1"
        >
          Cancelar
        </button>
        {/* Com a lista decidindo quem joga, escolher atletas aqui e
              pedir a resposta antes da pergunta. O primario passa a ser
              marcar -- exceto sem nuvem, onde a lista nao abre e o manual
              volta a ser o caminho. */}
        {model.primaryAction === 'schedule' ? (
          <button
            type="button"
            onClick={() => dispatch({ kind: 'scheduleSession' })}
            className="btn btn-primary flex-[3]"
          >
            Marcar pelada
          </button>
        ) : (
          <button
            type="button"
            onClick={() => dispatch({ kind: 'next' })}
            className="btn btn-primary flex-[3]"
          >
            Escolher Atletas
          </button>
        )}
      </div>

      {model.primaryAction === 'schedule' && (
        <button
          type="button"
          onClick={() => dispatch({ kind: 'next' })}
          className="btn btn-ghost btn-sm w-full text-base-content/60"
        >
          Prefiro escolher os atletas na mão
        </button>
      )}

      {model.primaryAction === 'manual' && (
        <p className="text-xs leading-relaxed text-base-content/60">
          Esta comunidade ainda não está na nuvem, então a lista de presença não abre. Escolha os
          atletas na mão — ou sincronize a comunidade antes, e a lista passa a valer.
        </p>
      )}
    </div>
  );
}
