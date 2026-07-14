import type { Game, Session, SessionReport, Team } from '../types';

export function getTournamentStatusView(status: Session['status']) {
  if (status === 'active') {
    return { label: 'Ativo', className: 'bg-success-muted text-success' };
  }
  if (status === 'finished') {
    return { label: 'Finalizado', className: 'bg-primary/15 text-primary' };
  }
  if (status === 'teams_generated') {
    return { label: 'Pronto', className: 'bg-success/15 text-success' };
  }
  return { label: 'Rascunho', className: 'bg-surface-strong text-text-muted' };
}

export function buildTournamentCardViewModel(input: {
  tournament: Session;
  games: Game[];
  teams: Team[];
  sessionReports: SessionReport[];
}) {
  const finishedGames = input.games.filter(
    (game) => game.sessionId === input.tournament.id && game.status === 'finished',
  ).length;
  const winnerId =
    input.tournament.status === 'finished'
      ? input.sessionReports.find((report) => report.sessionId === input.tournament.id)
          ?.teamStandings?.[0]?.teamId
      : null;
  const winnerName = winnerId
    ? (input.teams.find((team) => team.id === winnerId)?.name ?? '—')
    : '—';

  return {
    tournament: input.tournament,
    finishedGames,
    winnerName,
    status: getTournamentStatusView(input.tournament.status),
    shouldOpenLive:
      input.tournament.status === 'active' || input.tournament.status === 'teams_generated',
  };
}

export function buildTournamentListViewModel(input: {
  sessions: Session[];
  games: Game[];
  teams: Team[];
  sessionReports: SessionReport[];
}) {
  return input.sessions
    .filter((session) => session.type === 'tournament')
    .map((tournament) =>
      buildTournamentCardViewModel({
        tournament,
        games: input.games,
        teams: input.teams,
        sessionReports: input.sessionReports,
      }),
    );
}
