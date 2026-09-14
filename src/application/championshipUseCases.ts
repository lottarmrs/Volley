import { generateTournamentSchedule } from '../logic/tournament';
import {
  calculateTournamentStandings,
  calculateTournamentAwards,
  calculateTournamentMVP,
  calculateTopScorers,
  type TournamentStanding,
  type TournamentAwards,
  type TournamentMVP,
} from '../logic/tournament';
import {
  generateRoundDates,
  remapTeamIdsForChampionship,
  calculateAwardsByPosition,
} from '../logic/championship';
import { generateUUID } from '../logic/uuid';
import { appOk, productError, type AppResult } from './appResult';
import type {
  ChampionshipRecurrenceRule,
  ChampionshipRound,
  ChampionshipTeam,
  Game,
  Player,
  PointEvent,
  Session,
  Team,
  TournamentConfig,
} from '../types';

export interface CreateChampionshipInput {
  communityId: string;
  name: string;
  format: 'round_robin' | 'double_round_robin';
  classificationPoints: {
    win: number;
    loss: number;
    walkoverWin?: number;
    walkoverLoss?: number;
  };
  recurrenceRule: ChampionshipRecurrenceRule;
  teams: { id: string; name: string; playerIds: string[] }[];
}

export interface CreatedChampionship {
  championship: {
    communityId: string;
    name: string;
    format: 'round_robin' | 'double_round_robin';
    classificationPoints: CreateChampionshipInput['classificationPoints'];
    recurrenceRule: ChampionshipRecurrenceRule;
  };
  teams: CreateChampionshipInput['teams'];
  rounds: {
    round: number;
    teamAId: string;
    teamBId: string;
    scheduledDate: string;
    skipped: false;
  }[];
}

export function createChampionship(input: CreateChampionshipInput): AppResult<CreatedChampionship> {
  if (input.teams.length < 2) {
    return productError('invalid_input', 'Uma liga precisa de pelo menos 2 times.');
  }

  const schedule = generateTournamentSchedule(
    input.teams.map((t) => t.id),
    input.format,
  );
  const roundCount = Math.max(...schedule.map((m) => m.round), 0);
  const dates = generateRoundDates(input.recurrenceRule, roundCount);

  if (dates.length !== roundCount) {
    return productError(
      'invalid_input',
      'A recorrência informada não cobre todas as rodadas da liga.',
    );
  }

  const rounds = schedule.map((match) => ({
    round: match.round,
    teamAId: match.teamAId,
    teamBId: match.teamBId,
    scheduledDate: dates[match.round - 1],
    skipped: false as const,
  }));

  return appOk({
    championship: {
      communityId: input.communityId,
      name: input.name,
      format: input.format,
      classificationPoints: input.classificationPoints,
      recurrenceRule: input.recurrenceRule,
    },
    teams: input.teams,
    rounds,
  });
}

export function getSeasonStandings(input: {
  championshipTeamIds: string[];
  classificationPoints: {
    win: number;
    loss: number;
    walkoverWin?: number;
    walkoverLoss?: number;
  };
  sessionTeams: { id: string; championshipTeamId?: string }[];
  games: Game[];
}): TournamentStanding[] {
  const lookup = new Map(
    input.sessionTeams
      .filter((t): t is { id: string; championshipTeamId: string } => !!t.championshipTeamId)
      .map((t) => [t.id, t.championshipTeamId]),
  );
  const remappedGames = remapTeamIdsForChampionship(input.games, lookup);
  return calculateTournamentStandings(
    remappedGames,
    input.championshipTeamIds,
    input.classificationPoints,
  );
}

export interface MaterializedRound {
  session: Session;
  teams: Team[];
  game: Game;
}

export function detachChampionshipTeamBridges(
  teams: Team[],
  championshipTeamIds: ReadonlySet<string>,
  now: string,
): Team[] {
  return teams.map((team) =>
    team.championshipTeamId && championshipTeamIds.has(team.championshipTeamId)
      ? {
          ...team,
          championshipTeamId: undefined,
          syncStatus: 'pending',
          updatedAt: now,
        }
      : team,
  );
}

/**
 * Builds the local (not-yet-persisted) Session/Team/Game for a championship round,
 * per the design doc's "Materialização de rodada → sessão" section. Generates real
 * ids here (matching this codebase's existing convention, e.g. `balancing.ts`
 * assigning `id: generateUUID()` for freshly created teams) so the returned Game's
 * `sessionId`/`teamAId`/`teamBId` already point at the returned Session/Teams —
 * the caller can persist these three objects as-is.
 */
export function materializeRound(
  round: ChampionshipRound,
  teams: ChampionshipTeam[],
  communityId: string,
  now: string,
): AppResult<MaterializedRound> {
  if (round.skipped) {
    return productError('invalid_input', 'Rodada pulada não pode ser materializada.');
  }

  const championshipTeamA = teams.find((t) => t.id === round.teamAId);
  const championshipTeamB = teams.find((t) => t.id === round.teamBId);
  if (!championshipTeamA || !championshipTeamB) {
    return productError('not_found', 'Times da rodada não encontrados no elenco informado.');
  }

  const sessionId = generateUUID();
  const teamAId = generateUUID();
  const teamBId = generateUUID();

  // ponytail: fixed 2-team single-match session, so most tournament config knobs are
  // irrelevant (no bracket to generate) — reuse the app's own community defaults.
  const config: TournamentConfig = {
    type: 'tournament',
    format: 'round_robin',
    teamCount: 2,
    useGroupStage: false,
    roundTrip: false,
    maxPoints: 15,
    tieBreakMethod: 'direct_3',
    hasFinal: false,
    hasThirdPlaceMatch: false,
    classificationPoints: { win: 3, loss: 0 },
    standingsRules: [
      'classificationPoints',
      'wins',
      'pointDifference',
      'pointsFor',
      'headToHead',
      'pointsAgainst',
    ],
  };

  const zeroSnapshot = {
    overall: 0,
    attack: 0,
    reception: 0,
    setting: 0,
    defense: 0,
    block: 0,
    serve: 0,
    regularity: 0,
    stamina: 0,
    gameReading: 0,
    netPresence: 0,
    maleCount: 0,
    femaleCount: 0,
  };

  const session: Session = {
    id: sessionId,
    communityId,
    name: `${championshipTeamA.name} x ${championshipTeamB.name}`,
    date: round.scheduledDate,
    status: 'active',
    type: 'tournament',
    selectedPlayerIds: [...championshipTeamA.playerIds, ...championshipTeamB.playerIds],
    teamIds: [teamAId, teamBId],
    config,
    createdAt: now,
    updatedAt: now,
  };

  const materializedTeams: Team[] = [
    {
      id: teamAId,
      sessionId,
      name: championshipTeamA.name,
      playerIds: [...championshipTeamA.playerIds],
      generatedByAlgorithm: false,
      locked: true,
      championshipTeamId: championshipTeamA.id,
      strengthSnapshot: { ...zeroSnapshot },
    },
    {
      id: teamBId,
      sessionId,
      name: championshipTeamB.name,
      playerIds: [...championshipTeamB.playerIds],
      generatedByAlgorithm: false,
      locked: true,
      championshipTeamId: championshipTeamB.id,
      strengthSnapshot: { ...zeroSnapshot },
    },
  ];

  const game: Game = {
    id: generateUUID(),
    sessionId,
    type: 'tournament',
    sequenceNumber: 1,
    round: round.round,
    stage: 'group',
    groupId: null,
    teamAId,
    teamBId,
    scoreA: 0,
    scoreB: 0,
    status: 'scheduled',
    startedAt: null,
    pointIds: [],
    metadata: {
      originalTeamAId: teamAId,
      originalTeamBId: teamBId,
    },
  };

  return appOk({ session, teams: materializedTeams, game });
}

export type RoundPlayStatus = 'scheduled' | 'in_progress' | 'played';

export const ACTIVE_SESSION_CONFLICT_MESSAGE =
  'Já existe uma sessão em andamento. Encerre-a antes de jogar esta rodada.';

function findRoundSession(round: ChampionshipRound, sessions: Session[]): Session | undefined {
  return round.sessionId ? sessions.find((session) => session.id === round.sessionId) : undefined;
}

function isClosedSession(session: Session): boolean {
  return session.status === 'finished' || session.status === 'cancelled';
}

export function getRoundPlayStatus(round: ChampionshipRound, sessions: Session[]): RoundPlayStatus {
  const session = findRoundSession(round, sessions);
  if (!session) return 'scheduled';
  return isClosedSession(session) ? 'played' : 'in_progress';
}

/** Recusa enquanto houver outra Session ativa: ativar a da rodada por cima a descartaria. */
export function ensureNoOtherActiveSession(
  activeSession: Session | null,
  sessionId?: string,
): AppResult<void> {
  if (activeSession && activeSession.id !== sessionId) {
    return productError('conflict', ACTIVE_SESSION_CONFLICT_MESSAGE);
  }
  return appOk(undefined);
}

export type RoundSessionOpening =
  | { kind: 'live'; session: Session }
  | { kind: 'history'; sessionId: string };

export function resolveRoundSessionOpening(input: {
  round: ChampionshipRound;
  sessions: Session[];
  activeSession: Session | null;
}): AppResult<RoundSessionOpening> {
  const session = findRoundSession(input.round, input.sessions);
  if (!session) return productError('not_found', 'Esta rodada ainda não tem sessão.');
  if (isClosedSession(session)) return appOk({ kind: 'history', sessionId: session.id });

  const guard = ensureNoOtherActiveSession(input.activeSession, session.id);
  if (guard.ok === false) return guard;

  const live = input.activeSession?.id === session.id ? input.activeSession : session;
  // Rodadas materializadas antes de a sessao nascer ativa ficaram em teams_generated, fase em
  // que a tela ao vivo nao deixa iniciar a partida.
  return appOk({
    kind: 'live',
    session: live.status === 'teams_generated' ? { ...live, status: 'active' } : live,
  });
}

export function getSeasonAwards(
  pointEvents: PointEvent[],
  players: Player[],
  sessionTeams: { id: string; championshipTeamId?: string }[],
  championshipTeamIds: string[],
  classificationPoints: {
    win: number;
    loss: number;
    walkoverWin?: number;
    walkoverLoss?: number;
  },
  games: Game[],
  championshipTeams: ChampionshipTeam[],
): {
  awards: TournamentAwards;
  mvp: TournamentMVP | null;
  awardsByPosition: ReturnType<typeof calculateAwardsByPosition>;
  topScorers: ReturnType<typeof calculateTopScorers>;
} {
  const standings = getSeasonStandings({
    championshipTeamIds,
    classificationPoints,
    sessionTeams,
    games,
  });

  const awardTeams = championshipTeams.map(({ id, name, playerIds }) => ({
    id,
    name,
    playerIds,
  }));
  // The legacy tournament calculators type this read-only projection as Team[], but
  // only consume id/name/playerIds. Keep their implementation byte-identical.
  const tournamentTeams = awardTeams as Team[];
  const awards = calculateTournamentAwards(pointEvents, players, tournamentTeams, standings);
  const mvp = calculateTournamentMVP(pointEvents, tournamentTeams, players, standings);
  const awardsByPosition = calculateAwardsByPosition(pointEvents, players);
  const topScorers = calculateTopScorers(pointEvents);

  return { awards, mvp, awardsByPosition, topScorers };
}
