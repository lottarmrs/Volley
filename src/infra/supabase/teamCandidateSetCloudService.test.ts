import assert from 'node:assert/strict';
import test from 'node:test';
import type { TeamCandidateSetPayload } from '@shared/types';
import { createTeamCandidateSetCloudService } from './teamCandidateSetCloudService';

function recording(data: unknown, error: { code?: string; message: string } | null = null) {
  const calls: [string, Record<string, unknown>][] = [];
  const service = createTeamCandidateSetCloudService({
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data, error };
    },
  });
  return { service, calls };
}

const SET: TeamCandidateSetPayload = {
  teamCount: 2,
  contractVersion: 'v1',
  algorithmVersion: 'simulated-annealing-v1',
  objectivePolicyVersion: 'v0-legacy-weights',
  hardConstraints: { lockedParticipantTeams: {}, pairsTogether: [], pairsSeparated: [] },
  clientClaimed: {},
  candidates: [{ teams: [['p-1'], ['p-2']], clientClaimed: { score: 1 } }],
};

test('publish sends command, session, snapshot and set and returns the set id and fingerprint', async () => {
  const { service, calls } = recording({ set_id: 'c-1', set_fingerprint: 'abc' });
  const published = await service.publish({
    commandId: 'c-1',
    sessionId: 's-1',
    snapshotId: 'snap-1',
    set: SET,
  });
  assert.deepEqual(published, { setId: 'c-1', setFingerprint: 'abc' });
  assert.deepEqual(calls, [
    [
      'publish_team_candidate_set',
      { p_command_id: 'c-1', p_session_id: 's-1', p_snapshot_id: 'snap-1', p_set: SET },
    ],
  ]);
});

test('read parses the set and its candidates', async () => {
  const { service, calls } = recording({
    set_id: 'set-1',
    session_id: 's-1',
    roster_revision_id: 'r-1',
    snapshot_id: 'snap-1',
    team_count: 2,
    set_fingerprint: 'abc',
    candidates: [
      { candidate_index: 0, candidate_fingerprint: 'f0', assignment: [['p-1'], ['p-2']] },
    ],
  });
  const read = await service.read('set-1');
  assert.deepEqual(calls, [['read_team_candidate_set', { p_set_id: 'set-1' }]]);
  assert.deepEqual(read, {
    setId: 'set-1',
    sessionId: 's-1',
    rosterRevisionId: 'r-1',
    snapshotId: 'snap-1',
    teamCount: 2,
    setFingerprint: 'abc',
    candidates: [{ candidateIndex: 0, candidateFingerprint: 'f0', assignment: [['p-1'], ['p-2']] }],
  });
});

test('an RPC error is thrown as is and a malformed response is refused', async () => {
  const failing = recording(null, { code: '40001', message: 'stale' });
  await assert.rejects(
    failing.service.publish({ commandId: 'c', sessionId: 's', snapshotId: 'n', set: SET }),
    { code: '40001' },
  );

  const malformed = recording({ set_id: 'c' });
  await assert.rejects(
    malformed.service.publish({ commandId: 'c', sessionId: 's', snapshotId: 'n', set: SET }),
    /Invalid publish_team_candidate_set response/,
  );

  const badRead = recording({
    set_id: 'set-1',
    session_id: 's-1',
    roster_revision_id: 'r-1',
    snapshot_id: 'snap-1',
    team_count: 2,
    set_fingerprint: 'abc',
    candidates: [{ candidate_index: 0, candidate_fingerprint: 'f0', assignment: [[1]] }],
  });
  await assert.rejects(badRead.service.read('set-1'), /Invalid read_team_candidate_set response/);
});
