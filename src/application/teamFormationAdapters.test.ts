import assert from 'node:assert/strict';
import test from 'node:test';
import type { BalanceInputSnapshot, BalanceInputSnapshotParticipant } from '@shared/types';
import {
  fromAuthorizedSnapshot,
  fromLocalSnapshots,
  InvalidAuthorizedSnapshotError,
} from './teamFormationAdapters';

function authorizedSnapshot(
  participantOverrides: Partial<BalanceInputSnapshotParticipant> = {},
): BalanceInputSnapshot {
  return {
    snapshot_id: 'snap-1',
    session_id: 's',
    roster_revision_id: 'r',
    rubric_version: 'v0-legacy-11',
    resolver_version: 'v0-global-roster-mean-5',
    global_policy_version: 'v0-equal-community-mean',
    community_policy_version: 'v0-legacy-mad-mean',
    captured_at: '2026-09-09T00:00:00.000Z',
    input_fingerprint: 'fp-1',
    participants: [
      {
        participant_id: 'a',
        identity_kind: 'PLAYER' as const,
        display_name_at_time: 'Ana',
        attribute_vector: {
          saque: 1,
          recepcao: 2,
          levantamento: 3,
          ataque: 4,
          bloqueio: 5,
          defesa: 6,
          velocidade: 7,
          resistencia: 8,
          leituraDeJogo: 9,
          regularidade: 10,
          controleEmocional: 0,
        },
        estimated_dimensions: ['saque'],
        is_estimated: true,
        source_profile_revision: 'rev',
        height_cm: 175,
        gender: 'F',
        primary_position: 'central',
        secondary_positions: [],
        is_injured: true,
        ...participantOverrides,
      },
    ],
  } as unknown as BalanceInputSnapshot;
}

const localSnapshot = {
  participantId: 'p1',
  attack: 7,
  defense: 6,
  serve: 5,
  reception: 4,
  setting: 3,
  block: 2,
  speed: 1,
  stamina: 0,
  gameVision: 8,
  consistency: 9,
  emotionalControl: 10,
  heightCm: 180,
  gender: 'F' as const,
  position: 'oposto',
  secondaryPositions: ['ponteiro'],
  isInjured: false,
  isEstimated: true,
};

test('o adaptador local preserva ordem, orcamento e proveniencia', () => {
  const request = fromLocalSnapshots({
    snapshots: [localSnapshot, { ...localSnapshot, participantId: 'p2' }],
    teamCount: 2,
    config: { balanceSpeed: 'fast', balanceSeed: 7, rotationType: '5x1' } as never,
  });

  assert.deepEqual(
    request.participants.map((participant) => participant.participantId),
    ['p1', 'p2'],
  );
  assert.deepEqual(request.budget, { seeds: 3, maxIterations: 2000 });
  assert.equal(request.seed, 7);
  assert.deepEqual(request.provenance, { kind: 'LOCAL' });
  assert.equal(request.contractVersion, 'v1');
});

test('o adaptador autorizado traduz a chave pt da rubric e leva a digital da origem', () => {
  const snapshot = authorizedSnapshot();

  const request = fromAuthorizedSnapshot({
    snapshot,
    teamCount: 2,
    config: { balanceSpeed: 'normal' } as never,
  });

  const [participant] = request.participants;
  assert.equal(participant.participantId, 'a');
  assert.equal(participant.serve, 1);
  assert.equal(participant.reception, 2);
  assert.equal(participant.setting, 3);
  assert.equal(participant.attack, 4);
  assert.equal(participant.block, 5);
  assert.equal(participant.defense, 6);
  assert.equal(participant.speed, 7);
  assert.equal(participant.stamina, 8);
  assert.equal(participant.gameVision, 9);
  assert.equal(participant.consistency, 10);
  assert.equal(participant.emotionalControl, 0);
  assert.equal(participant.heightCm, 175);
  assert.equal(participant.isInjured, true);
  assert.equal(participant.isEstimated, true);
  assert.deepEqual(request.provenance, {
    kind: 'AUTHORIZED_SNAPSHOT',
    snapshotId: 'snap-1',
    inputFingerprint: 'fp-1',
  });
});

test('o adaptador autorizado recusa uma dimensao de rubrica ausente em vez de virar NaN', () => {
  const { ataque: _omitted, ...vectorWithoutAtaque } =
    authorizedSnapshot().participants[0].attribute_vector;
  const snapshot = authorizedSnapshot({ attribute_vector: vectorWithoutAtaque });

  assert.throws(
    () =>
      fromAuthorizedSnapshot({
        snapshot,
        teamCount: 2,
        config: { balanceSpeed: 'normal' } as never,
      }),
    InvalidAuthorizedSnapshotError,
  );
});

test('o adaptador autorizado recusa um genero inesperado em vez de aceitar por cast', () => {
  const snapshot = authorizedSnapshot({ gender: 'other' });

  assert.throws(
    () =>
      fromAuthorizedSnapshot({
        snapshot,
        teamCount: 2,
        config: { balanceSpeed: 'normal' } as never,
      }),
    InvalidAuthorizedSnapshotError,
  );
});
