import test from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptChampionshipRequest,
  createChampionshipRequest,
  approveChampionshipRequest,
  calculateRecentForm,
  isRequestOpen,
  rejectChampionshipRequest,
} from './championshipGovernanceUseCases';
import type { Game, ChampionshipRequest } from '../types';

function pendingRequest(): ChampionshipRequest {
  return createChampionshipRequest({
    championshipId: 'champ-1',
    kind: 'reschedule_round',
    requestedByPlayerId: 'p1',
    requestedByTeamId: 'team-a',
    roundId: 'round-1',
    proposedDate: '2026-09-01T20:00',
  });
}

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

test('o capitao adversario aceita e fica registrado na solicitacao', () => {
  const aceita = acceptChampionshipRequest(pendingRequest(), 'capitao-b');
  assert.equal(aceita.status, 'accepted');
  assert.equal(aceita.acceptedByCaptainId, 'capitao-b');
});

test('a recusa encerra a solicitacao', () => {
  assert.equal(rejectChampionshipRequest(pendingRequest()).status, 'rejected');
});

test('a aprovacao registra quem confirmou', () => {
  const aprovada = approveChampionshipRequest(pendingRequest(), 'admin-1');
  assert.equal(aprovada.status, 'approved');
  assert.equal(aprovada.approvedByAdminId, 'admin-1');
});

test('pendente e aceita continuam abertas; aprovada e recusada sao terminais', () => {
  const pendente = pendingRequest();
  assert.equal(isRequestOpen(pendente), true);
  assert.equal(isRequestOpen(acceptChampionshipRequest(pendente, 'capitao-b')), true);
  assert.equal(isRequestOpen(approveChampionshipRequest(pendente, 'admin-1')), false);
  assert.equal(isRequestOpen(rejectChampionshipRequest(pendente)), false);
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
