import { useMemo, useState } from 'react';
import { ClipboardPaste, Search, X } from 'lucide-react';
import type { Player } from '@shared/types';
import { matchRosterNames, parseRosterInput, type QuickStartEntry } from '@app/quickStart';

function semAcento(valor: string) {
  return valor.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function PlayerPicker({
  roster,
  selectedIds,
  onSelectedChange,
  newEntries,
  onNewEntriesChange,
}: {
  roster: Player[];
  selectedIds: string[];
  onSelectedChange: (ids: string[]) => void;
  newEntries: QuickStartEntry[];
  onNewEntriesChange: (entries: QuickStartEntry[]) => void;
}) {
  const [busca, setBusca] = useState('');
  const [colando, setColando] = useState(false);
  const [colado, setColado] = useState('');

  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim());
    const ordenado = [...roster].sort((a, b) =>
      (a.apelido || a.nome).localeCompare(b.apelido || b.nome, 'pt-BR'),
    );
    if (!termo) return ordenado;
    return ordenado.filter((p) => semAcento(`${p.apelido ?? ''} ${p.nome}`).includes(termo));
  }, [busca, roster]);

  const alternar = (id: string) =>
    onSelectedChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );

  const usarLista = () => {
    const nomes = parseRosterInput(colado);
    const { matchedIds, unknownNames } = matchRosterNames(nomes, roster);
    onSelectedChange([...selectedIds, ...matchedIds.filter((id) => !selectedIds.includes(id))]);
    const jaNovos = new Set(newEntries.map((entry) => semAcento(entry.name)));
    onNewEntriesChange([
      ...newEntries,
      ...unknownNames
        .filter((name) => !jaNovos.has(semAcento(name)))
        .map((name) => ({ name, level: 3 as const, genero: 'M' as const })),
    ]);
    setColado('');
    setColando(false);
  };

  const mudarNovo = (index: number, mudanca: Partial<QuickStartEntry>) =>
    onNewEntriesChange(
      newEntries.map((entry, i) => (i === index ? { ...entry, ...mudanca } : entry)),
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label className="input input-bordered flex flex-1 items-center gap-2">
          <Search className="h-4 w-4 opacity-60" aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar no elenco"
            placeholder="Buscar no elenco"
            className="grow"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn btn-ghost min-h-11 gap-2 border-base-content/20"
          aria-expanded={colando}
          onClick={() => setColando((atual) => !atual)}
        >
          <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
          Colar lista do WhatsApp
        </button>
      </div>

      {colando && (
        <div className="space-y-2 rounded-box border border-base-300 bg-base-100 p-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-base-content/60">
              Lista colada
            </span>
            <textarea
              rows={6}
              spellCheck={false}
              className="textarea textarea-bordered w-full text-sm"
              placeholder={'1. Rafa\n2. Bia\n3. Gustavo'}
              value={colado}
              onChange={(event) => setColado(event.target.value)}
            />
          </label>
          <p className="text-xs text-base-content/60">
            Quem já é do elenco fica marcado; quem não é entra como novo.
          </p>
          <button
            type="button"
            className="btn btn-primary btn-sm min-h-10"
            disabled={!colado.trim()}
            onClick={usarLista}
          >
            Usar esta lista
          </button>
        </div>
      )}

      {newEntries.length > 0 && (
        <ul aria-label="Novos na pelada" className="flex flex-col gap-2">
          {newEntries.map((entry, index) => (
            <li
              key={`${entry.name}-${index}`}
              className="flex items-center gap-2 rounded-box border border-primary/40 bg-primary/5 px-3 py-2"
            >
              <span className="flex-1 truncate text-sm font-semibold">{entry.name}</span>
              <span className="badge badge-ghost badge-sm">novo</span>
              <div className="join">
                {(['M', 'F'] as const).map((genero) => (
                  <button
                    key={genero}
                    type="button"
                    aria-pressed={entry.genero === genero}
                    aria-label={
                      genero === 'M'
                        ? `Marcar ${entry.name} como homem`
                        : `Marcar ${entry.name} como mulher`
                    }
                    className={`btn join-item btn-xs min-h-8 w-9 ${entry.genero === genero ? 'btn-secondary' : 'btn-ghost'}`}
                    onClick={() => mudarNovo(index, { genero })}
                  >
                    {genero}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle"
                aria-label={`Tirar ${entry.name}`}
                onClick={() => onNewEntriesChange(newEntries.filter((_, i) => i !== index))}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul className="grid max-h-[50vh] grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
        {visiveis.map((player) => {
          const nome = player.apelido || player.nome;
          const marcado = selectedIds.includes(player.id);
          return (
            <li key={player.id}>
              <label
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-box border px-3 py-2 transition-colors ${
                  marcado ? 'border-primary bg-primary/10' : 'border-base-300 bg-base-100'
                }`}
              >
                <input
                  type="checkbox"
                  className="checkbox checkbox-primary checkbox-sm"
                  aria-label={nome}
                  checked={marcado}
                  onChange={() => alternar(player.id)}
                />
                <span className="truncate text-sm font-medium">{nome}</span>
              </label>
            </li>
          );
        })}
        {visiveis.length === 0 && (
          <li className="text-sm text-base-content/60">Ninguém no elenco com esse nome.</li>
        )}
      </ul>
    </div>
  );
}
