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

const MIGRATION = '20260916120000_reopen_registration.sql';

interface WindowRow extends QueryResultRow {
  window_id: string;
  session_id: string;
  status: string;
  revision: number;
  capacity: number;
  confirmed_player_ids: string[];
}

if (!isTestDatabaseConfigured()) {
  test(`registration reopen requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run \`npm run test:db\`.`);
  });
} else {
  let client: Client;
  let pool: Pool;

  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.deepEqual(
      result.failures.filter(({ migration }) => migration === MIGRATION),
      [],
    );
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

  const failing = (userId: string | null, sql: string, params: unknown[] = []) =>
    call(userId, sql, params).catch((error: Error) => error);

  function assertSqlState(error: unknown, code: string) {
    assert.ok(error instanceof Error, 'expected an error');
    assert.equal((error as { code?: string }).code, code);
  }

  async function newUser(label: string): Promise<string> {
    const email = `${label}-${randomUUID()}@test.local`;
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

  async function targetCommunity(ownerId: string): Promise<string> {
    const { rows } = await call<{ id: string }>(
      ownerId,
      'select public.create_community_with_owner($1) as id',
      [`Reopen ${randomUUID()}`],
    );
    return rows[0].id;
  }

  async function grantOrganizer(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [communityId, userId],
    );
  }

  async function activeMember(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [communityId, userId],
    );
  }

  async function communitySession(ownerId: string, communityId: string): Promise<string> {
    await grantOrganizer(communityId, ownerId);
    const sessionId = randomUUID();
    await call(
      ownerId,
      `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', 'Reabertura', null, null)`,
      [sessionId, communityId],
    );
    return sessionId;
  }

  async function rosterPlayer(communityId: string, ownerId: string, name: string): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active, has_account_identity_history)
       values ($1, $2, $3, true, false)`,
      [id, ownerId, name],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, id, ownerId],
    );
    return id;
  }

  async function lifecycle(
    actorId: string,
    command:
      | 'open_registration'
      | 'close_registration'
      | 'lock_registration'
      | 'reopen_registration',
    windowId: string,
    expectedRevision: number,
    commandId = randomUUID(),
  ): Promise<number> {
    const { rows } = await call<{ window_revision: number }>(
      actorId,
      `select * from public.${command}($1, $2, $3)`,
      [commandId, windowId, expectedRevision],
    );
    return rows[0].window_revision;
  }

  async function addEntry(actorId: string, windowId: string, playerId: string): Promise<number> {
    const { rows } = await call<{ window_revision: number }>(
      actorId,
      'select * from public.add_registration_entry($1, $2, $3, $4)',
      [randomUUID(), randomUUID(), windowId, playerId],
    );
    return rows[0].window_revision;
  }

  async function removeEntry(actorId: string, windowId: string, playerId: string): Promise<number> {
    const { rows } = await call<{ window_revision: number }>(
      actorId,
      'select * from public.remove_registration_entry($1, $2, $3, $4)',
      [randomUUID(), windowId, playerId, 'ORGANIZER_DESELECTED'],
    );
    return rows[0].window_revision;
  }

  async function finalize(actorId: string, windowId: string, revision: number): Promise<string> {
    const { rows } = await call<{ roster_revision_id: string }>(
      actorId,
      'select * from public.finalize_session_roster($1, $2, $3)',
      [randomUUID(), windowId, revision],
    );
    return rows[0].roster_revision_id;
  }

  async function readWindow(actorId: string, windowId: string): Promise<WindowRow> {
    const { rows } = await call<WindowRow>(
      actorId,
      'select * from public.read_registration_window($1)',
      [windowId],
    );
    return rows[0];
  }

  async function participants(rosterRevisionId: string): Promise<Map<string, string>> {
    const { rows } = await client.query<{ player_id: string; participant_id: string }>(
      'select player_id, participant_id from public.roster_revision_entries where roster_revision_id = $1',
      [rosterRevisionId],
    );
    return new Map(rows.map((row) => [row.player_id, row.participant_id]));
  }

  async function lockedWindow(playerCount: number) {
    const ownerId = await newUser('owner');
    const communityId = await targetCommunity(ownerId);
    const sessionId = await communitySession(ownerId, communityId);
    const players: string[] = [];
    for (let index = 0; index < playerCount; index += 1) {
      players.push(await rosterPlayer(communityId, ownerId, `Atleta ${index}`));
    }
    const windowId = randomUUID();
    const created = await call<{ window_revision: number }>(
      ownerId,
      'select * from public.create_registration_window($1, $2, $3, $4, null)',
      [randomUUID(), windowId, sessionId, playerCount],
    );
    let revision = await lifecycle(
      ownerId,
      'open_registration',
      windowId,
      created.rows[0].window_revision,
    );
    for (const playerId of players) revision = await addEntry(ownerId, windowId, playerId);
    revision = await lifecycle(ownerId, 'close_registration', windowId, revision);
    revision = await lifecycle(ownerId, 'lock_registration', windowId, revision);
    return { ownerId, communityId, sessionId, windowId, players, revision };
  }

  test('reopen moves a LOCKED Window back to OPEN and bumps the revision', async () => {
    const w = await lockedWindow(2);
    const next = await lifecycle(w.ownerId, 'reopen_registration', w.windowId, w.revision);
    assert.equal(next, w.revision + 1);
    const read = await readWindow(w.ownerId, w.windowId);
    assert.equal(read.status, 'OPEN');
    assert.equal(read.revision, next);
  });

  test('reopen moves a CLOSED Window back to OPEN', async () => {
    const ownerId = await newUser('closed-owner');
    const communityId = await targetCommunity(ownerId);
    const sessionId = await communitySession(ownerId, communityId);
    const playerId = await rosterPlayer(communityId, ownerId, 'Fechada');
    const windowId = randomUUID();
    const created = await call<{ window_revision: number }>(
      ownerId,
      'select * from public.create_registration_window($1, $2, $3, 1, null)',
      [randomUUID(), windowId, sessionId],
    );
    await lifecycle(ownerId, 'open_registration', windowId, created.rows[0].window_revision);
    let revision = await addEntry(ownerId, windowId, playerId);
    revision = await lifecycle(ownerId, 'close_registration', windowId, revision);
    const next = await lifecycle(ownerId, 'reopen_registration', windowId, revision);
    assert.equal((await readWindow(ownerId, windowId)).status, 'OPEN');
    assert.equal(next, revision + 1);
  });

  test('reopen of an OPEN Window is a no-op that returns the current revision', async () => {
    const w = await lockedWindow(1);
    const open = await lifecycle(w.ownerId, 'reopen_registration', w.windowId, w.revision);
    const again = await lifecycle(w.ownerId, 'reopen_registration', w.windowId, 0);
    assert.equal(again, open);
  });

  test('reopen refuses a DRAFT Window, a started Session, a non-organizer and a stale revision', async () => {
    const ownerId = await newUser('draft-owner');
    const communityId = await targetCommunity(ownerId);
    const sessionId = await communitySession(ownerId, communityId);
    const draftWindow = randomUUID();
    await call(ownerId, 'select * from public.create_registration_window($1, $2, $3, 2, null)', [
      randomUUID(),
      draftWindow,
      sessionId,
    ]);
    assertSqlState(
      await failing(ownerId, 'select * from public.reopen_registration($1, $2, $3)', [
        randomUUID(),
        draftWindow,
        1,
      ]),
      '23514',
    );

    const w = await lockedWindow(1);
    assertSqlState(
      await failing(w.ownerId, 'select * from public.reopen_registration($1, $2, $3)', [
        randomUUID(),
        w.windowId,
        w.revision - 1,
      ]),
      '40001',
    );

    const stranger = await newUser('member');
    await activeMember(w.communityId, stranger);
    assertSqlState(
      await failing(stranger, 'select * from public.reopen_registration($1, $2, $3)', [
        randomUUID(),
        w.windowId,
        w.revision,
      ]),
      '42501',
    );

    await client.query(
      "update public.sessions set lifecycle_status = 'IN_PROGRESS', actual_started_at = now() where id = $1",
      [w.sessionId],
    );
    assertSqlState(
      await failing(w.ownerId, 'select * from public.reopen_registration($1, $2, $3)', [
        randomUUID(),
        w.windowId,
        w.revision,
      ]),
      '23514',
    );
  });

  test('replaying the same reopen command returns its receipt', async () => {
    const w = await lockedWindow(1);
    const commandId = randomUUID();
    const first = await lifecycle(
      w.ownerId,
      'reopen_registration',
      w.windowId,
      w.revision,
      commandId,
    );
    const closed = await lifecycle(w.ownerId, 'close_registration', w.windowId, first);
    const replay = await lifecycle(w.ownerId, 'reopen_registration', w.windowId, closed, commandId);
    assert.equal(replay, first);
  });

  test('open_registration still refuses to leave LOCKED', async () => {
    const w = await lockedWindow(1);
    assertSqlState(
      await failing(w.ownerId, 'select * from public.open_registration($1, $2, $3)', [
        randomUUID(),
        w.windowId,
        w.revision,
      ]),
      '23514',
    );
  });

  test('a reopen round finalizes revision 2 with reused participants, and capture only accepts it', async () => {
    const w = await lockedWindow(2);
    const first = await finalize(w.ownerId, w.windowId, w.revision);
    const firstParticipants = await participants(first);

    const newcomer = await rosterPlayer(w.communityId, w.ownerId, 'Chegou atrasado');
    await lifecycle(w.ownerId, 'reopen_registration', w.windowId, w.revision);
    await removeEntry(w.ownerId, w.windowId, w.players[1]);
    let revision = await addEntry(w.ownerId, w.windowId, newcomer);
    revision = await lifecycle(w.ownerId, 'close_registration', w.windowId, revision);
    revision = await lifecycle(w.ownerId, 'lock_registration', w.windowId, revision);
    const second = await finalize(w.ownerId, w.windowId, revision);

    assert.notEqual(second, first);
    const secondParticipants = await participants(second);
    assert.equal(secondParticipants.get(w.players[0]), firstParticipants.get(w.players[0]));
    assert.equal(secondParticipants.has(w.players[1]), false);
    assert.equal(secondParticipants.has(newcomer), true);

    assertSqlState(
      await failing(w.ownerId, 'select public.capture_balance_input_snapshot($1, $2, $3)', [
        randomUUID(),
        w.sessionId,
        first,
      ]),
      '40001',
    );
    const { rows } = await call<{ snapshot: { participants: unknown[] } }>(
      w.ownerId,
      'select public.capture_balance_input_snapshot($1, $2, $3) as snapshot',
      [randomUUID(), w.sessionId, second],
    );
    assert.equal(rows[0].snapshot.participants.length, 2);
  });

  test('read_registration_window returns confirmed players in order and guards access', async () => {
    const w = await lockedWindow(3);
    const read = await readWindow(w.ownerId, w.windowId);
    assert.deepEqual(
      { status: read.status, capacity: read.capacity, confirmed: read.confirmed_player_ids },
      { status: 'LOCKED', capacity: 3, confirmed: w.players },
    );
    assert.equal(read.session_id, w.sessionId);

    const stranger = await newUser('reader');
    await activeMember(w.communityId, stranger);
    assertSqlState(
      await failing(stranger, 'select * from public.read_registration_window($1)', [w.windowId]),
      '42501',
    );
    assertSqlState(
      await failing(w.ownerId, 'select * from public.read_registration_window($1)', [randomUUID()]),
      'P0002',
    );
  });
}
