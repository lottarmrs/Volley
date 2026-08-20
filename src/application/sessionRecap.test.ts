import assert from 'node:assert/strict';
import test from 'node:test';
import type { SessionReport } from '@shared/types';
import { buildSessionRecap, selectLatestSessionReport } from './sessionRecap';

function buildReport(overrides: Partial<SessionReport> = {}): SessionReport {
  return {
    id: 'report-1',
    sessionId: 'session-1',
    generatedAt: '2026-08-20T22:00:00.000Z',
    sessionName: 'Pelada de quarta',
    date: '2026-08-20',
    type: 'free_play',
    rules: { maxPoints: 25, tieBreakMethod: 'vantagem' },
    totalGames: 4,
    totalPoints: 92,
    gamesByWalkover: 0,
    teamStandings: [],
    playerRanking: [],
    games: [],
    ...overrides,
  } as SessionReport;
}

test('selectLatestSessionReport ignora relatórios apagados', () => {
  const reports = [
    buildReport({ id: 'a', generatedAt: '2026-08-19T22:00:00.000Z' }),
    buildReport({ id: 'b', generatedAt: '2026-08-20T22:00:00.000Z', deletedAt: '2026-08-20' }),
  ];

  assert.equal(selectLatestSessionReport(reports)?.id, 'a');
});

test('selectLatestSessionReport devolve null sem relatórios vivos', () => {
  assert.equal(selectLatestSessionReport([]), null);
  assert.equal(selectLatestSessionReport([buildReport({ deletedAt: '2026-08-20' })]), null);
});

test('buildSessionRecap ordena o campeão por vitórias e saldo', () => {
  const recap = buildSessionRecap(
    buildReport({
      teamStandings: [
        {
          teamId: 't1',
          teamName: 'Time Azul',
          wins: 2,
          losses: 1,
          pointsFor: 60,
          pointsAgainst: 55,
          pointDifference: 5,
        },
        {
          teamId: 't2',
          teamName: 'Time Laranja',
          wins: 2,
          losses: 1,
          pointsFor: 62,
          pointsAgainst: 50,
          pointDifference: 12,
        },
      ],
    }),
  );

  assert.equal(recap?.champion?.teamName, 'Time Laranja');
  assert.equal(recap?.standings[1].teamName, 'Time Azul');
});

test('buildSessionRecap não inventa campeão quando ninguém venceu', () => {
  const recap = buildSessionRecap(
    buildReport({
      teamStandings: [
        {
          teamId: 't1',
          teamName: 'Time Azul',
          wins: 0,
          losses: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          pointDifference: 0,
        },
      ],
    }),
  );

  assert.equal(recap?.champion, null);
  assert.equal(recap?.standings.length, 1);
});

test('buildSessionRecap corta destaques em três e descarta quem não pontuou', () => {
  const ranking = ['Rafa', 'Bia', 'Léo', 'Marina'].map((playerName, index) => ({
    playerId: `p${index}`,
    playerName,
    totalPoints: index === 3 ? 0 : 10 - index,
    attacks: 0,
    blocks: index,
    aces: index,
    tips: 0,
    counterAttacks: 0,
  }));

  const recap = buildSessionRecap(buildReport({ playerRanking: ranking }));

  assert.deepEqual(
    recap?.highlights.map((highlight) => highlight.playerName),
    ['Rafa', 'Bia', 'Léo'],
  );
  assert.equal(recap?.totalPlayers, 4);
});

test('buildSessionRecap devolve null sem relatório', () => {
  assert.equal(buildSessionRecap(null), null);
});
