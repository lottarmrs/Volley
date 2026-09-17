import assert from 'node:assert/strict';
import test from 'node:test';
import type { Division, Player, PublishTeamCandidateSetRequest, Session } from '@shared/types';
import { makePlayer, makeSession } from '../test/fixtures';
import type { RosterRevisionRead, TeamCandidateSetGateway } from './authorizedFormationGateways';
import { clearCandidateSetPublication, publishTeamCandidateSet } from './teamCandidateSetUseCases';

const coded = (code: string) => Object.assign(new Error(code), { code });

const players: Player[] = ['a', 'b', 'c', 'd'].map((id) =>
  makePlayer(id, { cloudId: `cloud-${id}` }),
);

const roster: RosterRevisionRead = {
  rosterRevisionId: 'r-1',
  sessionId: 'cloud-session',
  entries: ['a', 'b', 'c', 'd'].map((id) => ({
    participantId: `p-${id}`,
    identityKind: 'PLAYER' as const,
    playerId: `cloud-${id}`,
  })),
};

const divisions = [
  {
    teams: [{ playerIds: ['a', 'b'] }, { playerIds: ['c', 'd'] }],
    score: 1,
    penalty: 0,
  },
] as unknown as Division[];

function authorizedSession(overrides: Partial<Session> = {}): Session {
  return makeSession('session-1', {
    communityId: 'community-1',
    cloudId: 'cloud-session',
    authorityModel: 'target',
    authorizedFormation: {
      snapshotId: 'snap-1',
      snapshotRosterRevisionId: 'r-1',
      pendingCommandIds: {},
    },
    ...overrides,
  });
}

function fakeGateway(failures: unknown[] = []) {
  const published: PublishTeamCandidateSetRequest[] = [];
  const rosterReads: string[] = [];
  const gateway: TeamCandidateSetGateway = {
    async readRosterRevision(id) {
      rosterReads.push(id);
      return roster;
    },
    async publish(input) {
      published.push(input);
      if (failures.length > 0) throw failures.shift();
      return { setId: input.commandId, setFingerprint: 'fp' };
    },
  };
  return { gateway, published, rosterReads };
}

test('publishes the mapped set and records the published set id', async () => {
  const { gateway, published, rosterReads } = fakeGateway();
  const changes: Session[] = [];
  const output = await publishTeamCandidateSet(
    {
      session: authorizedSession(),
      divisions,
      players,
      createId: () => 'command-1',
      onSessionChange: (session) => changes.push(session),
    },
    gateway,
  );

  assert.deepEqual(output.result, {
    ok: true,
    value: { setId: 'command-1', setFingerprint: 'fp' },
  });
  assert.deepEqual(rosterReads, ['r-1']);
  assert.equal(published[0].commandId, 'command-1');
  assert.equal(published[0].sessionId, 'cloud-session');
  assert.equal(published[0].snapshotId, 'snap-1');
  assert.deepEqual(published[0].set.candidates[0].teams, [
    ['p-a', 'p-b'],
    ['p-c', 'p-d'],
  ]);
  assert.equal(changes[0].authorizedFormation?.pendingCommandIds.publishCandidateSet, 'command-1');
  assert.equal(output.session.authorizedFormation?.publishedCandidateSetId, 'command-1');
  assert.deepEqual(output.session.authorizedFormation?.pendingCommandIds, {});
});

test('a failed publish keeps the command id so the retry replays it', async () => {
  const { gateway, published } = fakeGateway([new TypeError('Failed to fetch')]);
  let next = 0;
  const createId = () => `command-${(next += 1)}`;

  const first = await publishTeamCandidateSet(
    { session: authorizedSession(), divisions, players, createId },
    gateway,
  );
  assert.equal(first.result.ok, false);
  if (!first.result.ok) {
    assert.equal(
      first.result.error.message,
      'Sem conexão com a nuvem. Sessões de comunidade precisam de internet para gerar os times.',
    );
  }

  const second = await publishTeamCandidateSet(
    { session: first.session, divisions, players, createId },
    gateway,
  );
  assert.equal(second.result.ok, true);
  assert.deepEqual(
    published.map((input) => input.commandId),
    ['command-1', 'command-1'],
  );
});

test('a superseded roster is explained as a change on another device', async () => {
  const { gateway } = fakeGateway([coded('40001')]);
  const output = await publishTeamCandidateSet(
    { session: authorizedSession(), divisions, players, createId: () => 'c' },
    gateway,
  );
  assert.equal(output.result.ok, false);
  if (!output.result.ok) {
    assert.equal(output.result.error.message, 'O elenco mudou em outro aparelho. Tente de novo.');
  }
});

test('a team member without a participant is refused before publishing', async () => {
  const { gateway, published } = fakeGateway();
  const output = await publishTeamCandidateSet(
    {
      session: authorizedSession(),
      divisions: [
        { teams: [{ playerIds: ['a', 'x'] }, { playerIds: ['c', 'd'] }], score: 1, penalty: 0 },
      ] as unknown as Division[],
      players,
      createId: () => 'c',
    },
    gateway,
  );
  assert.equal(output.result.ok, false);
  if (!output.result.ok) {
    assert.equal(
      output.result.error.message,
      'Não foi possível ligar o elenco autorizado aos atletas deste aparelho. Sincronize e tente de novo.',
    );
  }
  assert.equal(published.length, 0);
});

test('without an authorized snapshot there is nothing to publish', async () => {
  const { gateway, published, rosterReads } = fakeGateway();
  const output = await publishTeamCandidateSet(
    {
      session: authorizedSession({ authorizedFormation: { pendingCommandIds: {} } }),
      divisions,
      players,
      createId: () => 'c',
    },
    gateway,
  );
  assert.equal(output.result.ok, false);
  if (!output.result.ok) {
    assert.equal(output.result.error.message, 'Gere os times pela comunidade antes de publicar.');
  }
  assert.equal(published.length + rosterReads.length, 0);
});

test('clearing the publication drops the set id and the pending command only', () => {
  const session = authorizedSession({
    authorizedFormation: {
      snapshotId: 'snap-1',
      snapshotRosterRevisionId: 'r-1',
      publishedCandidateSetId: 'set-1',
      pendingCommandIds: { publishCandidateSet: 'c-1', captureSnapshot: 'c-2' },
    },
  });
  const cleared = clearCandidateSetPublication(session);
  assert.deepEqual(cleared.authorizedFormation, {
    snapshotId: 'snap-1',
    snapshotRosterRevisionId: 'r-1',
    pendingCommandIds: { captureSnapshot: 'c-2' },
  });

  const untouched = authorizedSession();
  assert.equal(clearCandidateSetPublication(untouched), untouched);
});
