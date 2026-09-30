import type { FC, ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronRight, CircleCheck, CircleDashed, UserRoundCog, WifiOff } from 'lucide-react';
import type { CommunityEvaluationRosterEntry } from '@shared/types';
import {
  evaluationDisplayName,
  type EvaluationRosterView as RosterModel,
} from '@app/evaluationRosterViewModel';

type State = 'loading' | 'offline' | 'not_synced' | 'error' | 'ready';

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

const Linha: FC<{
  entry: CommunityEvaluationRosterEntry;
  onOpen: (playerId: string) => void;
}> = ({ entry, onOpen }) => {
  const nome = evaluationDisplayName(entry);
  const avaliado = !!entry.myLastEvaluatedAt;
  return (
    <li>
      <button
        type="button"
        aria-label={nome}
        className="flex w-full min-h-[56px] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-base-300/50 focus-visible:bg-base-300/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
        onClick={() => onOpen(entry.playerId)}
      >
        {avaliado ? (
          <CircleCheck className="h-5 w-5 shrink-0 text-success" aria-hidden />
        ) : (
          <CircleDashed className="h-5 w-5 shrink-0 text-base-content/40" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words font-bold leading-snug text-base-content">
            {nome}
          </span>
          {(entry.position || !entry.hasAccount) && (
            <span className="mt-0.5 block text-[11px] font-semibold uppercase tracking-wider text-base-content/55">
              {[entry.position, entry.hasAccount ? null : 'sem conta'].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        <span
          className={`shrink-0 text-xs ${avaliado ? 'font-mono tabular-nums text-base-content/65' : 'font-semibold text-base-content/80'}`}
        >
          {avaliado
            ? dataCurta.format(new Date(entry.myLastEvaluatedAt as string))
            : 'falta avaliar'}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-base-content/35" aria-hidden />
      </button>
    </li>
  );
};

function Aviso({ children, icon }: { children: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-box border border-dashed border-base-300 px-6 py-12 text-center text-sm text-base-content/75">
      {icon}
      {children}
    </div>
  );
}

export function EvaluationRosterView({
  state,
  errorMessage,
  view,
  canDesignate,
  managementPath,
  onOpen,
  onRetry,
}: {
  state: State;
  errorMessage?: string;
  view?: RosterModel;
  canDesignate: boolean;
  managementPath: string;
  onOpen: (playerCloudId: string) => void;
  onRetry: () => void;
}) {
  if (state === 'loading')
    return (
      <p role="status" className="py-12 text-center text-sm text-base-content/60">
        Carregando atletas…
      </p>
    );
  if (state === 'offline')
    return (
      <Aviso icon={<WifiOff className="h-6 w-6 text-base-content/40" aria-hidden />}>
        <p>A avaliação precisa de conexão.</p>
      </Aviso>
    );
  if (state === 'not_synced')
    return (
      <Aviso>
        <p>Ainda salvando no banco. Tente em instantes.</p>
      </Aviso>
    );
  if (state === 'error' || !view)
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-12 text-center text-sm">
        <p>{errorMessage ?? 'Não foi possível carregar os atletas.'}</p>
        <button type="button" className="btn btn-outline min-h-[44px]" onClick={onRetry}>
          Tentar de novo
        </button>
      </div>
    );

  return (
    <div className="space-y-6">
      {view.self && (
        <section className="space-y-3 rounded-box border border-warning/35 bg-warning/10 p-4">
          <ul className="overflow-hidden rounded-box bg-base-200">
            <Linha entry={view.self} onOpen={onOpen} />
          </ul>
          <p className="text-sm leading-relaxed text-base-content/85">
            <strong className="text-base-content">Você — autoavaliação provisória.</strong> Vale até
            alguém avaliar você.
          </p>
          {canDesignate && (
            <Link to={managementPath} className="btn btn-sm btn-ghost min-h-[44px] gap-2 px-3">
              <UserRoundCog className="h-4 w-4" aria-hidden /> Deixar alguém avaliar
            </Link>
          )}
        </section>
      )}

      {view.total === 0 ? (
        <Aviso>
          <p>Ninguém no elenco ainda.</p>
        </Aviso>
      ) : (
        <section className="space-y-4">
          <div className="space-y-2">
            <p className="font-semibold tabular-nums text-base-content">
              Você avaliou {view.evaluatedCount} de {view.total} atletas
            </p>
            <progress
              className="progress progress-primary h-1.5 w-full"
              value={view.evaluatedCount}
              max={view.total}
              aria-hidden
            />
            {view.pending.length === 0 && (
              <p className="text-sm text-base-content/70">
                Todos avaliados — as notas podem ser revistas a qualquer momento.
              </p>
            )}
          </div>
          <ul className="divide-y divide-base-300 overflow-hidden rounded-box border border-base-300 bg-base-200">
            {[...view.pending, ...view.evaluated].map((entry) => (
              <Linha key={entry.playerId} entry={entry} onOpen={onOpen} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
