import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTournamentStandings,
  createWalkoverResult,
  generateTournamentSchedule,
  propagateKnockoutResults,
} from './tournament';
import { Game, TournamentConfig } from '../types';

const teamIds = ['team-a', 'team-b', 'team-c', 'team-d'];

const config: TournamentConfig = {
  type: 'tournament',
  format: 'round_robin',
  teamCount: 4,
  useGroupStage: false,
  roundTrip: false,
  maxPoints: 15,
  tieBreakMethod: 'win_by_2',
  victoryRule: 'win_by_2',
  hasFinal: true,
  hasThirdPlaceMatch: true,
  classificationPoints: { win: 3, loss: 0, walkoverWin: 3, walkoverLoss: 0 },
  standingsRules: ['classificationPoints', 'wins', 'pointDifference', 'pointsFor', 'headToHead', 'pointsAgainst'],
};

function game(input: Partial<Game> & Pick<Game, 'id' | 'teamAId' | 'teamBId'>): Game {
  return {
    sessionId: 'session',
    type: 'tournament',
    sequenceNumber: 1,
    scoreA: 0,
    scoreB: 0,
    status: 'scheduled',
    pointIds: [],
    ...input,
  };
}

test('generateTournamentSchedule creates expected match counts and no self matches', () => {
  const expectedCounts = {
    round_robin: 6,
    double_round_robin: 12,
    knockout: 4,
    group_stage: 2,
    groups_knockout: 6,
  } as const;

  for (const [format, expectedCount] of Object.entries(expectedCounts)) {
    const schedule = generateTournamentSchedule(teamIds, format as keyof typeof expectedCounts, {
      ...config,
      format: format as TournamentConfig['format'],
    });

    assert.equal(schedule.length, expectedCount, format);
    assert.ok(schedule.every((match) => match.teamAId !== match.teamBId), format);
  }
});

test('calculateTournamentStandings sorts by points, wins and point difference', () => {
  const standings = calculateTournamentStandings(
    [
      game({
        id: 'game-1',
        sequenceNumber: 1,
        teamAId: 'team-a',
        teamBId: 'team-b',
        scoreA: 15,
        scoreB: 10,
        winnerTeamId: 'team-a',
        loserTeamId: 'team-b',
        status: 'finished',
      }),
      game({
        id: 'game-2',
        sequenceNumber: 2,
        teamAId: 'team-c',
        teamBId: 'team-d',
        scoreA: 15,
        scoreB: 14,
        winnerTeamId: 'team-c',
        loserTeamId: 'team-d',
        status: 'finished',
      }),
    ],
    teamIds,
    config.classificationPoints,
  );

  assert.equal(standings[0].teamId, 'team-a');
  assert.equal(standings[0].classificationPoints, 3);
  assert.equal(standings[0].pointDifference, 5);
  assert.equal(standings[1].teamId, 'team-c');
});

test('walkovers and knockout propagation update dependent placeholder matches', () => {
  const semifinal = createWalkoverResult(
    game({
      id: 'game-1',
      sequenceNumber: 1,
      teamAId: 'team-a',
      teamBId: 'team-b',
    }),
    'team-a',
    15,
  );

  assert.equal(semifinal.status, 'walkover');
  assert.equal(semifinal.scoreA, 15);
  assert.equal(semifinal.scoreB, 0);

  const games = [
    semifinal,
    game({
      id: 'game-2',
      sequenceNumber: 2,
      teamAId: 'winner:1',
      teamBId: 'team-c',
      metadata: {
        originalTeamAId: 'winner:1',
        originalTeamBId: 'team-c',
      },
    }),
  ];

  const propagated = propagateKnockoutResults(games, 'session', config);
  assert.equal(propagated[1].teamAId, 'team-a');
});
