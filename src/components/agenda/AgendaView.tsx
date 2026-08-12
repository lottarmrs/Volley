import { CalendarDays } from 'lucide-react';
import type { AgendaItem } from '@app/agendaViewModel';

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    weekday: 'short',
  });
}

export function AgendaView({
  items,
  onOpen,
}: {
  items: AgendaItem[];
  onOpen: (item: AgendaItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="card card-border bg-base-200">
        <div className="card-body items-center text-center gap-2">
          <CalendarDays className="w-8 h-8 text-base-content/40" />
          <h2 className="text-base font-black uppercase tracking-tight">Nada agendado</h2>
          <p className="text-sm text-base-content/60">
            Sessões marcadas e rodadas de liga das suas comunidades aparecem aqui.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="w-full card card-border bg-base-200 text-left hover:bg-base-300 transition-colors"
          >
            <div className="card-body py-4 gap-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-black uppercase tracking-wider text-primary">
                  {formatDate(item.date)}
                </span>
                <span className="badge badge-neutral badge-sm">
                  {item.kind === 'round' ? 'Liga' : 'Sessão'}
                </span>
              </div>
              <p className="text-sm font-bold">{item.title}</p>
              <p className="text-xs text-base-content/60">{item.communityName}</p>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
