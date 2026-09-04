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

interface IntroductionRow extends QueryResultRow {
  window_id: string;
  window_revision: number;
  confirmed_count: number;
}

interface InspectionRow extends QueryResultRow {
  introducible: boolean;
  source_fingerprint: string | null;
  confirmed_count: number;
  blockers: string[];
  entries: Array<{
    entry_order: number;
    player_id: string;
    display_name_at_time: string;
    eligible: boolean;
  }>;
}

interface LedgerRow extends QueryResultRow {
  registration_window_id: string;
  session_id: string;
  source_kind: string;
  source_roster_revision_id: string;
  source_fingerprint: string;
  confirmed_count: number;
  capacity_at_introduction: number;
  initial_window_status: string;
  initial_window_revision: number;
  queue_chronology: string;
  command_id: string;
  introduced_by_user_id: string | null;
}

interface EntryRow extends QueryResultRow {
  player_id: string;
  status: string;
  queue_sequence: string | null;
  source: string;
}

if (!isTestDatabaseConfigured()) {
  test(`registration introduction requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function createPlayer(
    ownerId: string,
    input: { name?: string; active?: boolean; deletedAt?: string | null } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.players (
         id, owner_id, name, nickname, active, deleted_at, has_account_identity_history
       ) values ($1, $2, $3, null, $4, $5::timestamptz, false)`,
      [id, ownerId, input.name ?? 'Jogadora', input.active ?? true, input.deletedAt ?? null],
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

  async function linkedMember(
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

  async function legacyCommunitySession(
    ownerId: string,
    communityId: string,
    selectedPlayerIds: string[],
    name = 'Pelada legada',
  ): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.sessions (
         owner_id, community_id, name, date, status, type,
         selected_player_ids, team_ids, config
       ) values ($1, $2, $3, '2030-01-01', 'draft', 'free_play', $4::text[], '{}'::text[], '{}'::jsonb)
       returning id`,
      [ownerId, communityId, name, selectedPlayerIds],
    );
    return rows[0].id;
  }

  async function cutOverSession(
    actorId: string,
    communityId: string,
    selectedPlayerIds: string[],
    name?: string,
  ): Promise<string> {
    await grantOrganizer(communityId, actorId);
    const sessionId = await legacyCommunitySession(actorId, communityId, selectedPlayerIds, name);
    const inspection = await call<{ eligible: boolean; source_fingerprint: string }>(
      actorId,
      'select * from public.inspect_legacy_session_cutover($1)',
      [sessionId],
    );
    assert.equal(inspection.rows[0].eligible, true);
    await call(
      actorId,
      `select * from public.transition_legacy_session_to_target($1, $2, $3, 'COMMUNITY', 'FREE_PLAY')`,
      [randomUUID(), sessionId, inspection.rows[0].source_fingerprint],
    );
    return sessionId;
  }

  async function inspectIntroduction(actorId: string | null, sessionId: string) {
    return call<InspectionRow>(
      actorId,
      'select * from public.inspect_registration_introduction($1)',
      [sessionId],
    );
  }

  async function introduce(
    actorId: string | null,
    input: {
      commandId?: string;
      windowId?: string;
      sessionId: string;
      capacity: number;
      closesAt?: string | null;
    },
  ) {
    return call<IntroductionRow>(
      actorId,
      `select * from public.introduce_registration_from_legacy_roster($1, $2, $3, $4, $5::timestamptz)`,
      [
        input.commandId ?? randomUUID(),
        input.windowId ?? randomUUID(),
        input.sessionId,
        input.capacity,
        input.closesAt ?? null,
      ],
    );
  }

  async function entriesOf(windowId: string): Promise<EntryRow[]> {
    const { rows } = await client.query<EntryRow>(
      `select player_id, status, queue_sequence::text as queue_sequence, source
         from public.registration_entries
        where registration_window_id = $1
        order by player_id`,
      [windowId],
    );
    return rows;
  }

  async function ledgerOf(sessionId: string): Promise<LedgerRow[]> {
    const { rows } = await client.query<LedgerRow>(
      'select * from app_private.registration_introductions where session_id = $1',
      [sessionId],
    );
    return rows;
  }

  test('introduction materializes confirmed entries, one revision and an exact ledger row', async () => {
    const organizerId = await newUser('w406-happy-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Happy');
    const first = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const second = await rosterOnlyPlayer(communityId, organizerId, 'Bia');
    const sessionId = await cutOverSession(organizerId, communityId, [first, second]);

    const windowId = randomUUID();
    const commandId = randomUUID();
    const result = await introduce(organizerId, {
      commandId,
      windowId,
      sessionId,
      capacity: 12,
    });

    assert.deepEqual(result.rows, [
      { window_id: windowId, window_revision: 1, confirmed_count: 2 },
    ]);

    const { rows: windows } = await client.query<{
      status: string;
      capacity: number;
      revision: number;
      next_queue_sequence: string;
    }>(
      `select status, capacity, revision, next_queue_sequence::text as next_queue_sequence
         from public.registration_windows where id = $1`,
      [windowId],
    );
    assert.deepEqual(windows, [
      { status: 'DRAFT', capacity: 12, revision: 1, next_queue_sequence: '1' },
    ]);

    const entries = await entriesOf(windowId);
    assert.equal(entries.length, 2);
    for (const entry of entries) {
      assert.equal(entry.status, 'CONFIRMED');
      assert.equal(entry.source, 'MIGRATION');
      assert.equal(entry.queue_sequence, null);
    }
    assert.deepEqual(entries.map((entry) => entry.player_id).sort(), [first, second].sort());

    const ledger = await ledgerOf(sessionId);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].registration_window_id, windowId);
    assert.equal(ledger[0].source_kind, 'LEGACY_SELECTED_ROSTER');
    assert.equal(ledger[0].confirmed_count, 2);
    assert.equal(ledger[0].capacity_at_introduction, 12);
    assert.equal(ledger[0].initial_window_status, 'DRAFT');
    assert.equal(ledger[0].initial_window_revision, 1);
    assert.equal(ledger[0].queue_chronology, 'UNKNOWN');
    assert.equal(ledger[0].command_id, commandId);
    assert.equal(ledger[0].introduced_by_user_id, organizerId);

    const { rows: revisions } = await client.query<{ id: string }>(
      `select id from public.roster_revisions
        where session_id = $1 and source_kind = 'LEGACY_SELECTED_ROSTER'`,
      [sessionId],
    );
    assert.equal(ledger[0].source_roster_revision_id, revisions[0].id);
  });

  test('five migrated members still leave one revision and an untouched queue counter', async () => {
    const organizerId = await newUser('w406-revision-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Revision');
    const players: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      players.push(await rosterOnlyPlayer(communityId, organizerId, `Atleta ${index}`));
    }
    const sessionId = await cutOverSession(organizerId, communityId, players);

    const windowId = randomUUID();
    await introduce(organizerId, { windowId, sessionId, capacity: 10 });

    const { rows } = await client.query<{ revision: number; next_queue_sequence: string }>(
      `select revision, next_queue_sequence::text as next_queue_sequence
         from public.registration_windows where id = $1`,
      [windowId],
    );
    assert.deepEqual(rows, [{ revision: 1, next_queue_sequence: '1' }]);
    assert.equal((await entriesOf(windowId)).length, 5);
  });

  test('the first genuine join after an introduction takes queue sequence 1', async () => {
    const organizerId = await newUser('w406-queue-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Queue');
    const migrated = await rosterOnlyPlayer(communityId, organizerId, 'Migrada');
    const sessionId = await cutOverSession(organizerId, communityId, [migrated]);

    const windowId = randomUUID();
    await introduce(organizerId, { windowId, sessionId, capacity: 1 });
    await call(organizerId, 'select * from public.open_registration($1, $2, $3)', [
      randomUUID(),
      windowId,
      1,
    ]);

    const joiner = await linkedMember(communityId, organizerId, 'w406-queue-joiner@example.com');
    await call(joiner.userId, 'select * from public.join_registration($1, $2, $3)', [
      randomUUID(),
      randomUUID(),
      windowId,
    ]);

    const { rows } = await client.query<{ status: string; queue_sequence: string }>(
      `select status, queue_sequence::text as queue_sequence
         from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [windowId, joiner.playerId],
    );
    assert.deepEqual(rows, [{ status: 'WAITLISTED', queue_sequence: '1' }]);
  });

  test('a migrated member leaving promotes the waitlisted joiner', async () => {
    const organizerId = await newUser('w406-promote-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Promote');
    const migrated = await linkedMember(
      communityId,
      organizerId,
      'w406-promote-migrated@example.com',
    );
    const sessionId = await cutOverSession(organizerId, communityId, [migrated.playerId]);

    const windowId = randomUUID();
    await introduce(organizerId, { windowId, sessionId, capacity: 1 });
    await call(organizerId, 'select * from public.open_registration($1, $2, $3)', [
      randomUUID(),
      windowId,
      1,
    ]);
    const joiner = await linkedMember(communityId, organizerId, 'w406-promote-joiner@example.com');
    await call(joiner.userId, 'select * from public.join_registration($1, $2, $3)', [
      randomUUID(),
      randomUUID(),
      windowId,
    ]);

    await call(migrated.userId, 'select * from public.leave_registration($1, $2)', [
      randomUUID(),
      windowId,
    ]);

    const { rows } = await client.query<{ status: string }>(
      `select status from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [windowId, joiner.playerId],
    );
    assert.deepEqual(rows, [{ status: 'CONFIRMED' }]);
  });

  test('capacity below the migrated confirmed count is refused', async () => {
    const organizerId = await newUser('w406-capacity-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Capacity');
    const first = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const second = await rosterOnlyPlayer(communityId, organizerId, 'Bia');
    const sessionId = await cutOverSession(organizerId, communityId, [first, second]);

    await assert.rejects(introduce(organizerId, { sessionId, capacity: 1 }), (error: unknown) => {
      assertSqlState(error, '23514');
      return true;
    });
  });

  test('one ineligible member refuses the introduction and writes nothing', async () => {
    const organizerId = await newUser('w406-atomic-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Atomic');
    const healthy = await rosterOnlyPlayer(communityId, organizerId, 'Saudavel');
    const doomed = await rosterOnlyPlayer(communityId, organizerId, 'Removida');
    const sessionId = await cutOverSession(organizerId, communityId, [healthy, doomed]);

    await client.query('update public.players set deleted_at = now() where id = $1', [doomed]);

    const commandId = randomUUID();
    await assert.rejects(
      introduce(organizerId, { commandId, sessionId, capacity: 12 }),
      (error: unknown) => {
        assertSqlState(error, '23514');
        return true;
      },
    );

    const { rows: windows } = await client.query(
      'select 1 from public.registration_windows where session_id = $1',
      [sessionId],
    );
    assert.equal(windows.length, 0);
    assert.equal((await ledgerOf(sessionId)).length, 0);
    const { rows: receipts } = await client.query(
      `select 1 from app_private.command_receipts where command_id = $1`,
      [commandId],
    );
    assert.equal(receipts.length, 0);
  });

  test('a caller without a Session organizer assignment is refused by both commands', async () => {
    const organizerId = await newUser('w406-auth-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Auth');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);

    const outsider = await newUser('w406-auth-outsider@example.com');
    await activeMembership(communityId, outsider);

    await assert.rejects(inspectIntroduction(outsider, sessionId), (error: unknown) => {
      assertSqlState(error, '42501');
      return true;
    });
    await assert.rejects(introduce(outsider, { sessionId, capacity: 12 }), (error: unknown) => {
      assertSqlState(error, '42501');
      return true;
    });
  });

  test('a still-legacy Session answers 42501, never a blocker list', async () => {
    const organizerId = await newUser('w406-legacy-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Legacy');
    await grantOrganizer(communityId, organizerId);
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await legacyCommunitySession(organizerId, communityId, [player]);

    await assert.rejects(inspectIntroduction(organizerId, sessionId), (error: unknown) => {
      assertSqlState(error, '42501');
      return true;
    });
    await assert.rejects(introduce(organizerId, { sessionId, capacity: 12 }), (error: unknown) => {
      assertSqlState(error, '42501');
      return true;
    });
  });

  test('inspection reports a window that already exists and names ineligible people', async () => {
    const organizerId = await newUser('w406-inspect-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Inspect');
    const healthy = await rosterOnlyPlayer(communityId, organizerId, 'Saudavel');
    const doomed = await rosterOnlyPlayer(communityId, organizerId, 'Inativa');
    const sessionId = await cutOverSession(organizerId, communityId, [healthy, doomed]);

    const clean = await inspectIntroduction(organizerId, sessionId);
    assert.equal(clean.rows[0].introducible, true);
    assert.deepEqual(clean.rows[0].blockers, []);
    assert.equal(clean.rows[0].confirmed_count, 2);
    assert.equal(clean.rows[0].entries.length, 2);
    assert.ok(clean.rows[0].entries.every((entry) => entry.eligible));

    await client.query('update public.community_players set active = false where player_id = $1', [
      doomed,
    ]);

    const blocked = await inspectIntroduction(organizerId, sessionId);
    assert.equal(blocked.rows[0].introducible, false);
    assert.deepEqual(blocked.rows[0].blockers, ['PLAYER_NOT_ELIGIBLE']);
    const ineligible = blocked.rows[0].entries.filter((entry) => !entry.eligible);
    assert.deepEqual(
      ineligible.map((entry) => entry.player_id),
      [doomed],
    );
  });

  test('inspection reports a missing legacy roster and an existing Window', async () => {
    const organizerId = await newUser('w406-blockers-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Blockers');
    await grantOrganizer(communityId, organizerId);

    const nativeSessionId = randomUUID();
    await call(
      organizerId,
      `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
      [nativeSessionId, communityId, 'Nativa'],
    );

    const missing = await inspectIntroduction(organizerId, nativeSessionId);
    assert.equal(missing.rows[0].introducible, false);
    assert.deepEqual(missing.rows[0].blockers, ['LEGACY_ROSTER_MISSING']);
    assert.equal(missing.rows[0].source_fingerprint, null);

    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const cutOverId = await cutOverSession(organizerId, communityId, [player], 'Com janela');
    await introduce(organizerId, { sessionId: cutOverId, capacity: 12 });

    const taken = await inspectIntroduction(organizerId, cutOverId);
    assert.equal(taken.rows[0].introducible, false);
    assert.deepEqual(taken.rows[0].blockers, ['REGISTRATION_WINDOW_EXISTS']);
  });

  test('a QUICK Session and a Session past its window are blocked', async () => {
    const organizerId = await newUser('w406-context-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Context');
    await grantOrganizer(communityId, organizerId);

    const quickSessionId = randomUUID();
    await call(
      organizerId,
      `select public.create_target_session($1, null, 'QUICK', 'FREE_PLAY', $2, null, null)`,
      [quickSessionId, 'Avulsa'],
    );
    const quick = await inspectIntroduction(organizerId, quickSessionId);
    assert.ok(quick.rows[0].blockers.includes('SESSION_NOT_COMMUNITY'));
    await assert.rejects(
      introduce(organizerId, { sessionId: quickSessionId, capacity: 8 }),
      (error: unknown) => {
        assertSqlState(error, '23514');
        return true;
      },
    );

    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const pastSessionId = await cutOverSession(organizerId, communityId, [player], 'Encerrada');
    await client.query(`update public.sessions set lifecycle_status = 'FINISHED' where id = $1`, [
      pastSessionId,
    ]);

    const past = await inspectIntroduction(organizerId, pastSessionId);
    assert.ok(past.rows[0].blockers.includes('SESSION_NOT_UPCOMING'));
    await assert.rejects(
      introduce(organizerId, { sessionId: pastSessionId, capacity: 8 }),
      (error: unknown) => {
        assertSqlState(error, '23514');
        return true;
      },
    );
  });

  // The two blockers below cannot be produced by any supported command today: the cutover writes a
  // revision only when it resolved at least one PLAYER entry. They are defense in depth, so these
  // fixtures build the state directly and would go live the day the cutover learns to carry guests.
  test('an empty or non-player legacy revision is blocked', async () => {
    const organizerId = await newUser('w406-defense-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Defense');
    await grantOrganizer(communityId, organizerId);

    const emptySessionId = randomUUID();
    await call(
      organizerId,
      `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
      [emptySessionId, communityId, 'Revisao vazia'],
    );
    await client.query(
      `insert into public.roster_revisions (
         id, session_id, revision_number, source_kind, source_session_revision,
         source_registration_revision, source_payload_hash, created_by_user_id
       ) values ($1, $2, 1, 'LEGACY_SELECTED_ROSTER', 1, null, null, null)`,
      [randomUUID(), emptySessionId],
    );

    const empty = await inspectIntroduction(organizerId, emptySessionId);
    assert.ok(empty.rows[0].blockers.includes('LEGACY_ROSTER_EMPTY'));
    await assert.rejects(
      introduce(organizerId, { sessionId: emptySessionId, capacity: 8 }),
      (error: unknown) => {
        assertSqlState(error, '23514');
        return true;
      },
    );

    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const guestSessionId = await cutOverSession(
      organizerId,
      communityId,
      [player],
      'Com convidada',
    );
    const { rows: revisions } = await client.query<{ id: string }>(
      `select id from public.roster_revisions
        where session_id = $1 and source_kind = 'LEGACY_SELECTED_ROSTER'`,
      [guestSessionId],
    );
    const participantId = randomUUID();
    await client.query(
      `insert into public.session_participants (
         id, session_id, identity_kind, player_id, source_kind, display_name, participation_status
       ) values ($1, $2, 'GUEST', null, 'LEGACY_SELECTED_ROSTER', 'Convidada', 'INCLUDED')`,
      [participantId, guestSessionId],
    );
    await client.query(
      `insert into public.roster_revision_entries (
         roster_revision_id, session_id, participant_id, entry_order,
         identity_kind, player_id, display_name_at_time
       ) values ($1, $2, $3, 99, 'GUEST', null, 'Convidada')`,
      [revisions[0].id, guestSessionId, participantId],
    );

    const guest = await inspectIntroduction(organizerId, guestSessionId);
    assert.ok(guest.rows[0].blockers.includes('ROSTER_ENTRY_NOT_PLAYER'));
    await assert.rejects(
      introduce(organizerId, { sessionId: guestSessionId, capacity: 8 }),
      (error: unknown) => {
        assertSqlState(error, '23514');
        return true;
      },
    );
  });

  test('a superseded legacy revision blocks both commands', async () => {
    const organizerId = await newUser('w406-superseded-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Superseded');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);

    await client.query(
      `insert into public.roster_revisions (
         id, session_id, revision_number, source_kind, source_session_revision,
         source_registration_revision, source_payload_hash, created_by_user_id
       ) values ($1, $2, 2, 'QUICK_DIRECT', 1, null, null, null)`,
      [randomUUID(), sessionId],
    );

    const inspection = await inspectIntroduction(organizerId, sessionId);
    assert.deepEqual(inspection.rows[0].blockers, ['LEGACY_ROSTER_SUPERSEDED']);
    await assert.rejects(introduce(organizerId, { sessionId, capacity: 12 }), (error: unknown) => {
      assertSqlState(error, '23514');
      return true;
    });
  });

  test('the same command id replays the stored receipt', async () => {
    const organizerId = await newUser('w406-replay-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Replay');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);

    const commandId = randomUUID();
    const windowId = randomUUID();
    const first = await introduce(organizerId, { commandId, windowId, sessionId, capacity: 8 });
    const second = await introduce(organizerId, { commandId, windowId, sessionId, capacity: 8 });

    assert.deepEqual(second.rows, first.rows);
    assert.equal((await ledgerOf(sessionId)).length, 1);
    assert.equal((await entriesOf(windowId)).length, 1);
  });

  test('a distinct command id on the same Session is refused', async () => {
    const organizerId = await newUser('w406-duplicate-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Duplicate');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);

    await introduce(organizerId, { sessionId, capacity: 8 });
    await assert.rejects(introduce(organizerId, { sessionId, capacity: 8 }), (error: unknown) => {
      assertSqlState(error, '23514');
      return true;
    });
    assert.equal((await ledgerOf(sessionId)).length, 1);
  });

  test('two concurrent introductions leave one winner and no partial state', async () => {
    const organizerId = await newUser('w406-race-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Race');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);

    const attempts = await Promise.allSettled([
      introduce(organizerId, { sessionId, capacity: 8 }),
      introduce(organizerId, { sessionId, capacity: 8 }),
    ]);

    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    assert.equal(fulfilled.length, 1);
    assert.equal((await ledgerOf(sessionId)).length, 1);

    const { rows } = await client.query<{ count: string }>(
      'select count(*)::text as count from public.registration_windows where session_id = $1',
      [sessionId],
    );
    assert.deepEqual(rows, [{ count: '1' }]);
  });

  test('the ledger is immutable but tolerates the auth.users cascade', async () => {
    const ownerId = await newUser('w406-ledger-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W406 Ledger');
    const player = await rosterOnlyPlayer(communityId, ownerId, 'Ana');

    const organizerId = await newUser('w406-ledger-organizer@example.com');
    await activeMembership(communityId, organizerId);
    await grantOrganizer(communityId, organizerId);
    const sessionId = await legacyCommunitySession(ownerId, communityId, [player]);
    const inspection = await call<{ eligible: boolean; source_fingerprint: string }>(
      organizerId,
      'select * from public.inspect_legacy_session_cutover($1)',
      [sessionId],
    );
    assert.equal(inspection.rows[0].eligible, true);
    await call(
      organizerId,
      `select * from public.transition_legacy_session_to_target($1, $2, $3, 'COMMUNITY', 'FREE_PLAY')`,
      [randomUUID(), sessionId, inspection.rows[0].source_fingerprint],
    );
    await introduce(organizerId, { sessionId, capacity: 8 });

    await assert.rejects(
      client.query(
        'update app_private.registration_introductions set capacity_at_introduction = 99 where session_id = $1',
        [sessionId],
      ),
      (error: unknown) => {
        assertSqlState(error, '55000');
        return true;
      },
    );
    await assert.rejects(
      client.query('delete from app_private.registration_introductions where session_id = $1', [
        sessionId,
      ]),
      (error: unknown) => {
        assertSqlState(error, '55000');
        return true;
      },
    );

    await client.query(
      'alter table public.players disable trigger trg_guard_player_account_identity_history',
    );
    await client.query('alter table public.players disable trigger trg_guard_player_user_id');
    await client.query('alter table public.players disable trigger audit_players');
    await client.query('alter table public.sessions disable trigger audit_sessions');
    try {
      await client.query('delete from auth.users where id = $1', [organizerId]);
    } finally {
      await client.query('alter table public.sessions enable trigger audit_sessions');
      await client.query('alter table public.players enable trigger audit_players');
      await client.query('alter table public.players enable trigger trg_guard_player_user_id');
      await client.query(
        'alter table public.players enable trigger trg_guard_player_account_identity_history',
      );
    }
    const ledger = await ledgerOf(sessionId);
    assert.equal(ledger.length, 1);
    assert.equal(ledger[0].introduced_by_user_id, null);
    assert.equal(ledger[0].capacity_at_introduction, 8);
  });

  test('a migrated player with no account link stays eligible and promotable', async () => {
    const organizerId = await newUser('w406-asymmetry-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Asymmetry');
    const accountless = await rosterOnlyPlayer(communityId, organizerId, 'Sem conta');
    const sessionId = await cutOverSession(organizerId, communityId, [accountless]);

    const windowId = randomUUID();
    await introduce(organizerId, { windowId, sessionId, capacity: 1 });
    await call(organizerId, 'select * from public.open_registration($1, $2, $3)', [
      randomUUID(),
      windowId,
      1,
    ]);

    const { rows: entryRows } = await client.query<{ id: string }>(
      `select id from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [windowId, accountless],
    );
    const { rows: eligibility } = await client.query<{ eligible: boolean }>(
      'select app_private.registration_entry_still_eligible($1) as eligible',
      [entryRows[0].id],
    );
    assert.deepEqual(eligibility, [{ eligible: true }]);
  });

  test('no browser path mutates the migrated roster or reads the private surfaces', async () => {
    const organizerId = await newUser('w406-gate-organizer@example.com');
    const communityId = await targetCommunity(organizerId, 'W406 Gate');
    const player = await rosterOnlyPlayer(communityId, organizerId, 'Ana');
    const sessionId = await cutOverSession(organizerId, communityId, [player]);
    const windowId = randomUUID();
    await introduce(organizerId, { windowId, sessionId, capacity: 8 });

    const update = await call(
      organizerId,
      `update public.sessions set selected_player_ids = '{}'::text[] where id = $1`,
      [sessionId],
    );
    assert.equal(update.rowCount, 0);

    await assert.rejects(
      call(organizerId, 'select count(*) from public.registration_entries'),
      (error: unknown) => {
        assertSqlState(error, '42501');
        return true;
      },
    );
    await assert.rejects(
      call(organizerId, 'select count(*) from app_private.registration_introductions'),
      (error: unknown) => {
        assertSqlState(error, '42501');
        return true;
      },
    );

    const { rows: privileges } = await client.query<{ count: string }>(
      `select count(*)::text as count
         from information_schema.role_table_grants
        where table_schema = 'app_private'
          and table_name = 'registration_introductions'`,
    );
    assert.deepEqual(privileges, [{ count: '0' }]);
  });
}
