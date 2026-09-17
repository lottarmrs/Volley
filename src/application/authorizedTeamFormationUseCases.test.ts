import assert from 'node:assert/strict';
import test from 'node:test';
import type { BalanceInputSnapshot, Player, Session } from '@shared/types';
import { makeFreePlayConfig, makePlayer, makeSession } from '../test/fixtures';
import type {
  AuthorizedFormationGateway,
  RegistrationWindowStatus,
  RosterRevisionRead,
  WindowCommand,
} from './authorizedFormationGateways';
import { prepareAuthorizedTeamFormation } from './authorizedTeamFormationUseCases';

const CLOUD = '11111111-1111-4111-8111-111111111111';
const DIMENSIONS = [
  'saque',
  'recepcao',
  'levantamento',
  'ataque',
  'bloqueio',
  'defesa',
  'velocidade',
  'resistencia',
  'leituraDeJogo',
  'regularidade',
  'controleEmocional',
];

const coded = (code: string) => Object.assign(new Error(code), { code });

interface FakeWindow {
  sessionId: string;
  status: RegistrationWindowStatus;
  revision: number;
  capacity: number;
  confirmed: string[];
  finalized: Map<number, string>;
}

function fakeGateway(options: { sessionExists?: boolean; unknownRosterPlayers?: boolean } = {}) {
  const calls: string[] = [];
  const commandIds: Record<string, string[]> = {};
  const failures: { name: string; error: unknown; after?: boolean }[] = [];
  const receipts = new Map<string, unknown>();
  const windows = new Map<string, FakeWindow>();
  const rosters = new Map<string, RosterRevisionRead>();
  const snapshots = new Map<string, BalanceInputSnapshot>();
  let sessionExists = options.sessionExists ?? false;
  let rosterCount = 0;
  let snapshotCount = 0;

  const take = (name: string, after: boolean) => {
    const index = failures.findIndex((f) => f.name === name && !!f.after === after);
    if (index >= 0) throw failures.splice(index, 1)[0].error;
  };
  const record = (name: string, commandId?: string) => {
    calls.push(name);
    if (commandId) (commandIds[name] ??= []).push(commandId);
    take(name, false);
  };
  const replay = <T>(commandId: string, work: () => T): T => {
    if (!receipts.has(commandId)) receipts.set(commandId, work());
    return receipts.get(commandId) as T;
  };
  const windowOf = (id: string) => {
    const window = windows.get(id);
    if (!window) throw coded('P0002');
    return window;
  };
  const lifecycle =
    (name: string, status: RegistrationWindowStatus) => async (input: WindowCommand) => {
      record(name, input.commandId);
      return replay(input.commandId, () => {
        const window = windowOf(input.windowId);
        if (window.revision !== input.expectedRevision) throw coded('40001');
        window.status = status;
        window.revision += 1;
        return window.revision;
      });
    };

  const gateway: AuthorizedFormationGateway = {
    async createTargetSession(input) {
      record('createTargetSession');
      if (sessionExists) throw coded('23505');
      sessionExists = true;
      return { id: input.sessionId };
    },
    async readTargetSession(id) {
      record('readTargetSession');
      return {
        id,
        communityId: CLOUD,
        name: 'Pelada',
        sessionContext: 'COMMUNITY',
        playMode: 'FREE_PLAY',
        lifecycleStatus: 'DRAFT',
        publicationState: 'PRIVATE',
        revision: 1,
        currentRosterRevisionId: null,
      };
    },
    async readRosterRevision(id) {
      record('readRosterRevision');
      return rosters.get(id) as RosterRevisionRead;
    },
    registration: {
      async createWindow(input) {
        record('createWindow', input.commandId);
        return replay(input.commandId, () => {
          windows.set(input.windowId, {
            sessionId: input.sessionId,
            status: 'DRAFT',
            revision: 1,
            capacity: input.capacity,
            confirmed: [],
            finalized: new Map(),
          });
          return 1;
        });
      },
      openWindow: lifecycle('openWindow', 'OPEN'),
      reopenWindow: lifecycle('reopenWindow', 'OPEN'),
      closeWindow: lifecycle('closeWindow', 'CLOSED'),
      lockWindow: lifecycle('lockWindow', 'LOCKED'),
      async changeCapacity(input) {
        record('changeCapacity', input.commandId);
        return replay(input.commandId, () => {
          const window = windowOf(input.windowId);
          window.capacity = input.capacity;
          window.revision += 1;
          return window.revision;
        });
      },
      async addEntry(input) {
        record(`addEntry:${input.playerId}`, input.commandId);
        return replay(input.commandId, () => {
          const window = windowOf(input.windowId);
          window.confirmed.push(input.playerId);
          window.revision += 1;
          return window.revision;
        });
      },
      async removeEntry(input) {
        record(`removeEntry:${input.playerId}`, input.commandId);
        return replay(input.commandId, () => {
          const window = windowOf(input.windowId);
          window.confirmed = window.confirmed.filter((id) => id !== input.playerId);
          window.revision += 1;
          return window.revision;
        });
      },
      async finalizeRoster(input) {
        record('finalizeRoster', input.commandId);
        const value = replay(input.commandId, () => {
          const window = windowOf(input.windowId);
          if (window.revision !== input.expectedRevision) throw coded('40001');
          const existing = window.finalized.get(window.revision);
          if (existing) return { rosterRevisionId: existing, rosterRevisionNumber: rosterCount };
          rosterCount += 1;
          const rosterRevisionId = `roster-${rosterCount}`;
          rosters.set(rosterRevisionId, {
            rosterRevisionId,
            sessionId: window.sessionId,
            entries: window.confirmed.map((playerId) => ({
              participantId: `participant-${playerId}`,
              identityKind: 'PLAYER' as const,
              playerId: options.unknownRosterPlayers ? `unknown-${playerId}` : playerId,
            })),
          });
          window.finalized.set(window.revision, rosterRevisionId);
          return { rosterRevisionId, rosterRevisionNumber: rosterCount };
        });
        take('finalizeRoster', true);
        return value;
      },
      async readWindow(id) {
        record('readWindow');
        const window = windowOf(id);
        return {
          windowId: id,
          sessionId: window.sessionId,
          status: window.status,
          revision: window.revision,
          capacity: window.capacity,
          confirmedPlayerIds: [...window.confirmed],
        };
      },
    },
    async captureSnapshot(input) {
      record('captureSnapshot', input.commandId);
      return replay(input.commandId, () => {
        snapshotCount += 1;
        const roster = rosters.get(input.rosterRevisionId) as RosterRevisionRead;
        const snapshot: BalanceInputSnapshot = {
          snapshot_id: `snapshot-${snapshotCount}`,
          session_id: input.sessionId,
          roster_revision_id: input.rosterRevisionId,
          rubric_version: 'v0-legacy-11',
          resolver_version: 'v0-global-roster-mean-5',
          global_policy_version: 'v0-equal-community-mean',
          community_policy_version: 'v0-legacy-mad-mean',
          captured_at: '2026-09-17T12:00:00.000Z',
          input_fingerprint: `fp-${snapshotCount}`,
          participants: roster.entries.map((entry) => ({
            participant_id: entry.participantId,
            identity_kind: 'PLAYER',
            display_name_at_time: entry.participantId,
            attribute_vector: Object.fromEntries(DIMENSIONS.map((key) => [key, 5])),
            estimated_dimensions: [...DIMENSIONS],
            is_estimated: true,
            source_profile_revision: null,
            height_cm: null,
            gender: null,
            primary_position: null,
            secondary_positions: [],
            is_injured: false,
          })),
        };
        snapshots.set(snapshot.snapshot_id, snapshot);
        return snapshot;
      });
    },
    async readSnapshot(id) {
      record('readSnapshot');
      return snapshots.get(id) as BalanceInputSnapshot;
    },
  };

  return { gateway, calls, commandIds, failures };
}

function athletes(ids: string[]): Player[] {
  return ids.map((id) => makePlayer(id, { cloudId: `cloud-${id}`, communityIds: ['community-1'] }));
}

function draftSession(ids: string[]): Session {
  return makeSession('session-1', {
    communityId: 'community-1',
    status: 'draft' as Session['status'],
    selectedPlayerIds: ids,
    teamIds: [],
  });
}

let idCounter = 0;
const createId = () => `id-${(idCounter += 1)}`;

async function run(
  session: Session,
  players: Player[],
  gateway: AuthorizedFormationGateway,
  extra: {
    onStage?: (stage: string) => void;
    isCancelled?: () => boolean;
    onSessionChange?: (s: Session) => void;
  } = {},
) {
  return prepareAuthorizedTeamFormation(
    {
      session,
      communityCloudId: CLOUD,
      players,
      teamCount: 2,
      config: makeFreePlayConfig(),
      createId,
      ...extra,
    },
    gateway,
  );
}

test('first draw runs the whole chain in order and re-keys to local ids', async () => {
  const fake = fakeGateway();
  const stages: string[] = [];
  const output = await run(
    draftSession(['a', 'b', 'c', 'd']),
    athletes(['a', 'b', 'c', 'd']),
    fake.gateway,
    {
      onStage: (stage) => stages.push(stage),
    },
  );

  assert.deepEqual(fake.calls, [
    'createTargetSession',
    'createWindow',
    'readWindow',
    'openWindow',
    'addEntry:cloud-a',
    'addEntry:cloud-b',
    'addEntry:cloud-c',
    'addEntry:cloud-d',
    'closeWindow',
    'lockWindow',
    'finalizeRoster',
    'readRosterRevision',
    'captureSnapshot',
  ]);
  assert.deepEqual(stages, ['session', 'roster', 'snapshot']);
  assert.equal(output.result?.ok, true);
  const draw = output.result?.ok ? output.result.value : null;
  assert.deepEqual(
    draw?.request.participants.map((p) => p.participantId),
    ['a', 'b', 'c', 'd'],
  );
  assert.equal(draw?.request.provenance.kind, 'AUTHORIZED_SNAPSHOT');
  assert.deepEqual([draw?.estimatedCount, draw?.participantCount], [4, 4]);
  assert.equal(output.session.cloudId, 'session-1');
  assert.equal(output.session.authorityModel, 'target');
  assert.deepEqual(output.session.authorizedFormation?.pendingCommandIds, {});
  assert.equal(output.session.authorizedFormation?.snapshotRosterRevisionId, 'roster-1');
});

test('a failure keeps the pending command id, and the retry reuses it without repeating done steps', async () => {
  const fake = fakeGateway();
  fake.failures.push({ name: 'closeWindow', error: coded('XX000') });
  const players = athletes(['a', 'b']);
  const first = await run(draftSession(['a', 'b']), players, fake.gateway);
  assert.equal(first.result?.ok, false);
  assert.ok(first.session.authorizedFormation?.pendingCommandIds.closeWindow);

  const before = fake.calls.length;
  const second = await run(first.session, players, fake.gateway);
  assert.equal(second.result?.ok, true);
  assert.deepEqual(fake.calls.slice(before), [
    'readWindow',
    'closeWindow',
    'lockWindow',
    'finalizeRoster',
    'readRosterRevision',
    'captureSnapshot',
  ]);
  assert.equal(fake.commandIds.closeWindow[0], fake.commandIds.closeWindow[1]);
});

test('a finalize whose response was lost is replayed, not repeated', async () => {
  const fake = fakeGateway();
  fake.failures.push({ name: 'finalizeRoster', error: coded('XX000'), after: true });
  const players = athletes(['a', 'b']);
  const first = await run(draftSession(['a', 'b']), players, fake.gateway);
  assert.equal(first.result?.ok, false);

  const before = fake.calls.length;
  const second = await run(first.session, players, fake.gateway);
  assert.equal(second.result?.ok, true);
  assert.deepEqual(fake.calls.slice(before), [
    'readWindow',
    'finalizeRoster',
    'readRosterRevision',
    'captureSnapshot',
  ]);
  assert.equal(second.session.authorizedFormation?.finalizedRosterRevisionId, 'roster-1');
});

test('regenerating with the same roster skips Registration and reuses the snapshot', async () => {
  const fake = fakeGateway();
  const players = athletes(['a', 'b']);
  const first = await run(draftSession(['a', 'b']), players, fake.gateway);
  const before = fake.calls.length;
  const second = await run(first.session, players, fake.gateway);
  assert.equal(second.result?.ok, true);
  assert.deepEqual(fake.calls.slice(before), ['readWindow', 'readRosterRevision', 'readSnapshot']);
});

test('changing who plays reopens, applies the diff and captures the new roster', async () => {
  const fake = fakeGateway();
  const first = await run(
    draftSession(['a', 'b', 'c', 'd']),
    athletes(['a', 'b', 'c', 'd']),
    fake.gateway,
  );

  const swapped = { ...first.session, selectedPlayerIds: ['a', 'b', 'c', 'e'] };
  let before = fake.calls.length;
  const second = await run(swapped, athletes(['a', 'b', 'c', 'e']), fake.gateway);
  assert.equal(second.result?.ok, true);
  assert.deepEqual(fake.calls.slice(before), [
    'readWindow',
    'reopenWindow',
    'removeEntry:cloud-d',
    'addEntry:cloud-e',
    'closeWindow',
    'lockWindow',
    'finalizeRoster',
    'readRosterRevision',
    'captureSnapshot',
  ]);

  const grown = { ...second.session, selectedPlayerIds: ['a', 'b', 'c', 'e', 'f'] };
  before = fake.calls.length;
  await run(grown, athletes(['a', 'b', 'c', 'e', 'f']), fake.gateway);
  const round = fake.calls.slice(before);
  assert.ok(round.indexOf('changeCapacity') > -1);
  assert.ok(round.indexOf('changeCapacity') < round.indexOf('addEntry:cloud-f'));
});

test('one 40001 reruns the chain; a second one returns the conflict message', async () => {
  const once = fakeGateway();
  once.failures.push({ name: 'captureSnapshot', error: coded('40001') });
  const recovered = await run(draftSession(['a', 'b']), athletes(['a', 'b']), once.gateway);
  assert.equal(recovered.result?.ok, true);
  assert.equal(once.calls.filter((call) => call === 'captureSnapshot').length, 2);

  const twice = fakeGateway();
  twice.failures.push(
    { name: 'captureSnapshot', error: coded('40001') },
    { name: 'captureSnapshot', error: coded('40001') },
  );
  const conflicted = await run(draftSession(['a', 'b']), athletes(['a', 'b']), twice.gateway);
  assert.equal(
    conflicted.result?.ok === false && conflicted.result.error.message,
    'O elenco mudou em outro aparelho. Tente de novo.',
  );
});

test('23505 on create adopts the existing target Session', async () => {
  const fake = fakeGateway({ sessionExists: true });
  const output = await run(draftSession(['a', 'b']), athletes(['a', 'b']), fake.gateway);
  assert.equal(output.result?.ok, true);
  assert.deepEqual(fake.calls.slice(0, 3), [
    'createTargetSession',
    'readTargetSession',
    'createWindow',
  ]);
});

test('a roster the device cannot map is refused as unexpected', async () => {
  const fake = fakeGateway({ unknownRosterPlayers: true });
  const output = await run(draftSession(['a', 'b']), athletes(['a', 'b']), fake.gateway);
  assert.equal(output.result?.ok === false && output.result.error.kind, 'unexpected');
});

test('cancelling stops between steps and returns null with the progress so far', async () => {
  const fake = fakeGateway();
  let cancelled = false;
  const output = await run(draftSession(['a', 'b']), athletes(['a', 'b']), fake.gateway, {
    onStage: (stage) => {
      if (stage === 'roster') cancelled = true;
    },
    isCancelled: () => cancelled,
  });
  assert.equal(output.result, null);
  assert.equal(output.session.authorityModel, 'target');
  assert.deepEqual(fake.calls, ['createTargetSession', 'createWindow']);
});

test('the Window id is reported before create_registration_window runs', async () => {
  const fake = fakeGateway();
  let callsWhenWindowIdAppeared: string[] | null = null;
  await run(draftSession(['a', 'b']), athletes(['a', 'b']), fake.gateway, {
    onSessionChange: (session) => {
      if (session.authorizedFormation?.windowId && callsWhenWindowIdAppeared === null) {
        callsWhenWindowIdAppeared = [...fake.calls];
      }
    },
  });
  assert.deepEqual(callsWhenWindowIdAppeared, ['createTargetSession']);
});
