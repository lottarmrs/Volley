import { useState } from 'react';
import { Shuffle } from 'lucide-react';
import type { Player } from '@shared/types';
import { describeRosterReadiness, type QuickStartEntry } from '@app/quickStart';
import { PlayerPicker } from './PlayerPicker';

export function QuickPeladaView({
  communities,
  communityId,
  onCommunityChange,
  roster,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  communities: Array<{ id: string; name: string }>;
  communityId: string;
  onCommunityChange: (communityId: string) => void;
  roster: Player[];
  busy: boolean;
  error: string | null;
  onSubmit: (escolha: { playerIds: string[]; novos: QuickStartEntry[] }) => void;
  onCancel: () => void;
}) {
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [novos, setNovos] = useState<QuickStartEntry[]>([]);
  const total = selecionados.length + novos.length;
  const prontidao = describeRosterReadiness(total);
  const atual = communities.find((item) => item.id === communityId);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="space-y-1">
        <h2 className="text-2xl font-extrabold tracking-tight text-base-content">Pelada rápida</h2>
        <p className="text-sm text-base-content/70">
          Sem lista: escolha quem veio e sorteie na hora. A pelada entra no histórico.
        </p>
      </header>

      {communities.length > 1 ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wider text-base-content/60">
            Comunidade
          </span>
          <select
            className="select select-bordered w-full sm:w-80"
            value={communityId}
            onChange={(event) => {
              setSelecionados([]);
              onCommunityChange(event.target.value);
            }}
          >
            {communities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm font-bold text-base-content">{atual?.name}</p>
      )}

      <PlayerPicker
        roster={roster}
        selectedIds={selecionados}
        onSelectedChange={setSelecionados}
        newEntries={novos}
        onNewEntriesChange={setNovos}
      />

      {error && (
        <p role="alert" className="text-sm font-semibold text-error">
          {error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-base-300 bg-base-100/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-box sm:border">
        <p
          aria-live="polite"
          className={`text-sm font-semibold ${prontidao.ready ? 'text-success' : 'text-base-content/70'}`}
        >
          {prontidao.message}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <button type="button" className="btn btn-ghost min-h-11" onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary min-h-11 gap-2"
            disabled={!prontidao.ready || busy}
            onClick={() => onSubmit({ playerIds: selecionados, novos })}
          >
            <Shuffle className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Preparando…' : 'Sortear os times'}
          </button>
        </div>
      </div>
    </div>
  );
}
