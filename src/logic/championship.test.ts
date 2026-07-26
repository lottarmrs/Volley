import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRoundDates,
  calculateAwardsByPosition,
  remapTeamIdsForChampionship,
} from './championship';
import type { PointEvent, Player } from '../types';

test('generateRoundDates', async (t) => {
  await t.test('generates dates on a single weekly day at the given time', () => {
    // 2026-08-04 is a Tuesday.
    const dates = generateRoundDates(
      { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01', endDate: null },
      3,
    );
    assert.deepEqual(dates, ['2026-08-04T20:00', '2026-08-11T20:00', '2026-08-18T20:00']);
  });

  await t.test('alternates between multiple days of the week in calendar order', () => {
    // 2026-08-01 is a Saturday; Tue=2, Thu=4.
    const dates = generateRoundDates(
      { daysOfWeek: [2, 4], time: '19:30', startDate: '2026-08-01', endDate: null },
      4,
    );
    assert.deepEqual(dates, [
      '2026-08-04T19:30',
      '2026-08-06T19:30',
      '2026-08-11T19:30',
      '2026-08-13T19:30',
    ]);
  });

  await t.test('stops producing dates past endDate even if roundCount is not reached', () => {
    const dates = generateRoundDates(
      { daysOfWeek: [2], time: '20:00', startDate: '2026-08-01', endDate: '2026-08-10' },
      10,
    );
    assert.deepEqual(dates, ['2026-08-04T20:00']);
  });

  await t.test('starts on startDate itself when startDate already falls on a matching day', () => {
    // 2026-08-04 is already a Tuesday.
    const dates = generateRoundDates(
      { daysOfWeek: [2], time: '20:00', startDate: '2026-08-04', endDate: null },
      1,
    );
    assert.deepEqual(dates, ['2026-08-04T20:00']);
  });
});

test('calculateAwardsByPosition', async (t) => {
  const players: Player[] = [
    { id: 'p1', nome: 'Ana', posicaoPrincipal: 'ponteiro' } as Player,
    { id: 'p2', nome: 'Bea', posicaoPrincipal: 'ponteiro' } as Player,
    { id: 'p3', nome: 'Cau', posicaoPrincipal: 'libero' } as Player,
  ];

  function point(playerId: string, skill: PointEvent['skill']): PointEvent {
    return {
      id: `pt-${Math.random()}`,
      sessionId: 's1',
      gameId: 'g1',
      sequenceNumber: 1,
      scoringTeamId: 'teamA',
      concedingTeamId: 'teamB',
      playerId,
      skill,
      pointType: 'winner',
      scoreBefore: { teamA: 0, teamB: 0 },
      scoreAfter: { teamA: 1, teamB: 0 },
    } as PointEvent;
  }

  await t.test('picks the top scorer within each position, not overall', () => {
    const pointEvents = [
      point('p1', 'ataque'),
      point('p1', 'ataque'),
      point('p2', 'ataque'),
      point('p3', 'defesa'),
      point('p3', 'defesa'),
      point('p3', 'defesa'),
    ];

    const awards = calculateAwardsByPosition(pointEvents, players);

    assert.strictEqual(awards.ponteiro?.playerId, 'p1');
    assert.strictEqual(awards.ponteiro?.value, 2);
    assert.strictEqual(awards.libero?.playerId, 'p3');
    assert.strictEqual(awards.libero?.value, 3);
    assert.strictEqual(awards.central, undefined);
  });
});

test('remapTeamIdsForChampionship', async (t) => {
  await t.test('rewrites teamAId/teamBId/winnerTeamId/loserTeamId using the championshipTeamId lookup', () => {
    const games = [
      {
        id: 'g1',
        teamAId: 'session-team-1',
        teamBId: 'session-team-2',
        winnerTeamId: 'session-team-1',
        loserTeamId: 'session-team-2',
      },
      {
        id: 'g2',
        teamAId: 'session-team-2',
        teamBId: 'session-team-1',
        winnerTeamId: 'session-team-1',
        loserTeamId: 'session-team-2',
      },
    ];
    const lookup = new Map([
      ['session-team-1', 'champ-team-A'],
      ['session-team-2', 'champ-team-B'],
    ]);

    const remapped = remapTeamIdsForChampionship(games, lookup);

    assert.deepEqual(remapped, [
      {
        id: 'g1',
        teamAId: 'champ-team-A',
        teamBId: 'champ-team-B',
        winnerTeamId: 'champ-team-A',
        loserTeamId: 'champ-team-B',
      },
      {
        id: 'g2',
        teamAId: 'champ-team-B',
        teamBId: 'champ-team-A',
        winnerTeamId: 'champ-team-A',
        loserTeamId: 'champ-team-B',
      },
    ]);
  });

  await t.test('leaves winnerTeamId/loserTeamId undefined untouched (not every game has a result yet)', () => {
    const games = [
      {
        id: 'g1',
        teamAId: 'session-team-1',
        teamBId: 'session-team-2',
        winnerTeamId: undefined,
        loserTeamId: undefined,
      },
    ];
    const lookup = new Map([
      ['session-team-1', 'champ-team-A'],
      ['session-team-2', 'champ-team-B'],
    ]);

    const remapped = remapTeamIdsForChampionship(games, lookup);

    assert.strictEqual(remapped[0].winnerTeamId, undefined);
    assert.strictEqual(remapped[0].loserTeamId, undefined);
  });

  await t.test('leaves a game unchanged if its team id has no entry in the lookup', () => {
    const games = [
      { id: 'g1', teamAId: 'unknown-team', teamBId: 'session-team-1', winnerTeamId: undefined, loserTeamId: undefined },
    ];
    const lookup = new Map([['session-team-1', 'champ-team-A']]);

    const remapped = remapTeamIdsForChampionship(games, lookup);

    assert.deepEqual(remapped, [
      { id: 'g1', teamAId: 'unknown-team', teamBId: 'champ-team-A', winnerTeamId: undefined, loserTeamId: undefined },
    ]);
  });
});
