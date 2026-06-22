import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTournamentStandings,
  calculateTournamentAwards,
  createWalkoverResult,
  generateTournamentSchedule,
  propagateKnockoutResults,
} from './tournament';
import { Game, Player, PointEvent, Team, TournamentConfig } from '../types';

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
  standingsRules: [
    'classificationPoints',
    'wins',
    'pointDifference',
    'pointsFor',
    'headToHead',
    'pointsAgainst',
  ],
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
    assert.ok(
      schedule.every((match) => match.teamAId !== match.teamBId),
      format,
    );
  }
});

test('generateTournamentSchedule sorts matches by round ascending', () => {
  const formats = ['round_robin', 'double_round_robin', 'groups_knockout', 'group_stage'] as const;
  for (const format of formats) {
    const schedule = generateTournamentSchedule(teamIds, format, {
      ...config,
      format,
    });
    // Check that round numbers are non-decreasing
    for (let i = 1; i < schedule.length; i++) {
      assert.ok(
        schedule[i].round >= schedule[i - 1].round,
        `Format ${format} matches not sorted by round: index ${i} has round ${schedule[i].round} while index ${i - 1} has round ${schedule[i - 1].round}`
      );
    }
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

test('head-to-head breaks ties BEFORE pointsFor (regra do campeonato)', () => {
  // Ciclo a>b, b>c, c>a — todos 1 vitória (3 pts). Margens calibradas para
  // a e b empatarem em saldo (−1), mas com pointsFor diferente (a=20, b=21).
  // Como a venceu b no confronto direto, a deve ficar à frente de b.
  const cls = { win: 3, loss: 0 };
  const standings = calculateTournamentStandings(
    [
      game({
        id: 'g1',
        teamAId: 'team-a',
        teamBId: 'team-b',
        scoreA: 12,
        scoreB: 9,
        winnerTeamId: 'team-a',
        loserTeamId: 'team-b',
        status: 'finished',
      }),
      game({
        id: 'g2',
        teamAId: 'team-b',
        teamBId: 'team-c',
        scoreA: 12,
        scoreB: 10,
        winnerTeamId: 'team-b',
        loserTeamId: 'team-c',
        status: 'finished',
      }),
      game({
        id: 'g3',
        teamAId: 'team-c',
        teamBId: 'team-a',
        scoreA: 12,
        scoreB: 8,
        winnerTeamId: 'team-c',
        loserTeamId: 'team-a',
        status: 'finished',
      }),
    ],
    ['team-a', 'team-b', 'team-c'],
    cls,
  );

  assert.equal(standings[0].teamId, 'team-c'); // melhor saldo (+2)
  assert.equal(standings[1].teamId, 'team-a'); // venceu o confronto direto com b
  assert.equal(standings[2].teamId, 'team-b');
  assert.equal(standings[2].tieBreakerReason, 'confronto direto');
});

test('calculateTournamentAwards picks the leader of each category', () => {
  const players = [
    { id: 'atk', nome: 'Atacante', apelido: 'Atk' },
    { id: 'set', nome: 'Levantador', apelido: 'Set' },
    { id: 'lib', nome: 'Libero', apelido: 'Lib' },
    { id: 'blk', nome: 'Central', apelido: 'Blk' },
  ] as unknown as Player[];
  const teams = [{ id: 't1', playerIds: ['atk', 'set', 'lib', 'blk'] }] as unknown as Team[];
  const standings = [{ teamId: 't1', wins: 3, winRate: 100 }] as unknown as ReturnType<
    typeof calculateTournamentStandings
  >;

  const pt = (over: Partial<PointEvent>): PointEvent =>
    ({
      id: Math.random().toString(36).slice(2),
      sessionId: 's',
      gameId: 'g',
      sequenceNumber: 1,
      scoringTeamId: 't1',
      concedingTeamId: 't2',
      scoreBefore: { teamA: 0, teamB: 0 },
      scoreAfter: { teamA: 0, teamB: 0 },
      timestamp: '2026-01-01',
      ...over,
    }) as PointEvent;

  const points: PointEvent[] = [
    ...Array.from({ length: 5 }, () =>
      pt({ playerId: 'atk', pointType: 'winner', skill: 'ataque', assistPlayerId: 'set' }),
    ),
    ...Array.from({ length: 3 }, () =>
      pt({ playerId: 'atk', pointType: 'winner', skill: 'saque' }),
    ),
    ...Array.from({ length: 4 }, () =>
      pt({ playerId: 'blk', pointType: 'winner', skill: 'bloqueio' }),
    ),
    ...Array.from({ length: 2 }, () =>
      pt({ playerId: 'lib', pointType: 'winner', skill: 'defesa' }),
    ),
    ...Array.from({ length: 3 }, () =>
      pt({ playerId: 'lib', eventKind: 'highlight', skill: 'defesa' }),
    ),
    ...Array.from({ length: 6 }, () =>
      pt({ playerId: 'lib', eventKind: 'highlight', skill: 'recepcao' }),
    ),
  ];

  const awards = calculateTournamentAwards(points, players, teams, standings);
  assert.equal(awards.attack?.playerId, 'atk');
  assert.equal(awards.attack?.value, 5);
  assert.equal(awards.serve?.playerId, 'atk');
  assert.equal(awards.block?.playerId, 'blk');
  assert.equal(awards.setter?.playerId, 'set'); // 5 assistências
  assert.equal(awards.setter?.value, 5);
  assert.equal(awards.defense?.playerId, 'lib'); // 2 defesas + 3 lances = 5
  assert.equal(awards.defense?.value, 5);
  assert.equal(awards.reception?.playerId, 'lib'); // 6 lances de recepção
  assert.equal(awards.reception?.value, 6);
  assert.ok(awards.mvp); // MVP resolvido
});

test('round-robin with playoffs appends final and third place from standings', () => {
  const schedule = generateTournamentSchedule(teamIds, 'round_robin', {
    ...config,
    roundRobinPlayoffs: true,
  });
  // 6 jogos do grupo + 3º lugar + final
  assert.equal(schedule.length, 8);
  const final = schedule.find((m) => m.stage === 'final');
  const third = schedule.find((m) => m.stage === 'third_place');
  assert.deepEqual([final?.teamAId, final?.teamBId], ['rank:1', 'rank:2']);
  assert.deepEqual([third?.teamAId, third?.teamBId], ['rank:3', 'rank:4']);
});

test('rank:N placeholder resolves to the round-robin standings after the group', () => {
  // a 3-0, b 2-1, c 1-2, d 0-3 -> classificação a, b, c, d.
  const groupGames = [
    game({
      id: 'g1',
      teamAId: 'team-a',
      teamBId: 'team-b',
      scoreA: 12,
      scoreB: 5,
      winnerTeamId: 'team-a',
      loserTeamId: 'team-b',
      status: 'finished',
    }),
    game({
      id: 'g2',
      teamAId: 'team-a',
      teamBId: 'team-c',
      scoreA: 12,
      scoreB: 6,
      winnerTeamId: 'team-a',
      loserTeamId: 'team-c',
      status: 'finished',
    }),
    game({
      id: 'g3',
      teamAId: 'team-a',
      teamBId: 'team-d',
      scoreA: 12,
      scoreB: 7,
      winnerTeamId: 'team-a',
      loserTeamId: 'team-d',
      status: 'finished',
    }),
    game({
      id: 'g4',
      teamAId: 'team-b',
      teamBId: 'team-c',
      scoreA: 12,
      scoreB: 8,
      winnerTeamId: 'team-b',
      loserTeamId: 'team-c',
      status: 'finished',
    }),
    game({
      id: 'g5',
      teamAId: 'team-b',
      teamBId: 'team-d',
      scoreA: 12,
      scoreB: 9,
      winnerTeamId: 'team-b',
      loserTeamId: 'team-d',
      status: 'finished',
    }),
    game({
      id: 'g6',
      teamAId: 'team-c',
      teamBId: 'team-d',
      scoreA: 12,
      scoreB: 10,
      winnerTeamId: 'team-c',
      loserTeamId: 'team-d',
      status: 'finished',
    }),
  ];
  const finalGame = game({
    id: 'final',
    sequenceNumber: 7,
    teamAId: 'rank:1',
    teamBId: 'rank:2',
    stage: 'final',
    metadata: { originalTeamAId: 'rank:1', originalTeamBId: 'rank:2' },
  });

  const propagated = propagateKnockoutResults([...groupGames, finalGame], 'session', config);
  const resolvedFinal = propagated.find((g) => g.id === 'final')!;
  assert.equal(resolvedFinal.teamAId, 'team-a'); // 1º colocado
  assert.equal(resolvedFinal.teamBId, 'team-b'); // 2º colocado
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

test('calculateTournamentStandings with multi-set games sums set points correctly', () => {
  const standings = calculateTournamentStandings(
    [
      game({
        id: 'game-1',
        sequenceNumber: 1,
        teamAId: 'team-a',
        teamBId: 'team-b',
        scoreA: 2, // Sets won by A
        scoreB: 1, // Sets won by B
        sets: [
          { scoreA: 12, scoreB: 5 },
          { scoreA: 10, scoreB: 12 },
          { scoreA: 7, scoreB: 4 },
        ],
        winnerTeamId: 'team-a',
        loserTeamId: 'team-b',
        status: 'finished',
      }),
    ],
    ['team-a', 'team-b'],
    config.classificationPoints,
  );

  // team-a wins the match (3 classification points)
  assert.equal(standings[0].teamId, 'team-a');
  assert.equal(standings[0].wins, 1);
  assert.equal(standings[0].classificationPoints, 3);
  // Total points for team-a across sets: 12 + 10 + 7 = 29
  assert.equal(standings[0].pointsFor, 29);
  // Total points against team-a across sets: 5 + 12 + 4 = 21
  assert.equal(standings[0].pointsAgainst, 21);
  assert.equal(standings[0].pointDifference, 8); // 29 - 21

  // team-b loses the match (0 classification points)
  assert.equal(standings[1].teamId, 'team-b');
  assert.equal(standings[1].losses, 1);
  assert.equal(standings[1].classificationPoints, 0);
  assert.equal(standings[1].pointsFor, 21);
  assert.equal(standings[1].pointsAgainst, 29);
  assert.equal(standings[1].pointDifference, -8);
});
