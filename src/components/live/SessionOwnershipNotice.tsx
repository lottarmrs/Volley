import { useState } from 'react';
import type { SessionControlView } from '@app/sessionOwnershipUseCases';

/**
 * Aviso de quem esta com o controle da sessao.
 *
 * Assumir o controle exige confirmacao: tirar a sessao de quem esta marcando placar
 * naquele momento nao pode acontecer por toque acidental.
 */
export function SessionOwnershipNotice({
  control,
  onTakeControl,
}: {
  control: SessionControlView;
  onTakeControl: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  if (control.reason === 'mine' || control.reason === 'free') return null;

  const podeAssumir = control.reason === 'held_by_other';

  return (
    <div className="alert alert-warning flex flex-col items-start gap-2" role="status">
      <span className="text-sm font-bold">{control.message}</span>

      {podeAssumir && !confirmando && (
        <button type="button" className="btn btn-sm" onClick={() => setConfirmando(true)}>
          Assumir controle
        </button>
      )}

      {podeAssumir && confirmando && (
        <div className="flex flex-col gap-2">
          <span className="text-xs">
            {control.holderName ?? 'A outra pessoa'} perde o controle e passa a ver a sessão em modo
            leitura. O placar já marcado não é perdido.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-sm btn-warning"
              onClick={() => {
                setConfirmando(false);
                onTakeControl();
              }}
            >
              Confirmar
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setConfirmando(false)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
