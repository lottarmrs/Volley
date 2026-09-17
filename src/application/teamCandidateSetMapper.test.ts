import assert from 'node:assert/strict';
import test from 'node:test';
import type { Division, Player } from '@shared/types';
import { makePlayer } from '../test/fixtures';
import type { RosterRevisionRead } from './authorizedFormationGateways';
import { buildTeamCandidateSetPayload } from './teamCandidateSetMapper';

const players: Player[] = ['a', 'b', 'c', 'd'].map((id) =>
  makePlayer(id, { cloudId: `CLOUD-${id}` }),
);

const roster: RosterRevisionRead = {
  rosterRevisionId: 'r-1',
  sessionId: 's-1',
  entries: ['a', 'b', 'c', 'd'].map((id) => ({
    participantId: `p-${id}`,
    identityKind: 'PLAYER' as const,
    playerId: `cloud-${id}`,
  })),
};

function division(teams: string[][], score: number): Division {
  return {
    teams: teams.map((playerIds, index) => ({ id: `t-${index}`, playerIds })),
    score,
    penalty: 0,
    seed: 7,
    iterations: 100,
    qualityLabel: 'GOOD',
    algorithm: 'simulated-annealing-v1',
  } as unknown as Division;
}

test('maps teams and constraints to participant ids and drops orphan constraints', () => {
  const mapping = buildTeamCandidateSetPayload({
    divisions: [
      division(
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
        0.5,
      ),
      division(
        [
          ['a', 'c'],
          ['b', 'd'],
        ],
        0.7,
      ),
    ],
    constraints: {
      lockedPlayerIdxs: { a: 0, ghost: 1 },
      pairsTogether: [
        ['a', 'b'],
        ['c', 'ghost'],
      ],
      pairsSeparated: [['a', 'd']],
    },
    roster,
    players,
  });

  assert.equal(mapping.ok, true);
  if (!mapping.ok) return;
  assert.deepEqual(mapping.set, {
    teamCount: 2,
    contractVersion: 'v1',
    algorithmVersion: 'simulated-annealing-v1',
    objectivePolicyVersion: 'v0-legacy-weights',
    hardConstraints: {
      lockedParticipantTeams: { 'p-a': 0 },
      pairsTogether: [['p-a', 'p-b']],
      pairsSeparated: [['p-a', 'p-d']],
    },
    clientClaimed: { candidateCount: 2 },
    candidates: [
      {
        teams: [
          ['p-a', 'p-b'],
          ['p-c', 'p-d'],
        ],
        clientClaimed: {
          score: 0.5,
          penalty: 0,
          seed: 7,
          iterations: 100,
          qualityLabel: 'GOOD',
          algorithm: 'simulated-annealing-v1',
        },
      },
      {
        teams: [
          ['p-a', 'p-c'],
          ['p-b', 'p-d'],
        ],
        clientClaimed: {
          score: 0.7,
          penalty: 0,
          seed: 7,
          iterations: 100,
          qualityLabel: 'GOOD',
          algorithm: 'simulated-annealing-v1',
        },
      },
    ],
  });
});

test('refuses a team member without a participant, including a Player never synced', () => {
  const unsynced = makePlayer('e');
  const mapping = buildTeamCandidateSetPayload({
    divisions: [
      division(
        [
          ['a', 'b', 'e'],
          ['c', 'd', 'x'],
        ],
        1,
      ),
    ],
    constraints: undefined,
    roster,
    players: [...players, unsynced],
  });
  assert.deepEqual(mapping, { ok: false, unmappedPlayerIds: ['e', 'x'] });
});
