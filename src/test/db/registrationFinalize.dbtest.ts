import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Client, Pool, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

interface FinalizeRow extends QueryResultRow {
  roster_revision_id: string;
  roster_revision_number: number;
  source_registration_revision: string;
  session_revision: number;
}

interface WindowFixture {
  communityId: string;
  organizerId: string;
  sessionId: string;
  windowId: string;
  revision: number;
}

if (!isTestDatabaseConfigured()) {
  test(`registration finalization requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run \`npm run test:db\`.`);
  });
} else {
  let client: Client;
  let pool: Pool;

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
    pool = createPool();
  });

  test.after(async () => {
    await pool?.end();
    await client?.end();
  });

  async function call<T extends QueryResultRow = QueryResultRow>(
    userId: string | null,
    sql: string,
    params: unknown[] = [],
  ) {
    const db = await pool.connect();
    try {
      return await asIdentityCommitting(db, userId, () => db.query<T>(sql, params));
    } finally {
      db.release();
    }
  }

  function assertSqlState(error: unknown, expectedCode: string): asserts error is Error {
    assert.ok(error instanceof Error);
    assert.equal((error as { code?: string }).code, expectedCode);
  }

  async function finalizeRoster(
    actorId: string | null,
    input: { commandId?: string; windowId: string; expectedRevision: number },
  ) {
    return call<FinalizeRow>(actorId, 'select * from public.finalize_session_roster($1, $2, $3)', [
      input.commandId ?? randomUUID(),
      input.windowId,
      input.expectedRevision,
    ]);
  }

  async function newUser(email: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id, email) values ($1, $2) on conflict do nothing',
      [rows[0].id, email],
    );
    return rows[0].id;
  }

  async function targetCommunity(ownerId: string, name: string): Promise<string> {
    const { rows } = await call<{ id: string }>(
      ownerId,
      'select public.create_community_with_owner($1) as id',
      [name],
    );
    return rows[0].id;
  }

  async function activeMembership(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [communityId, userId],
    );
  }

  async function grantOrganizer(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [communityId, userId],
    );
  }

  async function communitySession(actorId: string, communityId: string, name = 'Finalize Session') {
    await grantOrganizer(communityId, actorId);
    const sessionId = randomUUID();
    const { rows } = await call<{ id: string }>(
      actorId,
      `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null) as id`,
      [sessionId, communityId, name],
    );
    assert.deepEqual(rows, [{ id: sessionId }]);
    return sessionId;
  }

  async function createPlayer(
    ownerId: string,
    input: {
      name?: string;
      nickname?: string | null;
      active?: boolean;
      deletedAt?: string | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.players (
         id, owner_id, name, nickname, active, deleted_at, has_account_identity_history
       ) values ($1, $2, $3, $4, $5, $6::timestamptz, false)`,
      [
        id,
        ownerId,
        input.name ?? 'Jogadora',
        input.nickname ?? null,
        input.active ?? true,
        input.deletedAt ?? null,
      ],
    );
    return id;
  }

  async function addCommunityPlayer(
    communityId: string,
    playerId: string,
    ownerId: string,
  ): Promise<void> {
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, playerId, ownerId],
    );
  }

  async function eligibleMember(
    communityId: string,
    ownerId: string,
    email: string,
  ): Promise<{ userId: string; playerId: string }> {
    const userId = await newUser(email);
    await activeMembership(communityId, userId);
    const playerId = await createPlayer(ownerId, { name: email });
    await client.query(
      `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
       values ($1, $2, 'ACTIVE', 'SELF_CLAIM', now())`,
      [playerId, userId],
    );
    await addCommunityPlayer(communityId, playerId, ownerId);
    return { userId, playerId };
  }

  async function rosterOnlyPlayer(
    communityId: string,
    ownerId: string,
    name: string,
  ): Promise<string> {
    const playerId = await createPlayer(ownerId, { name });
    await addCommunityPlayer(communityId, playerId, ownerId);
    return playerId;
  }

  async function createWindow(
    actorId: string,
    sessionId: string,
    capacity: number,
  ): Promise<{ windowId: string; revision: number }> {
    const windowId = randomUUID();
    const result = await call<{ window_id: string; window_revision: number }>(
      actorId,
      'select * from public.create_registration_window($1, $2, $3, $4, null)',
      [randomUUID(), windowId, sessionId, capacity],
    );
    return { windowId: result.rows[0].window_id, revision: result.rows[0].window_revision };
  }

  async function transitionWindow(
    actorId: string,
    command: 'open_registration' | 'close_registration' | 'lock_registration',
    windowId: string,
    expectedRevision: number,
  ): Promise<number> {
    const result = await call<{ window_revision: number }>(
      actorId,
      `select * from public.${command}($1, $2, $3)`,
      [randomUUID(), windowId, expectedRevision],
    );
    return result.rows[0].window_revision;
  }

  async function joinRegistration(
    actorId: string,
    windowId: string,
  ): Promise<{ entry_status: string; window_revision: number }> {
    const result = await call<{ entry_status: string; window_revision: number }>(
      actorId,
      'select * from public.join_registration($1, $2, $3)',
      [randomUUID(), randomUUID(), windowId],
    );
    return result.rows[0];
  }

  async function addRegistrationEntry(
    actorId: string,
    windowId: string,
    playerId: string,
  ): Promise<{ entry_status: string; window_revision: number }> {
    const result = await call<{ entry_status: string; window_revision: number }>(
      actorId,
      'select * from public.add_registration_entry($1, $2, $3, $4)',
      [randomUUID(), randomUUID(), windowId, playerId],
    );
    return result.rows[0];
  }

  async function lockedWindow(
    organizerId: string,
    communityId: string,
    capacity: number,
    confirmedSelfJoins: number,
    organizerAddedNames: string[] = [],
    waitlistedSelfJoins = 0,
  ): Promise<WindowFixture & { confirmedPlayerIds: string[]; waitlistedPlayerIds: string[] }> {
    const sessionId = await communitySession(organizerId, communityId, `Finalize ${randomUUID()}`);
    const created = await createWindow(organizerId, sessionId, capacity);
    let revision = await transitionWindow(
      organizerId,
      'open_registration',
      created.windowId,
      created.revision,
    );
    const confirmedPlayerIds: string[] = [];
    const waitlistedPlayerIds: string[] = [];
    for (let index = 0; index < confirmedSelfJoins + waitlistedSelfJoins; index += 1) {
      const member = await eligibleMember(
        communityId,
        organizerId,
        `finalize-self-${index}-${randomUUID()}@test.local`,
      );
      const join = await joinRegistration(member.userId, created.windowId);
      revision = join.window_revision;
      const expectedStatus = confirmedPlayerIds.length < capacity ? 'CONFIRMED' : 'WAITLISTED';
      assert.equal(join.entry_status, expectedStatus);
      (expectedStatus === 'CONFIRMED' ? confirmedPlayerIds : waitlistedPlayerIds).push(
        member.playerId,
      );
    }
    for (const name of organizerAddedNames) {
      const playerId = await rosterOnlyPlayer(communityId, organizerId, name);
      const added = await addRegistrationEntry(organizerId, created.windowId, playerId);
      revision = added.window_revision;
      const expectedStatus = confirmedPlayerIds.length < capacity ? 'CONFIRMED' : 'WAITLISTED';
      assert.equal(added.entry_status, expectedStatus);
      (expectedStatus === 'CONFIRMED' ? confirmedPlayerIds : waitlistedPlayerIds).push(playerId);
    }
    const totalEntries = confirmedSelfJoins + waitlistedSelfJoins + organizerAddedNames.length;
    assert.equal(confirmedPlayerIds.length, Math.min(capacity, totalEntries));
    assert.equal(waitlistedPlayerIds.length, Math.max(0, totalEntries - capacity));
    revision = await transitionWindow(
      organizerId,
      'close_registration',
      created.windowId,
      revision,
    );
    revision = await transitionWindow(organizerId, 'lock_registration', created.windowId, revision);
    return {
      communityId,
      organizerId,
      sessionId,
      windowId: created.windowId,
      revision,
      confirmedPlayerIds,
      waitlistedPlayerIds,
    };
  }

  async function rosterRevision(id: string) {
    return client.query<{
      id: string;
      session_id: string;
      revision_number: number;
      source_kind: string;
      source_session_revision: number | null;
      source_registration_revision: string | null;
      source_payload_hash: string | null;
      created_by_user_id: string | null;
    }>(
      `select id, session_id, revision_number, source_kind, source_session_revision,
              source_registration_revision, source_payload_hash, created_by_user_id
         from public.roster_revisions where id = $1`,
      [id],
    );
  }

  async function rosterEntries(id: string) {
    return client.query<{
      entry_order: number;
      participant_id: string;
      identity_kind: string;
      player_id: string | null;
      display_name_at_time: string;
    }>(
      `select entry_order, participant_id, identity_kind, player_id, display_name_at_time
         from public.roster_revision_entries
        where roster_revision_id = $1 order by entry_order`,
      [id],
    );
  }

  async function sessionRevision(sessionId: string): Promise<number> {
    const { rows } = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [sessionId],
    );
    return rows[0].revision;
  }

  async function assertNoFinalizeEffects(
    sessionId: string,
    windowId: string,
    beforeSessionRevision: number,
  ): Promise<void> {
    assert.equal(
      (
        await client.query<{ count: number }>(
          'select count(*)::integer as count from public.roster_revisions where session_id = $1',
          [sessionId],
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await client.query<{ count: number }>(
          'select count(*)::integer as count from public.roster_revision_entries where session_id = $1',
          [sessionId],
        )
      ).rows[0].count,
      0,
    );
    assert.equal(
      (
        await client.query<{ count: number }>(
          'select count(*)::integer as count from public.session_participants where session_id = $1',
          [sessionId],
        )
      ).rows[0].count,
      0,
    );
    assert.equal(await sessionRevision(sessionId), beforeSessionRevision);
    assert.equal(
      (
        await client.query<{ count: number }>(
          `select count(*)::integer as count from app_private.command_receipts
          where command_type = 'finalize_session_roster' and aggregate_id = $1`,
          [windowId],
        )
      ).rows[0].count,
      0,
    );
  }

  // Detects a finalizer that includes waitlisted registrations or records incorrect provenance.
  test('finalize_session_roster materializes only confirmed Players with exact provenance and one Session bump', async () => {
    const organizer = await newUser(`finalize-happy-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize happy');
    const fixture = await lockedWindow(organizer, communityId, 2, 2, [], 1);
    const beforeSessionRevision = await sessionRevision(fixture.sessionId);

    const result = await finalizeRoster(organizer, {
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    });
    const row = result.rows[0];

    assert.equal(row.source_registration_revision, String(fixture.revision));
    assert.equal(row.session_revision, beforeSessionRevision + 1);
    const revision = await rosterRevision(row.roster_revision_id);
    assert.deepEqual(revision.rows[0], {
      id: row.roster_revision_id,
      session_id: fixture.sessionId,
      revision_number: row.roster_revision_number,
      source_kind: 'REGISTRATION',
      source_session_revision: null,
      source_registration_revision: String(fixture.revision),
      source_payload_hash: null,
      created_by_user_id: organizer,
    });
    const entries = await rosterEntries(row.roster_revision_id);
    assert.deepEqual(
      entries.rows.map(({ entry_order, identity_kind, player_id }) => ({
        entry_order,
        identity_kind,
        player_id,
      })),
      fixture.confirmedPlayerIds.map((playerId, entry_order) => ({
        entry_order,
        identity_kind: 'PLAYER',
        player_id: playerId,
      })),
    );
    assert.equal(
      entries.rows.some((entry) => fixture.waitlistedPlayerIds.includes(entry.player_id!)),
      false,
    );
  });

  // Detects a finalizer that does not make tie ordering deterministic or preserve name snapshots.
  test('finalize_session_roster orders equal joined_at entries by entry UUID and snapshots trimmed names', async () => {
    const organizer = await newUser(`finalize-order-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize ordering');
    const sessionId = await communitySession(
      organizer,
      communityId,
      `Finalize ordering ${randomUUID()}`,
    );
    const created = await createWindow(organizer, sessionId, 2);
    let revision = await transitionWindow(
      organizer,
      'open_registration',
      created.windowId,
      created.revision,
    );
    const firstUser = await newUser(`finalize-order-first-${randomUUID()}@test.local`);
    const secondUser = await newUser(`finalize-order-second-${randomUUID()}@test.local`);
    await activeMembership(communityId, firstUser);
    await activeMembership(communityId, secondUser);
    const first = await createPlayer(organizer, { name: 'Nome um', nickname: '  Apelido  ' });
    const second = await createPlayer(organizer, { name: '  Nome dois  ', nickname: '   ' });
    for (const [playerId, userId] of [
      [first, firstUser],
      [second, secondUser],
    ]) {
      await client.query(
        `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
         values ($1, $2, 'ACTIVE', 'SELF_CLAIM', now())`,
        [playerId, userId],
      );
      await addCommunityPlayer(communityId, playerId, organizer);
    }
    const firstJoin = await joinRegistration(firstUser, created.windowId);
    const secondJoin = await joinRegistration(secondUser, created.windowId);
    assert.equal(firstJoin.entry_status, 'CONFIRMED');
    assert.equal(secondJoin.entry_status, 'CONFIRMED');
    revision = secondJoin.window_revision;
    await client.query(
      `update public.registration_entries set joined_at = '2026-09-02T12:00:00Z'
        where registration_window_id = $1 and player_id in ($2, $3)`,
      [created.windowId, first, second],
    );
    const expected = await client.query<{ id: string; player_id: string }>(
      `select id, player_id from public.registration_entries
        where registration_window_id = $1 and status = 'CONFIRMED' order by joined_at, id`,
      [created.windowId],
    );
    assert.equal(expected.rowCount, 2);
    const expectedNameByPlayerId = new Map([
      [first, 'Apelido'],
      [second, 'Nome dois'],
    ]);
    revision = await transitionWindow(organizer, 'close_registration', created.windowId, revision);
    revision = await transitionWindow(organizer, 'lock_registration', created.windowId, revision);

    const result = await finalizeRoster(organizer, {
      windowId: created.windowId,
      expectedRevision: revision,
    });
    const entries = await rosterEntries(result.rows[0].roster_revision_id);
    assert.deepEqual(
      entries.rows.map((entry) => entry.player_id),
      expected.rows.map((entry) => entry.player_id),
    );
    assert.deepEqual(
      entries.rows.map((entry) => entry.display_name_at_time),
      expected.rows.map((entry) => expectedNameByPlayerId.get(entry.player_id)),
    );
    await client.query(
      `update public.players set nickname = 'Mudou', name = 'Mudou tambem' where id in ($1, $2)`,
      [first, second],
    );
    assert.deepEqual(
      (await rosterEntries(result.rows[0].roster_revision_id)).rows.map(
        (entry) => entry.display_name_at_time,
      ),
      expected.rows.map((entry) => expectedNameByPlayerId.get(entry.player_id)),
    );
  });

  // Detects a finalizer that creates duplicate Participants or reuses the Registration entry id.
  test('finalize_session_roster reuses an existing Session Participant and allocates a distinct id for a new one', async () => {
    const organizer = await newUser(`finalize-participant-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize participant reuse');
    const fixture = await lockedWindow(organizer, communityId, 2, 2);
    const existingParticipantId = randomUUID();
    await client.query(
      `insert into public.session_participants (
         id, session_id, identity_kind, player_id, source_kind, display_name, participation_status, created_by_user_id
       ) values ($1, $2, 'PLAYER', $3, 'REGISTRATION', 'Existente', 'INCLUDED', $4)`,
      [existingParticipantId, fixture.sessionId, fixture.confirmedPlayerIds[0], organizer],
    );
    const registrationEntry = await client.query<{ id: string }>(
      `select id from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [fixture.windowId, fixture.confirmedPlayerIds[1]],
    );

    const result = await finalizeRoster(organizer, {
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    });
    const entries = await rosterEntries(result.rows[0].roster_revision_id);
    const reusedEntry = entries.rows.find(
      (entry) => entry.player_id === fixture.confirmedPlayerIds[0],
    );
    const newEntry = entries.rows.find(
      (entry) => entry.player_id === fixture.confirmedPlayerIds[1],
    );
    assert.ok(reusedEntry);
    assert.ok(newEntry);
    assert.equal(reusedEntry.participant_id, existingParticipantId);
    assert.notEqual(newEntry.participant_id, existingParticipantId);
    assert.equal(registrationEntry.rowCount, 1);
    assert.notEqual(newEntry.participant_id, registrationEntry.rows[0].id);
    const participant = await client.query<{ id: string }>(
      `select id from public.session_participants where session_id = $1 and player_id = $2`,
      [fixture.sessionId, fixture.confirmedPlayerIds[1]],
    );
    assert.equal(participant.rowCount, 1);
    assert.equal(participant.rows[0].id, newEntry.participant_id);
  });

  for (const status of ['DRAFT', 'OPEN', 'CLOSED'] as const) {
    // Detects a finalizer that accepts a Window before it has been locked.
    test(`finalize_session_roster rejects a ${status} Window with 23514`, async () => {
      const organizer = await newUser(`finalize-${status}-${randomUUID()}@test.local`);
      const communityId = await targetCommunity(organizer, `Finalize ${status}`);
      const sessionId = await communitySession(organizer, communityId);
      const created = await createWindow(organizer, sessionId, 1);
      let revision = created.revision;
      if (status !== 'DRAFT') {
        revision = await transitionWindow(
          organizer,
          'open_registration',
          created.windowId,
          revision,
        );
        const member = await eligibleMember(
          communityId,
          organizer,
          `finalize-${status}-${randomUUID()}@test.local`,
        );
        revision = (await joinRegistration(member.userId, created.windowId)).window_revision;
        if (status === 'CLOSED')
          revision = await transitionWindow(
            organizer,
            'close_registration',
            created.windowId,
            revision,
          );
      }
      const beforeSessionRevision = await sessionRevision(sessionId);
      const error = await finalizeRoster(organizer, {
        windowId: created.windowId,
        expectedRevision: revision,
      }).catch((cause: Error) => cause);
      assertSqlState(error, '23514');
      const revisions = await client.query(
        'select id from public.roster_revisions where session_id = $1',
        [sessionId],
      );
      assert.equal(revisions.rowCount, 0);
      await assertNoFinalizeEffects(sessionId, created.windowId, beforeSessionRevision);
    });
  }

  // Detects a finalizer that ignores optimistic concurrency on the Window aggregate.
  test('finalize_session_roster rejects a stale expected Window revision with 40001 and no effect', async () => {
    const organizer = await newUser(`finalize-stale-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize stale');
    const fixture = await lockedWindow(organizer, communityId, 1, 1);
    const beforeSessionRevision = await sessionRevision(fixture.sessionId);
    const error = await finalizeRoster(organizer, {
      windowId: fixture.windowId,
      expectedRevision: fixture.revision - 1,
    }).catch((cause: Error) => cause);
    assertSqlState(error, '40001');
    await assertNoFinalizeEffects(fixture.sessionId, fixture.windowId, beforeSessionRevision);
  });

  // Detects a finalizer that turns an empty lock into an empty roster revision.
  test('finalize_session_roster rejects a locked Window with zero confirmed entries with 23514 and no effect', async () => {
    const organizer = await newUser(`finalize-empty-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize empty');
    const fixture = await lockedWindow(organizer, communityId, 1, 0);
    const beforeSessionRevision = await sessionRevision(fixture.sessionId);
    const error = await finalizeRoster(organizer, {
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    }).catch((cause: Error) => cause);
    assertSqlState(error, '23514');
    await assertNoFinalizeEffects(fixture.sessionId, fixture.windowId, beforeSessionRevision);
  });

  for (const lifecycleStatus of ['IN_PROGRESS', 'COMPLETED'] as const) {
    // Detects a finalizer that mutates a Session after play has started or finished.
    test(`finalize_session_roster rejects a ${lifecycleStatus} Session with 23514 and no effect`, async () => {
      const organizer = await newUser(`finalize-${lifecycleStatus}-${randomUUID()}@test.local`);
      const communityId = await targetCommunity(organizer, `Finalize ${lifecycleStatus}`);
      const fixture = await lockedWindow(organizer, communityId, 1, 1);
      await client.query(
        `update public.sessions set lifecycle_status = $2, actual_started_at = now(),
         actual_finished_at = case when $2 = 'COMPLETED' then now() else null end where id = $1`,
        [fixture.sessionId, lifecycleStatus],
      );
      const beforeSessionRevision = await sessionRevision(fixture.sessionId);
      const error = await finalizeRoster(organizer, {
        windowId: fixture.windowId,
        expectedRevision: fixture.revision,
      }).catch((cause: Error) => cause);
      assertSqlState(error, '23514');
      await assertNoFinalizeEffects(fixture.sessionId, fixture.windowId, beforeSessionRevision);
    });
  }

  async function assertRejectedInvalidatedEntry(
    mutation: (
      fixture: WindowFixture & { confirmedPlayerIds: string[]; waitlistedPlayerIds: string[] },
    ) => Promise<void>,
    name: string,
  ) {
    const organizer = await newUser(`finalize-${name}-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, `Finalize ${name}`);
    const fixture = await lockedWindow(organizer, communityId, 1, 1);
    await mutation(fixture);
    const beforeSessionRevision = await sessionRevision(fixture.sessionId);
    const error = await finalizeRoster(organizer, {
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    }).catch((cause: Error) => cause);
    assertSqlState(error, '23514');
    await assertNoFinalizeEffects(fixture.sessionId, fixture.windowId, beforeSessionRevision);
  }

  // Detects a finalizer that accepts a Player soft-deleted after the lock snapshot.
  test('finalize_session_roster rejects a confirmed Player soft-deleted after Lock with 23514', async () => {
    await assertRejectedInvalidatedEntry(async (fixture) => {
      await client.query('update public.players set deleted_at = now() where id = $1', [
        fixture.confirmedPlayerIds[0],
      ]);
    }, 'soft-deleted');
  });

  // Detects a finalizer that accepts an inactive Player after the lock snapshot.
  test('finalize_session_roster rejects a confirmed Player made inactive after Lock with 23514', async () => {
    await assertRejectedInvalidatedEntry(async (fixture) => {
      await client.query('update public.players set active = false where id = $1', [
        fixture.confirmedPlayerIds[0],
      ]);
    }, 'inactive-player');
  });

  // Detects a finalizer that ignores an inactive Community roster relation.
  test('finalize_session_roster rejects a confirmed Community roster relation made inactive after Lock with 23514', async () => {
    await assertRejectedInvalidatedEntry(async (fixture) => {
      await client.query(
        `update public.community_players set active = false, status = 'inactive' where community_id = $1 and player_id = $2`,
        [fixture.communityId, fixture.confirmedPlayerIds[0]],
      );
    }, 'inactive-community-player');
  });

  // Detects a finalizer that accepts a SELF_JOIN whose account link was revoked after Lock.
  test('finalize_session_roster rejects a confirmed SELF_JOIN account link revoked after Lock with 23514', async () => {
    await assertRejectedInvalidatedEntry(async (fixture) => {
      await client.query(
        `update public.player_account_links
              set status = 'REVOKED', reviewed_at = now()
            where player_id = $1`,
        [fixture.confirmedPlayerIds[0]],
      );
    }, 'revoked-link');
  });

  // Detects a finalizer that accepts a SELF_JOIN whose membership was suspended after Lock.
  test('finalize_session_roster rejects a confirmed SELF_JOIN membership suspended after Lock with 23514', async () => {
    await assertRejectedInvalidatedEntry(async (fixture) => {
      await client.query(
        `update public.community_memberships set status = 'suspended' where community_id = $1 and user_id = (select user_id from public.player_account_links where player_id = $2)`,
        [fixture.communityId, fixture.confirmedPlayerIds[0]],
      );
    }, 'suspended-membership');
  });

  // Detects a finalizer that incorrectly requires an account identity for a live ORGANIZER_ADDED Player.
  test('finalize_session_roster accepts a live accountless ORGANIZER_ADDED Player', async () => {
    const organizer = await newUser(`finalize-organizer-added-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize organizer added');
    const fixture = await lockedWindow(organizer, communityId, 1, 0, [`Convidada ${randomUUID()}`]);
    const beforeSessionRevision = await sessionRevision(fixture.sessionId);
    const result = await finalizeRoster(organizer, {
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    });
    assert.equal(result.rows[0].session_revision, beforeSessionRevision + 1);
    assert.deepEqual(
      (await rosterEntries(result.rows[0].roster_revision_id)).rows.map((entry) => entry.player_id),
      fixture.confirmedPlayerIds,
    );
  });
}
