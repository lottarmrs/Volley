import { Plus, Trophy } from 'lucide-react';
import { buildTournamentListViewModel } from '../../application/tournamentViewModel';
import type { Game, Session, SessionReport, Team } from '../../types';

interface TournamentsModuleProps {
  sessions: Session[];
  games: Game[];
  teams: Team[];
  sessionReports: SessionReport[];
  onNewTournament: () => void;
  onOpenTournament: (tournament: Session, shouldOpenLive: boolean) => void;
}

export function TournamentsModule({
  sessions,
  games,
  teams,
  sessionReports,
  onNewTournament,
  onOpenTournament,
}: TournamentsModuleProps) {
  const tournamentCards = buildTournamentListViewModel({
    sessions,
    games,
    teams,
    sessionReports,
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-surface p-4 rounded-xl border border-border">
        <span className="text-xs font-bold text-text-muted uppercase">Torneios Registrados</span>
        <button
          onClick={onNewTournament}
          className="btn btn-primary rounded-full uppercase tracking-wider text-xs"
        >
          <Plus className="w-4 h-4" /> Novo Torneio
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tournamentCards.map((card) => {
          const t = card.tournament;
          return (
            <div
              key={t.id}
              className="card card-border bg-base-200 p-6 rounded-2xl flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex justify-between items-start">
                  <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-[9px] font-bold text-primary uppercase">
                    Torneio
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${card.status.className}`}
                  >
                    {card.status.label}
                  </span>
                </div>
                <h3 className="font-bold text-lg text-base-content uppercase mt-3 tracking-tight">
                  {t.name}
                </h3>
                <p className="text-[10px] text-text-subtle font-mono uppercase mt-1">
                  Data: {card.dateLabel}
                </p>
              </div>

              <div className="bg-surface-muted p-3.5 rounded-xl border border-border space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-text-muted">Partidas Realizadas:</span>
                  <span className="font-bold font-mono text-base-content">
                    {card.finishedGames}
                  </span>
                </div>
                {t.status === 'finished' && (
                  <div className="flex justify-between items-center text-xs border-t border-border pt-2 mt-2">
                    <span className="text-text-muted flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-accent" /> Campeão:
                    </span>
                    <span className="font-black text-accent uppercase">{card.winnerName}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => onOpenTournament(t, card.shouldOpenLive)}
                className="btn btn-secondary rounded-full w-full uppercase tracking-wider text-xs"
              >
                Ver Detalhes
              </button>
            </div>
          );
        })}
        {tournamentCards.length === 0 && (
          <div className="col-span-full py-20 card card-border border-dashed bg-base-200 text-center">
            <p className="text-base-content/60 uppercase text-xs font-bold italic">
              Nenhum torneio cadastrado.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
