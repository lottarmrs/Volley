import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createChampionshipRequest,
  approveChampionshipRequest,
  calculateRecentForm,
} from './championshipGovernanceUseCases';
import type { Game, ChampionshipRequest } from '../types';

test('createChampionshipRequest creates a pending reschedule request', () => {
  const req = createChampionshipRequest({
    championshipId: 'champ-1',
    kind: 'reschedule_round',
    requestedByPlayerId: 'p1',
    requestedByTeamId: 'team-a',
    roundId: 'round-1',
    proposedDate: '2026-09-01T20:00',
  });
  assert.equal(req.status, 'pending');
  assert.equal(req.proposedDate, '2026-09-01T20:00');
});

test('calculateRecentForm computes last 5 games v/d badges', () => {
  const games: Partial<Game>[] = [
    { teamAId: 'team-a', teamBId: 'team-b', winnerTeamId: 'team-a', loserTeamId: 'team-b' },
    { teamAId: 'team-a', teamBId: 'team-b', winnerTeamId: 'team-b', loserTeamId: 'team-a' },
    { teamAId: 'team-a', teamBId: 'team-b', winnerTeamId: 'team-a', loserTeamId: 'team-b' },
  ];
  const form = calculateRecentForm('team-a', games as Game[]);
  assert.deepEqual(form, ['v', 'd', 'v']);
});
