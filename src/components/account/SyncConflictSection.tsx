export interface SyncConflictItem {
  sessionId: string;
  sessionName: string;
  localEventCount: number;
  holderUserId: string;
  holderName: string | null;
  holderEventCount: number;
}

/**
 * Decisao humana sobre placares concorrentes.
 *
 * As versoes NAO sao mescladas: mesclar por relogio de celular gera placar dobrado.
 * A versao nao escolhida vira soft-delete, nunca apagada — e a tela diz isso antes
 * da escolha, para a decisao nao parecer irreversivel.
 */
export function SyncConflictSection({
  conflicts,
  onKeepMine,
  onKeepTheirs,
}: {
  conflicts: SyncConflictItem[];
  onKeepMine: (sessionId: string) => void;
  onKeepTheirs: (sessionId: string) => void;
}) {
  if (conflicts.length === 0) return null;

  return (
    <section className="card bg-base-200 border border-warning p-4 space-y-4">
      <h3 className="font-bold uppercase text-sm">Placares em conflito</h3>
      <p className="text-xs">
        Estas sessões foram marcadas em dois aparelhos ao mesmo tempo. Escolha qual versão
        vale. A outra não é apagada e pode ser recuperada depois.
      </p>

      {conflicts.map((c) => {
        const quem = c.holderName ?? 'A outra pessoa';
        return (
          <div key={c.sessionId} className="border-t border-base-300 pt-3 space-y-2">
            <p className="font-bold text-sm">{c.sessionName}</p>
            <p className="text-xs">
              Seu aparelho: <strong>{c.localEventCount}</strong> pontos · {quem}:{' '}
              <strong>{c.holderEventCount}</strong> pontos
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-sm" onClick={() => onKeepMine(c.sessionId)}>
                Manter o meu
              </button>
              <button type="button" className="btn btn-sm" onClick={() => onKeepTheirs(c.sessionId)}>
                Manter o de {quem}
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
