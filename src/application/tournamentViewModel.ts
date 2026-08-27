import type { Game, Session, SessionReport, Team } from '../types';
import { derivePhase, PHASE_LABEL, type OperationalPhase } from '@domain/sessionPhase';
import { isResultGame } from '../logic/tournament';

const PHASE_CLASS: Record<OperationalPhase, string> = {
  rascunho: 'bg-surface-strong text-text-muted',
  times_gerados: 'bg-success/15 text-success',
  pronta: 'bg-success-muted text-success',
  entre_partidas: 'bg-success-muted text-success',
  em_andamento: 'bg-success-muted text-success',
  pausada: 'bg-warning/15 text-warning',
  encerrada: 'bg-primary/15 text-primary',
};

export function getTournamentStatusView(tournament: Session, games: Game[]) {
  const phase = derivePhase(tournament, games);
  return { label: PHASE_LABEL[phase], className: PHASE_CLASS[phase] };
}

export function buildTournamentCardViewModel(input: {
  tournament: Session;
  games: Game[];
  teams: Team[];
  sessionReports: SessionReport[];
}) {
  const ownGames = input.games.filter((game) => game.sessionId === input.tournament.id);
  const finishedGames = ownGames.filter(isResultGame).length;
  const winnerId =
    input.tournament.status === 'finished'
      ? input.sessionReports.find((report) => report.sessionId === input.tournament.id)
          ?.teamStandings?.[0]?.teamId
      : null;
  const winnerName = winnerId
    ? (input.teams.find((team) => team.id === winnerId)?.name ?? '—')
    : '—';

  const phase = derivePhase(input.tournament, input.games);

  return {
    tournament: input.tournament,
    dateLabel: new Date(input.tournament.date + 'T12:00:00').toLocaleDateString('pt-BR'),
    finishedGames,
    winnerName,
    status: getTournamentStatusView(input.tournament, input.games),
    shouldOpenLive: phase !== 'rascunho' && phase !== 'encerrada',
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
