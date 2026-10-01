import type { PeladaActionKind, PeladaNextStep, PeladaStage } from '@app/peladaNextStep';

const ETAPAS = ['Lista', 'Sorteio', 'Jogo', 'Fim'] as const;

function etapaDe(stage: PeladaStage): number {
  if (stage === 'sorteada') return 1;
  if (stage === 'em_andamento') return 2;
  if (stage === 'encerrada' || stage === 'cancelada') return 3;
  return 0;
}

export function PeladaNextStepCard({
  step,
  busy,
  onAction,
}: {
  step: PeladaNextStep;
  busy: boolean;
  onAction: (kind: PeladaActionKind) => void;
}) {
  const atual = etapaDe(step.stage);
  return (
    <section
      aria-label="Próximo passo"
      className="space-y-4 rounded-box border border-primary/30 bg-base-200 p-4"
    >
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold">
        {ETAPAS.map((etapa, indice) => (
          <li
            key={etapa}
            aria-current={indice === atual ? 'step' : undefined}
            className={
              indice === atual
                ? 'text-primary'
                : indice < atual
                  ? 'text-base-content/70'
                  : 'text-base-content/40'
            }
          >
            {etapa}
            {indice < ETAPAS.length - 1 && (
              <span aria-hidden="true" className="ml-2 text-base-content/30">
                ·
              </span>
            )}
          </li>
        ))}
      </ol>
      <p role="status" className="text-lg font-bold leading-snug text-base-content">
        {step.line}
      </p>
      {(step.action || step.secondary) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {step.action && (
            <button
              type="button"
              className="btn btn-primary min-h-11 sm:flex-1"
              disabled={busy}
              onClick={() => onAction(step.action!.kind)}
            >
              {step.action.label}
            </button>
          )}
          {step.secondary && (
            <button
              type="button"
              className="btn btn-ghost min-h-11 border-base-content/20"
              disabled={busy}
              onClick={() => onAction(step.secondary!.kind)}
            >
              {step.secondary.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
