import { conflictMessage, type ScoreQueueConflict } from '@app/scoreQueue';

export function ScoreQueueConflictDialog({
  conflict,
  onSendAnyway,
  onDiscard,
}: {
  conflict: ScoreQueueConflict | null;
  onSendAnyway: () => void;
  onDiscard: () => void;
}) {
  if (!conflict) return null;
  return (
    <div className="modal modal-open" role="dialog" aria-labelledby="fila-conflito-titulo">
      <div className="modal-box max-w-md space-y-5">
        <h3 id="fila-conflito-titulo" className="text-lg font-black text-base-content">
          Pontos guardados no aparelho
        </h3>
        <p className="text-sm leading-relaxed text-base-content/70">{conflictMessage(conflict)}</p>
        <div className="modal-action">
          <button type="button" className="btn btn-ghost text-error" onClick={onDiscard}>
            Descartar os meus
          </button>
          {!conflict.sessionEnded && (
            <button type="button" className="btn btn-primary" onClick={onSendAnyway}>
              Enviar os meus mesmo assim
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
