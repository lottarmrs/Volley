import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ClipboardList, Shuffle, Sparkles, Users } from 'lucide-react';
import { Link } from 'react-router';
import { paths } from '@app/appRoutes';
import {
  describeRosterReadiness,
  parseRosterInput,
  QUICK_START_MIN_PLAYERS,
  levelToNumericStars,
  type QuickStartEntry,
  type QuickStartLevel,
} from '@app/quickStart';
import { StarRating } from '../../ui/StarRating';

const EXEMPLO = [
  'Rafa',
  'Bia',
  'Gustavo',
  'Camila',
  'Thiago',
  'Juliana',
  'Léo',
  'Marina',
  'Diego',
  'Paula',
  'Vinícius',
  'Larissa',
].join('\n');

interface QuickStartViewProps {
  onSortear: (entries: QuickStartEntry[]) => void;
  /** Convidado só pode sortear localmente; com conta, entrar numa turma existente é caminho real. */
  isGuest?: boolean;
}

export function QuickStartView({ onSortear, isGuest = true }: QuickStartViewProps) {
  const [raw, setRaw] = useState('');
  const [triagem, setTriagem] = useState<QuickStartEntry[] | null>(null);

  const names = useMemo(() => parseRosterInput(raw), [raw]);
  const readiness = describeRosterReadiness(names.length);

  const irParaTriagem = () => {
    setTriagem(names.map((name) => ({ name, level: 3 as QuickStartLevel, genero: 'M' as const })));
  };

  const patch = (index: number, changes: Partial<QuickStartEntry>) => {
    setTriagem((prev) =>
      prev ? prev.map((entry, i) => (i === index ? { ...entry, ...changes } : entry)) : prev,
    );
  };

  if (triagem) {
    const homens = triagem.filter((entry) => entry.genero === 'M').length;
    const mulheres = triagem.filter((entry) => entry.genero === 'F').length;

    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
        <button
          type="button"
          onClick={() => setTriagem(null)}
          className="btn btn-ghost min-h-[44px] w-fit gap-2 px-3 text-xs font-bold uppercase tracking-wider text-base-content/60 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Mudar a lista
        </button>

        <div className="space-y-3">
          <h2 className="text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
            Como cada um joga?
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-base-content/70">
            Avalie o nível aproximado de cada atleta de 1 a 5 estrelas. O sorteio utiliza esta
            pontuação para equilibrar perfeitamente as equipes.
          </p>
          <p className="max-w-prose text-xs leading-relaxed text-base-content/60">
            Marque o gênero dos atletas: O balanceamento considera o gênero.{' '}
            <span className="font-bold text-primary">
              {homens} {homens === 1 ? 'homem' : 'homens'}
            </span>
            {' • '}
            <span className="font-bold text-secondary">
              {mulheres} {mulheres === 1 ? 'mulher' : 'mulheres'}
            </span>
            .
          </p>
        </div>

        <ul className="flex flex-col gap-2.5">
          {triagem.map((entry, index) => {
            const numericStars = levelToNumericStars(entry.level);
            return (
              <li
                key={`${entry.name}-${index}`}
                className="flex flex-col gap-3 rounded-2xl border border-base-300 bg-base-200/90 p-3.5 sm:flex-row sm:items-center sm:justify-between shadow-sm hover:border-warning/30 transition-colors"
              >
                <span className="truncate text-sm font-extrabold text-white uppercase tracking-wide min-w-28">
                  {entry.name}
                </span>

                <div className="flex flex-wrap items-center gap-3 justify-between sm:justify-end flex-1">
                  {/* Star Rating per player */}
                  <div className="bg-base-300/80 px-3 py-1.5 rounded-xl border border-base-300/60 flex items-center shrink-0 w-[300px] sm:w-[325px] justify-between">
                    <StarRating
                      value={numericStars}
                      onChange={(stars) => patch(index, { level: stars })}
                      size="sm"
                      showLabel={true}
                    />
                  </div>

                  {/* Gender Selector */}
                  <div className="join border border-base-300 rounded-xl overflow-hidden">
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
                        onClick={() => patch(index, { genero })}
                        className={`btn join-item min-h-[36px] h-9 w-11 text-xs font-black uppercase border-none ${
                          entry.genero === genero
                            ? 'btn-secondary text-secondary-content shadow-sm'
                            : 'btn-ghost text-base-content/50 hover:text-base-content'
                        }`}
                      >
                        {genero}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <button
          type="button"
          onClick={() => onSortear(triagem)}
          className="btn btn-primary min-h-[52px] gap-2 px-6 text-base font-black uppercase tracking-wider shadow-card"
        >
          <Shuffle className="h-5 w-5" />
          Sortear times equilibrados
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 py-6">
      <div className="space-y-3">
        <h2 className="text-2xl font-black uppercase tracking-tight text-white sm:text-3xl">
          Quem vai jogar hoje?
        </h2>
        <p className="max-w-prose text-sm leading-relaxed text-base-content/70">
          Cole a lista do grupo, um nome por linha. A numeração do WhatsApp pode vir junto — a gente
          limpa.
        </p>
      </div>

      <div className="space-y-3">
        <label htmlFor="quick-start-roster" className="sr-only">
          Lista de atletas
        </label>
        <textarea
          id="quick-start-roster"
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          rows={10}
          spellCheck={false}
          placeholder={'1. Rafa\n2. Bia\n3. Gustavo\n4. Camila'}
          className="textarea w-full rounded-xl border-base-300 bg-base-300/60 p-4 text-sm leading-relaxed text-white placeholder:text-base-content/35 focus:border-primary"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            aria-live="polite"
            className={`text-xs font-bold uppercase tracking-wide ${
              readiness.ready ? 'text-success' : 'text-base-content/60'
            }`}
          >
            {readiness.message}
          </p>

          <button
            type="button"
            onClick={() => setRaw(EXEMPLO)}
            className="btn btn-ghost min-h-[44px] gap-2 px-3 text-xs font-bold uppercase tracking-wide text-base-content/60 hover:text-white"
          >
            <Sparkles className="h-4 w-4" />
            Usar uma pelada de exemplo
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={irParaTriagem}
        disabled={!readiness.ready}
        className="btn btn-primary min-h-[52px] gap-2 px-6 text-base font-black uppercase tracking-wider shadow-card disabled:opacity-40"
      >
        <ArrowRight className="h-5 w-5" />
        {names.length === 0
          ? 'Continuar'
          : `Continuar com ${names.length} ${names.length === 1 ? 'atleta' : 'atletas'}`}
      </button>

      {isGuest ? (
        <p className="flex items-start gap-2 text-xs leading-relaxed text-base-content/50">
          <ClipboardList className="mt-0.5 h-4 w-4 shrink-0" />
          Tudo fica salvo neste aparelho. Você não precisa de conta para sortear e marcar a pelada
          de hoje.
        </p>
      ) : (
        /* Com conta e sem comunidade nenhuma, quem chega pode não ser o organizador:
           pode ser o atleta que criou conta justamente para entrar no grupo dos outros. */
        <div className="flex flex-col gap-3 border-t border-base-300 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-base-content/70">
            Não é você quem organiza? Sua turma pode já estar aqui.
          </p>
          <Link
            to={paths.comunidades}
            className="btn btn-outline min-h-[44px] shrink-0 gap-2 px-5 text-xs font-bold uppercase tracking-wider"
          >
            <Users className="h-4 w-4" />
            Procurar minha pelada
          </Link>
        </div>
      )}
    </div>
  );
}
