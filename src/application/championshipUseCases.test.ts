import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createChampionship,
  getSeasonStandings,
  materializeRound,
  getSeasonAwards,
} from './championshipUseCases';
import type { ChampionshipRound, ChampionshipTeam, Game, PointEvent } from '../types';
import { makePlayer, makeGame } from '../test/fixtures';

test('createChampionship generates one round per abstract match from generateTournamentSchedule, each with a real date', () => {
  const result = createChampionship({
    communityId: 'community-1',
    name: 'Liga de Verao',
    format: 'round_robin',
    classificationPoints: { win: 3, loss: 0 },
    recurrenceRule: {
      daysOfWeek: [2],
      time: '20:00',
      startDate: '2026-08-01',
      endDate: null,
    },
    teams: [
      { id: 'team-1', name: 'Time A', playerIds: ['p1', 'p2'] },
      { id: 'team-2', name: 'Time B', playerIds: ['p3', 'p4'] },
      { id: 'team-3', name: 'Time C', playerIds: ['p5', 'p6'] },
    ],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  // 3 teams round_robin = 3 rounds (with a bye each round).
  assert.equal(result.value.rounds.length, 3);
  assert.ok(result.value.rounds.every((r) => !!r.scheduledDate));
  assert.ok(result.value.rounds.every((r) => r.round >= 1 && r.round <= 3));
});

test('createChampionship rejects fewer than 2 teams', () => {
  const result = createChampionship({
    communityId: 'community-1',
    name: 'Liga Curta',
    format: 'round_robin',
    classificationPoints: { win: 3, loss: 0 },
    recurrenceRule: { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01', endDate: null },
    teams: [{ id: 'team-1', name: 'Time A', playerIds: ['p1'] }],
  });

  assert.equal(result.ok, false);
});

test('createChampionship rejects a recurrence window that cannot schedule every round', () => {
  const result = createChampionship({
    communityId: 'community-1',
    name: 'Liga curta demais',
    format: 'round_robin',
    classificationPoints: { win: 3, loss: 0 },
    recurrenceRule: {
      daysOfWeek: [2],
      time: '20:00',
      startDate: '2026-08-01',
      endDate: '2026-08-04',
    },
    teams: [
      { id: 'team-1', name: 'Time A', playerIds: ['p1'] },
      { id: 'team-2', name: 'Time B', playerIds: ['p2'] },
      { id: 'team-3', name: 'Time C', playerIds: ['p3'] },
      { id: 'team-4', name: 'Time D', playerIds: ['p4'] },
    ],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error.message, /recorrência/i);
});

test('getSeasonStandings aggregates games across multiple sessions using the championshipTeamId remap', () => {
  const teams = [
    { id: 'session1-teamA', championshipTeamId: 'champ-team-1' },
    { id: 'session1-teamB', championshipTeamId: 'champ-team-2' },
    { id: 'session2-teamA', championshipTeamId: 'champ-team-1' },
    { id: 'session2-teamB', championshipTeamId: 'champ-team-2' },
  ];
  const games = [
    makeGame('g1', 'session-1', {
      teamAId: 'session1-teamA',
      teamBId: 'session1-teamB',
      winnerTeamId: 'session1-teamA',
      loserTeamId: 'session1-teamB',
      status: 'finished',
    }),
    makeGame('g2', 'session-2', {
      teamAId: 'session2-teamA',
      teamBId: 'session2-teamB',
      winnerTeamId: 'session2-teamB',
      loserTeamId: 'session2-teamA',
      status: 'finished',
    }),
  ];

  const standings = getSeasonStandings({
    championshipTeamIds: ['champ-team-1', 'champ-team-2'],
    classificationPoints: { win: 3, loss: 0 },
    sessionTeams: teams,
    games,
  });

  const team1 = standings.find((s) => s.teamId === 'champ-team-1')!;
  const team2 = standings.find((s) => s.teamId === 'champ-team-2')!;
  assert.equal(team1.wins, 1);
  assert.equal(team1.losses, 1);
  assert.equal(team2.wins, 1);
  assert.equal(team2.losses, 1);
});

// ─── materializeRound ──────────────────────────────────────────────────────

function championshipTeam(overrides: Partial<ChampionshipTeam> = {}): ChampionshipTeam {
  return {
    id: 'champ-team-1',
    championshipId: 'champ-1',
    name: 'Time A',
    playerIds: ['p1', 'p2'],
    updatedAt: '2026-07-25T00:00:00.000Z',
    ...overrides,
  };
}

function championshipRound(overrides: Partial<ChampionshipRound> = {}): ChampionshipRound {
  return {
    id: 'round-1',
    championshipId: 'champ-1',
    round: 1,
    teamAId: 'champ-team-1',
    teamBId: 'champ-team-2',
    scheduledDate: '2026-08-04T20:00',
    skipped: false,
    updatedAt: '2026-07-25T00:00:00.000Z',
    ...overrides,
  };
}

test('materializeRound rejects a skipped round without materializing anything', () => {
  const round = championshipRound({ skipped: true });
  const teamA = championshipTeam({ id: 'champ-team-1', playerIds: ['p1', 'p2'] });
  const teamB = championshipTeam({ id: 'champ-team-2', name: 'Time B', playerIds: ['p3', 'p4'] });

  const result = materializeRound(round, [teamA, teamB], 'community-1', '2026-08-04T00:00:00.000Z');

  assert.equal(result.ok, false);
});

test('materializeRound builds a Session/Teams/Game whose team playerIds match the source ChampionshipTeams', () => {
  const round = championshipRound();
  const teamA = championshipTeam({ id: 'champ-team-1', name: 'Time A', playerIds: ['p1', 'p2'] });
  const teamB = championshipTeam({ id: 'champ-team-2', name: 'Time B', playerIds: ['p3', 'p4'] });

  const result = materializeRound(round, [teamA, teamB], 'community-1', '2026-08-04T00:00:00.000Z');

  assert.equal(result.ok, true);
  if (!result.ok) return;

  const { session, teams, game } = result.value;

  assert.equal(session.communityId, 'community-1');
  assert.equal(session.type, 'tournament');
  assert.equal(session.date, round.scheduledDate);

  assert.equal(teams.length, 2);
  const materializedA = teams.find((t) => t.championshipTeamId === 'champ-team-1')!;
  const materializedB = teams.find((t) => t.championshipTeamId === 'champ-team-2')!;
  assert.deepEqual(materializedA.playerIds, teamA.playerIds);
  assert.deepEqual(materializedB.playerIds, teamB.playerIds);
  assert.equal(materializedA.generatedByAlgorithm, false);
  assert.equal(materializedA.locked, true);

  assert.equal(game.teamAId, materializedA.id);
  assert.equal(game.teamBId, materializedB.id);
  assert.equal(game.sessionId, session.id);
  assert.equal(session.teamIds.includes(materializedA.id), true);
  assert.equal(session.teamIds.includes(materializedB.id), true);
});

test('materializeRound rejects a round whose teams are not found in the given roster', () => {
  const round = championshipRound({ teamAId: 'missing-team' });
  const teamB = championshipTeam({ id: 'champ-team-2' });

  const result = materializeRound(round, [teamB], 'community-1', '2026-08-04T00:00:00.000Z');

  assert.equal(result.ok, false);
});

// ─── getSeasonAwards ───────────────────────────────────────────────────────

function pointEvent(overrides: Partial<PointEvent> = {}): PointEvent {
  return {
    id: `pt-${Math.random()}`,
    sessionId: 'session-1',
    gameId: 'g1',
    sequenceNumber: 1,
    scoringTeamId: 'session1-teamA',
    concedingTeamId: 'session1-teamB',
    scoreBefore: { teamA: 0, teamB: 0 },
    scoreAfter: { teamA: 1, teamB: 0 },
    timestamp: '2026-08-04T20:00:00.000Z',
    pointType: 'winner',
    ...overrides,
  };
}

test('getSeasonAwards reflects players across two different sessions point events, not just one', () => {
  const players = [makePlayer('p1'), makePlayer('p2')];
  const championshipTeams = [
    championshipTeam({ id: 'champ-team-1', name: 'Time A', playerIds: ['p1'] }),
    championshipTeam({ id: 'champ-team-2', name: 'Time B', playerIds: ['p2'] }),
  ];
  const sessionTeams = [
    { id: 'session1-teamA', championshipTeamId: 'champ-team-1' },
    { id: 'session1-teamB', championshipTeamId: 'champ-team-2' },
    { id: 'session2-teamA', championshipTeamId: 'champ-team-1' },
    { id: 'session2-teamB', championshipTeamId: 'champ-team-2' },
  ];
  const games: Game[] = [
    makeGame('g1', 'session-1', {
      teamAId: 'session1-teamA',
      teamBId: 'session1-teamB',
      winnerTeamId: 'session1-teamA',
      loserTeamId: 'session1-teamB',
      status: 'finished',
    }),
    makeGame('g2', 'session-2', {
      teamAId: 'session2-teamA',
      teamBId: 'session2-teamB',
      winnerTeamId: 'session2-teamA',
      loserTeamId: 'session2-teamB',
      status: 'finished',
    }),
  ];
  // p1 scores once in session 1, three times in session 2 -> should outrank p2 (2 points, session 1 only).
  const pointEvents: PointEvent[] = [
    pointEvent({ id: 'pt1', sessionId: 'session-1', gameId: 'g1', playerId: 'p1', skill: 'ataque' }),
    pointEvent({ id: 'pt2', sessionId: 'session-1', gameId: 'g1', playerId: 'p2', skill: 'ataque' }),
    pointEvent({ id: 'pt3', sessionId: 'session-1', gameId: 'g1', playerId: 'p2', skill: 'ataque' }),
    pointEvent({ id: 'pt4', sessionId: 'session-2', gameId: 'g2', playerId: 'p1', skill: 'ataque' }),
    pointEvent({ id: 'pt5', sessionId: 'session-2', gameId: 'g2', playerId: 'p1', skill: 'ataque' }),
    pointEvent({ id: 'pt6', sessionId: 'session-2', gameId: 'g2', playerId: 'p1', skill: 'ataque' }),
  ];

  const result = getSeasonAwards(
    pointEvents,
    players,
    sessionTeams,
    ['champ-team-1', 'champ-team-2'],
    { win: 3, loss: 0 },
    games,
    championshipTeams,
  );

  assert.equal(result.mvp?.playerId, 'p1');
  assert.equal(result.mvp?.totalPoints, 4);
  assert.equal(result.mvp?.teamName, 'Time A');
  assert.equal(result.mvp?.teamWinRate, 100);
  assert.equal(result.mvp?.mvpScore, 5.5);
  assert.equal(result.awards.mvp?.teamName, 'Time A');
  assert.equal(result.awards.attack?.teamName, 'Time A');
  const p1TopScorer = result.topScorers.find((s) => s.playerId === 'p1')!;
  assert.equal(p1TopScorer.totalPoints, 4);
});
