import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Client, Pool, PoolClient, QueryResultRow } from 'pg';
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

interface ReadinessBlocker {
  code: string;
}

interface ReadinessRow extends QueryResultRow {
  ready: boolean;
  blockers: ReadinessBlocker[];
  revisions: {
    session_revision: number;
    roster_revision_id: string | null;
    roster_revision_number: number | null;
    rules_snapshot_id: string | null;
  };
}

interface FinalizeEffectSnapshot {
  rosterRevisions: number;
  rosterEntries: number;
  participants: number;
  sessionRevision: number;
  finalizeReceipts: number;
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

  async function entriesForWindow(windowId: string) {
    return client.query<{ id: string; player_id: string }>(
      `select id, player_id from public.registration_entries
        where registration_window_id = $1 and status = 'CONFIRMED' order by joined_at, id`,
      [windowId],
    );
  }

  async function sessionRevision(sessionId: string): Promise<number> {
    const { rows } = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [sessionId],
    );
    return rows[0].revision;
  }

  async function rosterRevisionCount(sessionId: string): Promise<number> {
    const { rows } = await client.query<{ count: number }>(
      'select count(*)::integer as count from public.roster_revisions where session_id = $1',
      [sessionId],
    );
    return rows[0].count;
  }

  async function finalizeReceiptCount(windowId: string): Promise<number> {
    const { rows } = await client.query<{ count: number }>(
      `select count(*)::integer as count from app_private.command_receipts
        where command_type = 'finalize_session_roster' and aggregate_id = $1`,
      [windowId],
    );
    return rows[0].count;
  }

  async function commandReceiptCount(commandId: string): Promise<number> {
    const { rows } = await client.query<{ count: number }>(
      'select count(*)::integer as count from app_private.command_receipts where command_id = $1',
      [commandId],
    );
    return rows[0].count;
  }

  async function finalizeEffectSnapshot(
    sessionId: string,
    windowId: string,
  ): Promise<FinalizeEffectSnapshot> {
    const { rows } = await client.query<FinalizeEffectSnapshot>(
      `select
         (select count(*)::integer from public.roster_revisions where session_id = $1)
           as "rosterRevisions",
         (select count(*)::integer from public.roster_revision_entries where session_id = $1)
           as "rosterEntries",
         (select count(*)::integer from public.session_participants where session_id = $1)
           as participants,
         (select revision from public.sessions where id = $1) as "sessionRevision",
         (select count(*)::integer from app_private.command_receipts
           where command_type = 'finalize_session_roster' and aggregate_id = $2)
           as "finalizeReceipts"`,
      [sessionId, windowId],
    );
    return rows[0];
  }

  async function membershipId(communityId: string, userId: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'select id from public.community_memberships where community_id = $1 and user_id = $2',
      [communityId, userId],
    );
    assert.equal(rows.length, 1, 'the authorization fixture requires one Community membership');
    return rows[0].id;
  }

  async function assignOrganizerDirectly(
    sessionId: string,
    organizerId: string,
    communityMembershipId: string,
    revoked = false,
  ): Promise<void> {
    await client.query(
      `insert into public.session_organizer_assignments (
         session_id, community_membership_id, organizer_user_id, assigned_by_user_id,
         revoked_at, revoked_by_user_id
       ) values (
         $1::uuid, $2::uuid, $3::uuid, $3::uuid,
         case when $4::boolean then now() end,
         case when $4::boolean then $3::uuid end
       )`,
      [sessionId, communityMembershipId, organizerId, revoked],
    );
  }

  async function beginAsIdentity(db: PoolClient, userId: string): Promise<void> {
    await db.query('begin');
    await db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId]);
    await db.query('select set_config($1, $2, true)', ['request.jwt.claim.role', 'authenticated']);
    await db.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    await db.query('set local role authenticated');
  }

  async function waitForBackendLock(blockedPid: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const { rows } = await client.query<{ blocked: boolean }>(
        `select exists (
           select 1 from pg_catalog.pg_stat_activity
            where pid = $1 and state = 'active' and wait_event_type = 'Lock'
         ) as blocked`,
        [blockedPid],
      );
      if (rows[0].blocked) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    assert.fail(`backend ${blockedPid} never became observably blocked on a database lock`);
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
    const expected = await entriesForWindow(created.windowId);
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

  // Detects a retry branch that replays the mutation instead of returning its durable receipt.
  test('same command_id retry returns the identical result with one effect and one receipt', async () => {
    const organizer = await newUser(`finalize-retry-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize retry');
    const fixture = await lockedWindow(organizer, communityId, 1, 1);
    const commandId = randomUUID();

    const first = await finalizeRoster(organizer, {
      commandId,
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    });
    const afterFirst = await finalizeEffectSnapshot(fixture.sessionId, fixture.windowId);
    const second = await finalizeRoster(organizer, {
      commandId,
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    });
    const afterSecond = await finalizeEffectSnapshot(fixture.sessionId, fixture.windowId);

    assert.deepEqual(second.rows, first.rows);
    assert.deepEqual(afterSecond, afterFirst);
    assert.deepEqual(afterSecond, {
      rosterRevisions: 1,
      rosterEntries: 1,
      participants: 1,
      sessionRevision: first.rows[0].session_revision,
      finalizeReceipts: 1,
    });
    assert.equal(await commandReceiptCount(commandId), 1);
  });

  // Detects a source-finalization branch that creates a second immutable revision for the same lock.
  test('distinct command IDs for one Registration source converge without a second Session bump', async () => {
    const organizer = await newUser(`finalize-converge-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize convergence');
    const fixture = await lockedWindow(organizer, communityId, 1, 1);

    const first = await finalizeRoster(organizer, {
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    });
    const afterFirst = await sessionRevision(fixture.sessionId);
    const second = await finalizeRoster(organizer, {
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    });

    assert.equal(second.rows[0].roster_revision_id, first.rows[0].roster_revision_id);
    assert.equal(second.rows[0].roster_revision_number, first.rows[0].roster_revision_number);
    assert.equal(second.rows[0].session_revision, afterFirst);
    assert.equal(await sessionRevision(fixture.sessionId), afterFirst);
    assert.equal(await rosterRevisionCount(fixture.sessionId), 1);
    assert.equal(await finalizeReceiptCount(fixture.windowId), 2);
  });

  // Detects accepting one command_id for two Registration aggregates and mutating the second one.
  test('a finalize command_id collision against another Window raises 23505 without a second effect', async () => {
    const organizer = await newUser(`finalize-window-collision-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize Window collision');
    const firstFixture = await lockedWindow(organizer, communityId, 1, 1);
    const secondFixture = await lockedWindow(organizer, communityId, 1, 1);
    const commandId = randomUUID();
    await finalizeRoster(organizer, {
      commandId,
      windowId: firstFixture.windowId,
      expectedRevision: firstFixture.revision,
    });
    const beforeSecond = await finalizeEffectSnapshot(
      secondFixture.sessionId,
      secondFixture.windowId,
    );

    const collision = await finalizeRoster(organizer, {
      commandId,
      windowId: secondFixture.windowId,
      expectedRevision: secondFixture.revision,
    }).catch((error: Error) => error);
    const afterSecond = await finalizeEffectSnapshot(
      secondFixture.sessionId,
      secondFixture.windowId,
    );

    assert.deepEqual(
      {
        code: collision instanceof Error ? (collision as { code?: string }).code : null,
        afterSecond,
        commandReceipts: await commandReceiptCount(commandId),
      },
      { code: '23505', afterSecond: beforeSecond, commandReceipts: 1 },
    );
  });

  // Detects accepting one command_id under two command types and recording a lock receipt over it.
  test('a finalize command_id collision against lock_registration raises 23505 without a new effect', async () => {
    const organizer = await newUser(`finalize-type-collision-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize type collision');
    const fixture = await lockedWindow(organizer, communityId, 1, 1);
    const commandId = randomUUID();
    await finalizeRoster(organizer, {
      commandId,
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    });
    const beforeCollision = await finalizeEffectSnapshot(fixture.sessionId, fixture.windowId);

    const collision = await call<{ window_revision: number }>(
      organizer,
      'select * from public.lock_registration($1, $2, $3)',
      [commandId, fixture.windowId, fixture.revision],
    ).catch((error: Error) => error);
    const afterCollision = await finalizeEffectSnapshot(fixture.sessionId, fixture.windowId);

    assert.deepEqual(
      {
        code: collision instanceof Error ? (collision as { code?: string }).code : null,
        afterCollision,
        commandReceipts: await commandReceiptCount(commandId),
      },
      { code: '23505', afterCollision: beforeCollision, commandReceipts: 1 },
    );
  });

  // Detects an authorization check that accepts capability, a revoked assignment, or assignment elsewhere.
  test('only the active Organizer assignment for this Session may finalize its Registration roster', async () => {
    const organizer = await newUser(`finalize-auth-owner-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize authorization');
    const fixture = await lockedWindow(organizer, communityId, 1, 1);
    const before = await sessionRevision(fixture.sessionId);

    const unassigned = await newUser(`finalize-auth-unassigned-${randomUUID()}@test.local`);
    await activeMembership(communityId, unassigned);
    await grantOrganizer(communityId, unassigned);

    const revoked = await newUser(`finalize-auth-revoked-${randomUUID()}@test.local`);
    await activeMembership(communityId, revoked);
    await grantOrganizer(communityId, revoked);
    await assignOrganizerDirectly(
      fixture.sessionId,
      revoked,
      await membershipId(communityId, revoked),
      true,
    );

    const otherCommunityOrganizer = await newUser(
      `finalize-auth-other-community-${randomUUID()}@test.local`,
    );
    const otherCommunityId = await targetCommunity(
      otherCommunityOrganizer,
      'Finalize other Community',
    );
    await communitySession(otherCommunityOrganizer, otherCommunityId, 'Other Community Session');

    const otherSessionOrganizer = await newUser(
      `finalize-auth-other-session-${randomUUID()}@test.local`,
    );
    await activeMembership(communityId, otherSessionOrganizer);
    await grantOrganizer(communityId, otherSessionOrganizer);
    await communitySession(otherSessionOrganizer, communityId, 'Different assigned Session');

    const cases: Array<{ name: string; actorId: string | null }> = [
      { name: 'anonymous caller', actorId: null },
      { name: 'active but unassigned Community member', actorId: unassigned },
      { name: 'revoked Session Organizer assignment', actorId: revoked },
      { name: 'Organizer from another Community', actorId: otherCommunityOrganizer },
      { name: 'assigned Organizer for a different Session', actorId: otherSessionOrganizer },
    ];

    for (const authorizationCase of cases) {
      const rejected = await finalizeRoster(authorizationCase.actorId, {
        windowId: fixture.windowId,
        expectedRevision: fixture.revision,
      }).catch((error: Error) => error);
      assertSqlState(rejected, '42501');
      await assertNoFinalizeEffects(fixture.sessionId, fixture.windowId, before);
    }
  });

  // Detects loss of SECURITY DEFINER, an unsafe search_path, or an altered public signature.
  test('finalize_session_roster keeps its exact SECURITY DEFINER metadata and empty search_path', async () => {
    const fn = await client.query<{
      prosecdef: boolean;
      proconfig: string[] | null;
    }>(
      `select p.prosecdef, p.proconfig
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'finalize_session_roster'
          and pg_catalog.pg_get_function_identity_arguments(p.oid) =
              'p_command_id uuid, p_window_id uuid, p_expected_registration_revision integer'`,
    );
    assert.deepEqual(fn.rows, [{ prosecdef: true, proconfig: ['search_path=""'] }]);
  });

  // Detects public/anonymous execution or removal of authenticated RPC execution.
  test('finalize_session_roster grants execution only to authenticated', async () => {
    const routineGrants = await client.query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type
         from information_schema.role_routine_grants
        where specific_schema = 'public'
          and routine_name = 'finalize_session_roster'
          and grantee in ('PUBLIC', 'anon', 'authenticated')
        order by grantee, privilege_type`,
    );
    assert.deepEqual(routineGrants.rows, [{ grantee: 'authenticated', privilege_type: 'EXECUTE' }]);

    const execution = await client.query<{
      public_execute: boolean;
      anon_execute: boolean;
      authenticated_execute: boolean;
    }>(
      `select has_function_privilege('public', p.oid, 'EXECUTE') as public_execute,
              has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
              has_function_privilege('authenticated', p.oid, 'EXECUTE')
                as authenticated_execute
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'finalize_session_roster'
          and pg_catalog.pg_get_function_identity_arguments(p.oid) =
              'p_command_id uuid, p_window_id uuid, p_expected_registration_revision integer'`,
    );
    assert.deepEqual(execution.rows, [
      { public_execute: false, anon_execute: false, authenticated_execute: true },
    ]);
  });

  // Detects any browser table/column grant or effective privilege over private Registration rows.
  test('registration_entries exposes no explicit or effective browser privilege', async () => {
    const tableGrants = await client.query<{
      grantee: string;
      privilege_type: string;
    }>(
      `select grantee, privilege_type
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name = 'registration_entries'
          and grantee in ('PUBLIC', 'anon', 'authenticated')
        order by grantee, privilege_type`,
    );
    assert.deepEqual(tableGrants.rows, []);

    const columnGrants = await client.query<{
      column_name: string;
      grantee: string;
      privilege_type: string;
    }>(
      `select column_name, grantee, privilege_type
         from information_schema.role_column_grants
        where table_schema = 'public'
          and table_name = 'registration_entries'
          and grantee in ('PUBLIC', 'anon', 'authenticated')
        order by column_name, grantee, privilege_type`,
    );
    assert.deepEqual(columnGrants.rows, []);

    const effectivePrivileges = await client.query<{
      role_name: string;
      any_table_privilege: boolean;
      any_column_privilege: boolean;
    }>(
      `select role_name,
              pg_catalog.has_table_privilege(
                role_name, 'public.registration_entries',
                pg_catalog.concat_ws(
                  ',', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER',
                  case when pg_catalog.current_setting('server_version_num')::integer >= 170000
                    then 'MAINTAIN'
                  end
                )
              ) as any_table_privilege,
              pg_catalog.has_any_column_privilege(
                role_name, 'public.registration_entries',
                'SELECT,INSERT,UPDATE,REFERENCES'
              ) as any_column_privilege
         from (values ('public'), ('anon'), ('authenticated')) browser_roles(role_name)
        order by role_name`,
    );
    assert.deepEqual(effectivePrivileges.rows, [
      { role_name: 'anon', any_table_privilege: false, any_column_privilege: false },
      { role_name: 'authenticated', any_table_privilege: false, any_column_privilege: false },
      { role_name: 'public', any_table_privilege: false, any_column_privilege: false },
    ]);
  });

  // Detects explicit, column-level, inherited, or PUBLIC browser mutation access to roster state.
  test('roster tables expose no explicit or effective browser mutation privilege', async () => {
    const mutableTableGrants = await client.query<{
      table_name: string;
      grantee: string;
      privilege_type: string;
    }>(
      `select table_name, grantee, privilege_type
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('session_participants', 'roster_revisions', 'roster_revision_entries')
          and grantee in ('PUBLIC', 'anon', 'authenticated')
          and privilege_type in (
            'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
          )
        order by table_name, grantee, privilege_type`,
    );
    assert.deepEqual(mutableTableGrants.rows, []);

    const mutableColumnGrants = await client.query<{
      table_name: string;
      column_name: string;
      grantee: string;
      privilege_type: string;
    }>(
      `select table_name, column_name, grantee, privilege_type
         from information_schema.role_column_grants
        where table_schema = 'public'
          and table_name in ('session_participants', 'roster_revisions', 'roster_revision_entries')
          and grantee in ('PUBLIC', 'anon', 'authenticated')
          and privilege_type in ('INSERT', 'UPDATE', 'REFERENCES')
        order by table_name, column_name, grantee, privilege_type`,
    );
    assert.deepEqual(mutableColumnGrants.rows, []);

    const effectiveMutations = await client.query<{ table_name: string; role_name: string }>(
      `select table_name, role_name
         from (
           values ('session_participants'), ('roster_revisions'), ('roster_revision_entries')
         ) roster_tables(table_name)
         cross join (values ('public'), ('anon'), ('authenticated')) browser_roles(role_name)
        where pg_catalog.has_table_privilege(
                role_name, 'public.' || table_name,
                pg_catalog.concat_ws(
                  ',', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER',
                  case when pg_catalog.current_setting('server_version_num')::integer >= 170000
                    then 'MAINTAIN'
                  end
                )
              )
           or pg_catalog.has_any_column_privilege(
                role_name, 'public.' || table_name, 'INSERT,UPDATE,REFERENCES'
              )
        order by table_name, role_name`,
    );
    assert.deepEqual(effectiveMutations.rows, []);
  });

  // Detects removal, widening, de-duplication loss, or column-order reversal in the source key.
  test('roster revisions have the exact unique partial Registration source index', async () => {
    const indexes = await client.query<{
      indisunique: boolean;
      indisvalid: boolean;
      indisready: boolean;
      indnkeyatts: number;
      indexprs_is_null: boolean;
      columns: string[];
      predicate: string;
    }>(
      `select i.indisunique, i.indisvalid, i.indisready, i.indnkeyatts,
              i.indexprs is null as indexprs_is_null,
              array(
                select a.attname
                  from unnest(i.indkey::smallint[]) with ordinality as key(attnum, position)
                  join pg_catalog.pg_attribute a
                    on a.attrelid = i.indrelid and a.attnum = key.attnum
                 where key.attnum > 0
                   and key.position <= i.indnkeyatts
                 order by key.position
              ) as columns,
              pg_catalog.pg_get_expr(i.indpred, i.indrelid) as predicate
         from pg_catalog.pg_index i
         join pg_catalog.pg_class t on t.oid = i.indrelid
         join pg_catalog.pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public'
          and t.relname = 'roster_revisions'
          and pg_catalog.pg_get_expr(i.indpred, i.indrelid) =
              '(source_kind = ''REGISTRATION''::text)'`,
    );
    assert.deepEqual(indexes.rows, [
      {
        indisunique: true,
        indisvalid: true,
        indisready: true,
        indnkeyatts: 2,
        indexprs_is_null: true,
        columns: ['session_id', 'source_registration_revision'],
        predicate: "(source_kind = 'REGISTRATION'::text)",
      },
    ]);
  });

  // Detects concurrent distinct commands materializing two revisions after one waited on the lock.
  test('two controlled concurrent finalizes converge after one backend observably waits on a lock', async () => {
    const organizer = await newUser(`finalize-concurrent-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize concurrency');
    const fixture = await lockedWindow(organizer, communityId, 1, 1);
    const beforeSessionRevision = await sessionRevision(fixture.sessionId);
    const a = await pool.connect();
    const b = await pool.connect();
    try {
      await beginAsIdentity(a, organizer);
      await beginAsIdentity(b, organizer);
      const aPid = (await a.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;
      const bPid = (await b.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0].pid;
      const race = (db: PoolClient, side: 'a' | 'b') =>
        db
          .query<FinalizeRow>('select * from public.finalize_session_roster($1, $2, $3)', [
            randomUUID(),
            fixture.windowId,
            fixture.revision,
          ])
          .then((result) => ({ side, result }));
      const racingA = race(a, 'a');
      const racingB = race(b, 'b');
      const winner = await Promise.race([racingA, racingB]);
      const loserClient = winner.side === 'a' ? b : a;
      const loserPid = winner.side === 'a' ? bPid : aPid;
      const loserPromise = winner.side === 'a' ? racingB : racingA;

      await waitForBackendLock(loserPid);
      await (winner.side === 'a' ? a : b).query('commit');
      const loser = await loserPromise;
      await loserClient.query('commit');

      assert.equal(
        loser.result.rows[0].roster_revision_id,
        winner.result.rows[0].roster_revision_id,
      );
      assert.equal(
        loser.result.rows[0].roster_revision_number,
        winner.result.rows[0].roster_revision_number,
      );
      assert.equal(await finalizeReceiptCount(fixture.windowId), 2);
      assert.equal(await rosterRevisionCount(fixture.sessionId), 1);
      assert.equal(await sessionRevision(fixture.sessionId), beforeSessionRevision + 1);
    } finally {
      await Promise.allSettled([a.query('rollback'), b.query('rollback')]);
      a.release();
      b.release();
    }
  });

  // Detects partial effects surviving when the Session revision update aborts the command.
  test('an injected Session bump failure rolls back participants, revision, entries, bump and receipt', async () => {
    const organizer = await newUser(`finalize-rollback-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize rollback');
    const fixture = await lockedWindow(organizer, communityId, 1, 1);
    const beforeSessionRevision = await sessionRevision(fixture.sessionId);
    const db = await pool.connect();
    let rolledBack = false;
    try {
      await db.query('begin');
      await db.query('select set_config($1, $2, true)', [
        'volley.test_fail_finalize_session_id',
        fixture.sessionId,
      ]);
      await db.query(`create or replace function pg_temp.fail_finalize_session_bump()
        returns trigger language plpgsql as $$
        begin
          if old.id = pg_catalog.current_setting(
            'volley.test_fail_finalize_session_id', true
          )::uuid then
            raise exception 'injected finalize failure' using errcode = 'P0001';
          end if;
          return new;
        end;
        $$`);
      await db.query(`create trigger fail_finalize_session_bump_trigger
        before update of revision on public.sessions
        for each row execute function pg_temp.fail_finalize_session_bump()`);
      await db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', organizer]);
      await db.query('select set_config($1, $2, true)', [
        'request.jwt.claim.role',
        'authenticated',
      ]);
      await db.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: organizer, role: 'authenticated' }),
      ]);
      await db.query('set local role authenticated');

      const rejected = await db
        .query<FinalizeRow>('select * from public.finalize_session_roster($1, $2, $3)', [
          randomUUID(),
          fixture.windowId,
          fixture.revision,
        ])
        .catch((error: Error) => error);
      assertSqlState(rejected, 'P0001');
      await db.query('rollback');
      rolledBack = true;

      await assertNoFinalizeEffects(fixture.sessionId, fixture.windowId, beforeSessionRevision);
      const trigger = await client.query(
        `select 1 from pg_catalog.pg_trigger
          where tgname = 'fail_finalize_session_bump_trigger' and not tgisinternal`,
      );
      assert.equal(trigger.rowCount, 0);
    } finally {
      if (!rolledBack) await db.query('rollback').catch(() => undefined);
      db.release();
    }
  });

  // Detects readiness continuing to report no roster after a successful finalization.
  test('finalization clears only NO_EFFECTIVE_ROSTER from the incomplete Session readiness blockers', async () => {
    const organizer = await newUser(`finalize-readiness-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize readiness');
    const fixture = await lockedWindow(organizer, communityId, 1, 1);
    await client.query('delete from public.session_courts where session_id = $1', [
      fixture.sessionId,
    ]);

    const before = await call<ReadinessRow>(
      organizer,
      'select * from public.read_target_session_readiness($1)',
      [fixture.sessionId],
    );
    assert.deepEqual(before.rows[0].blockers.map(({ code }) => code).sort(), [
      'COURT_CONFIGURATION_INVALID',
      'NO_EFFECTIVE_ROSTER',
      'RULES_INVALID',
    ]);

    await finalizeRoster(organizer, {
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    });
    const after = await call<ReadinessRow>(
      organizer,
      'select * from public.read_target_session_readiness($1)',
      [fixture.sessionId],
    );
    assert.deepEqual(after.rows[0].blockers.map(({ code }) => code).sort(), [
      'COURT_CONFIGURATION_INVALID',
      'RULES_INVALID',
    ]);
  });

  // Detects convergence that revalidates mutable identity data or rewrites the frozen snapshot.
  test('a distinct finalize after Player identity drift returns the immutable frozen roster and no bump', async () => {
    const organizer = await newUser(`finalize-snapshot-${randomUUID()}@test.local`);
    const communityId = await targetCommunity(organizer, 'Finalize immutable snapshot');
    const fixture = await lockedWindow(organizer, communityId, 1, 1);
    const sourceEntries = await entriesForWindow(fixture.windowId);
    assert.deepEqual(
      sourceEntries.rows.map(({ player_id }) => player_id),
      fixture.confirmedPlayerIds,
    );

    const first = await finalizeRoster(organizer, {
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    });
    const revisionId = first.rows[0].roster_revision_id;
    const frozenEntries = (await rosterEntries(revisionId)).rows;
    const frozenParticipants = (
      await client.query<{
        id: string;
        player_id: string | null;
        display_name: string;
        participation_status: string;
      }>(
        `select id, player_id, display_name, participation_status
           from public.session_participants
          where session_id = $1 order by id`,
        [fixture.sessionId],
      )
    ).rows;
    const afterFirst = await sessionRevision(fixture.sessionId);
    const playerId = fixture.confirmedPlayerIds[0];

    await client.query(
      `update public.players set nickname = 'Identidade mutada', name = 'Nome mutado'
        where id = $1`,
      [playerId],
    );
    await client.query(
      `update public.community_players set active = false, status = 'inactive'
        where community_id = $1 and player_id = $2`,
      [communityId, playerId],
    );
    await client.query(
      `update public.player_account_links set status = 'REVOKED', reviewed_at = now()
        where player_id = $1`,
      [playerId],
    );

    const replay = await finalizeRoster(organizer, {
      windowId: fixture.windowId,
      expectedRevision: fixture.revision,
    });
    assert.deepEqual(replay.rows, first.rows);
    assert.deepEqual((await rosterEntries(revisionId)).rows, frozenEntries);
    assert.deepEqual(
      (
        await client.query(
          `select id, player_id, display_name, participation_status
             from public.session_participants
            where session_id = $1 order by id`,
          [fixture.sessionId],
        )
      ).rows,
      frozenParticipants,
    );
    assert.equal(await sessionRevision(fixture.sessionId), afterFirst);
    assert.equal(await rosterRevisionCount(fixture.sessionId), 1);
    assert.equal(await finalizeReceiptCount(fixture.windowId), 2);
  });
}
