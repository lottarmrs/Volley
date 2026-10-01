import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import type { Session } from '@shared/types';
import { paths } from '@app/appRoutes';

const SITUACAO: Partial<Record<Session['status'], string>> = {
  active: 'Rolando agora',
  paused: 'Rolando agora',
  teams_generated: 'Times sorteados',
};

function quando(session: Session) {
  const [ano, mes, dia] = session.date.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
  const hora = session.plannedStartAt
    ? new Date(session.plannedStartAt).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;
  return [data, hora, session.location || null].filter(Boolean).join(' · ');
}

export function OpenPeladasList({
  communityId,
  sessions,
  today,
}: {
  communityId: string;
  sessions: Session[];
  today: string;
}) {
  if (sessions.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wider text-base-content/60">Em aberto</h2>
      <ul aria-label="Peladas em aberto" className="flex flex-col gap-2">
        {sessions.map((session) => {
          const situacao =
            SITUACAO[session.status] ?? (session.date < today ? 'Passou da data' : 'Marcada');
          const atrasada = situacao === 'Passou da data';
          return (
            <li key={session.id}>
              <Link
                to={paths.inscricao(communityId, session.id)}
                className="flex min-h-14 items-center gap-3 rounded-box border border-base-300 bg-base-200 px-4 py-3 transition-colors hover:border-primary/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-base-content">{session.name}</p>
                  <p className="text-xs text-base-content/70">{quando(session)}</p>
                </div>
                <span
                  className={`badge badge-sm shrink-0 ${atrasada ? 'badge-warning' : 'badge-ghost'}`}
                >
                  {situacao}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
