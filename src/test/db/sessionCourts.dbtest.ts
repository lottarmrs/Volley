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

if (!isTestDatabaseConfigured()) {
  test(`session courts require ${TEST_DATABASE_URL_VAR}`, () => {
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

  const callFailing = (userId: string | null, sql: string, params: unknown[] = []) =>
    call(userId, sql, params).catch((error: Error) => error);

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
       on conflict (community_id, user_id)
       do update set status = 'active'`,
      [communityId, userId],
    );
  }

  async function grantOrganizer(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility)
       do update set revoked_at = null`,
      [communityId, userId],
    );
  }

  async function createTargetSession(
    actorId: string,
    input: { communityId?: string | null; context?: 'QUICK' | 'COMMUNITY'; name?: string } = {},
  ): Promise<string> {
    const { rows } = await call<{ id: string }>(
      actorId,
      `select public.create_target_session(
         gen_random_uuid(), $1, $2, 'FREE_PLAY', $3, null, null
       ) as id`,
      [input.communityId ?? null, input.context ?? 'QUICK', input.name ?? 'Target Session'],
    );
    return rows[0].id;
  }

  async function addCourt(
    actorId: string | null,
    courtId: string | null,
    sessionId: string,
    expectedRevision: number,
    label: string,
    courtOrder: number,
  ) {
    return call(actorId, 'select * from public.add_target_session_court($1, $2, $3, $4, $5)', [
      courtId,
      sessionId,
      expectedRevision,
      label,
      courtOrder,
    ]);
  }

  test('session_courts session FK retains a complete leading-column btree index', async () => {
    const { rows } = await client.query<{ constraint_name: string; fk_column: string }>(
      `select con.conname as constraint_name, att.attname as fk_column
         from pg_constraint con
         cross join lateral unnest(con.conkey) as fk(attnum)
         join pg_attribute att
           on att.attrelid = con.conrelid
          and att.attnum = fk.attnum
        where con.contype = 'f'
          and con.conrelid = 'public.session_courts'::regclass
          and not exists (
            select 1
              from pg_index i
             where i.indrelid = con.conrelid
               and i.indisvalid
               and i.indisready
               and i.indpred is null
               and i.indam = (select oid from pg_am where amname = 'btree')
               and i.indkey[0] = fk.attnum
          )
        order by att.attname`,
    );
    assert.deepEqual(rows, []);
  });

  test('create_target_session atomically materializes one default Court identity', async () => {
    const organizer = await newUser('court-default@test.local');
    const sessionId = await createTargetSession(organizer);
    const { rows } = await client.query(
      `select session_id, label, court_order from public.session_courts where session_id = $1`,
      [sessionId],
    );
    assert.deepEqual(rows, [{ session_id: sessionId, label: 'Quadra 1', court_order: 1 }]);
  });

  test('assigned Organizer adds a caller-addressable Court and advances Session revision', async () => {
    const organizer = await newUser('court-add@test.local');
    const sessionId = await createTargetSession(organizer);
    const courtId = randomUUID();
    const result = await call(
      organizer,
      `select * from public.add_target_session_court($1, $2, 1, 'Quadra 2', 2)`,
      [courtId, sessionId],
    );
    assert.deepEqual(result.rows, [{ court_id: courtId, session_revision: 2 }]);
  });

  test('an eligible but unassigned Organizer cannot add a Court', async () => {
    const owner = await newUser('court-unassigned-owner@test.local');
    const assignedOrganizer = await newUser('court-unassigned-assigned@test.local');
    const unassignedOrganizer = await newUser('court-unassigned-eligible@test.local');
    const community = await targetCommunity(owner, 'Court assignment boundary');
    await activeMembership(community, assignedOrganizer);
    await activeMembership(community, unassignedOrganizer);
    await grantOrganizer(community, assignedOrganizer);
    await grantOrganizer(community, unassignedOrganizer);
    const sessionId = await createTargetSession(assignedOrganizer, {
      communityId: community,
      context: 'COMMUNITY',
    });

    const denied = await callFailing(
      unassignedOrganizer,
      'select * from public.add_target_session_court($1, $2, 1, $3, 2)',
      [randomUUID(), sessionId, 'Quadra denied'],
    );
    assert.ok(denied instanceof Error);
    assert.match((denied as Error).message, /assignment|authorized/i);
  });

  test('a stale Session revision is rejected and creates no Court', async () => {
    const organizer = await newUser('court-stale@test.local');
    const sessionId = await createTargetSession(organizer);
    const firstCourtId = randomUUID();
    await addCourt(organizer, firstCourtId, sessionId, 1, 'Quadra 2', 2);

    const staleCourtId = randomUUID();
    const stale = await callFailing(
      organizer,
      'select * from public.add_target_session_court($1, $2, 1, $3, 3)',
      [staleCourtId, sessionId, 'Quadra stale'],
    );
    assert.ok(stale instanceof Error);
    assert.match((stale as Error).message, /stale.*revision/i);

    const { rows } = await client.query<{ court_order: number }>(
      `select court_order from public.session_courts
       where session_id = $1 order by court_order`,
      [sessionId],
    );
    assert.deepEqual(rows, [{ court_order: 1 }, { court_order: 2 }]);
  });

  test('anonymous calls and direct authenticated Court mutations are rejected', async () => {
    const organizer = await newUser('court-rls@test.local');
    const sessionId = await createTargetSession(organizer);
    const anonymous = await callFailing(
      null,
      'select * from public.add_target_session_court($1, $2, 1, $3, 2)',
      [randomUUID(), sessionId, 'Quadra anonymous'],
    );
    assert.ok(anonymous instanceof Error);
    assert.match((anonymous as Error).message, /permission denied|not authenticated/i);

    const directInsert = await callFailing(
      organizer,
      `insert into public.session_courts (id, session_id, label, court_order)
       values ($1, $2, 'Quadra direct', 2)`,
      [randomUUID(), sessionId],
    );
    const directUpdate = await callFailing(
      organizer,
      "update public.session_courts set label = 'Quadra altered' where session_id = $1",
      [sessionId],
    );
    const directDelete = await callFailing(
      organizer,
      'delete from public.session_courts where session_id = $1',
      [sessionId],
    );
    for (const attempt of [directInsert, directUpdate, directDelete]) {
      assert.ok(attempt instanceof Error);
      assert.match((attempt as Error).message, /permission denied|row-level security/i);
    }
  });

  test('add_target_session_court rejects invalid Court identity and attributes', async () => {
    const organizer = await newUser('court-validation@test.local');
    const sessionId = await createTargetSession(organizer);
    const invalidCommands: Array<[string | null, string, number]> = [
      [null, 'Quadra null', 2],
      [randomUUID(), '   ', 2],
      [randomUUID(), 'Quadra zero', 0],
    ];

    for (const [courtId, label, courtOrder] of invalidCommands) {
      const rejected = await addCourt(organizer, courtId, sessionId, 1, label, courtOrder).catch(
        (error: Error) => error,
      );
      assert.ok(rejected instanceof Error);
    }

    const { rows } = await client.query<{ count: string }>(
      'select count(*) from public.session_courts where session_id = $1',
      [sessionId],
    );
    assert.equal(rows[0].count, '1');
  });

  test('duplicate Court order in one Session is rejected', async () => {
    const organizer = await newUser('court-duplicate@test.local');
    const sessionId = await createTargetSession(organizer);
    await addCourt(organizer, randomUUID(), sessionId, 1, 'Quadra 2', 2);

    const duplicate = await addCourt(
      organizer,
      randomUUID(),
      sessionId,
      2,
      'Quadra duplicate',
      2,
    ).catch((error: Error) => error);
    assert.ok(duplicate instanceof Error);
  });

  test('the same Court order can be used in another Session', async () => {
    const organizer = await newUser('court-cross-session@test.local');
    const firstSessionId = await createTargetSession(organizer, { name: 'First court Session' });
    const secondSessionId = await createTargetSession(organizer, { name: 'Second court Session' });

    await addCourt(organizer, randomUUID(), firstSessionId, 1, 'Quadra 2', 2);
    const result = await addCourt(organizer, randomUUID(), secondSessionId, 1, 'Quadra 2', 2);
    assert.equal(result.rows[0].session_revision, 2);
  });

  test('legacy Sessions do not receive default Courts', async () => {
    const owner = await newUser('court-legacy@test.local');
    const { rows } = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, name, date, status, type)
       values ($1, 'Legacy court-free Session', '2030-01-01', 'draft', 'free_play')
       returning id`,
      [owner],
    );
    const courts = await client.query<{ count: string }>(
      'select count(*) from public.session_courts where session_id = $1',
      [rows[0].id],
    );
    assert.equal(courts.rows[0].count, '0');
  });

  test('active Community members and the Quick assigned Organizer can read their Session Courts', async () => {
    const owner = await newUser('court-read-community-owner@test.local');
    const organizer = await newUser('court-read-community-organizer@test.local');
    const member = await newUser('court-read-community-member@test.local');
    const quickOrganizer = await newUser('court-read-quick-organizer@test.local');
    const community = await targetCommunity(owner, 'Court readers');
    await activeMembership(community, organizer);
    await activeMembership(community, member);
    await grantOrganizer(community, organizer);
    const communitySessionId = await createTargetSession(organizer, {
      communityId: community,
      context: 'COMMUNITY',
    });
    const quickSessionId = await createTargetSession(quickOrganizer);

    const memberRead = await call<{ label: string }>(
      member,
      'select label from public.session_courts where session_id = $1',
      [communitySessionId],
    );
    const organizerRead = await call<{ label: string }>(
      quickOrganizer,
      'select label from public.session_courts where session_id = $1',
      [quickSessionId],
    );
    assert.deepEqual(memberRead.rows, [{ label: 'Quadra 1' }]);
    assert.deepEqual(organizerRead.rows, [{ label: 'Quadra 1' }]);
  });

  test('outsiders cannot read Session Courts', async () => {
    const owner = await newUser('court-read-outsider-owner@test.local');
    const communityOrganizer = await newUser('court-read-outsider-community-organizer@test.local');
    const quickOrganizer = await newUser('court-read-outsider-quick-organizer@test.local');
    const outsider = await newUser('court-read-outsider@test.local');
    const community = await targetCommunity(owner, 'Court outsider boundary');
    await activeMembership(community, communityOrganizer);
    await grantOrganizer(community, communityOrganizer);
    const communitySessionId = await createTargetSession(communityOrganizer, {
      communityId: community,
      context: 'COMMUNITY',
    });
    const quickSessionId = await createTargetSession(quickOrganizer);

    const communityRead = await call(
      outsider,
      'select * from public.session_courts where session_id = $1',
      [communitySessionId],
    );
    const quickRead = await call(
      outsider,
      'select * from public.session_courts where session_id = $1',
      [quickSessionId],
    );
    assert.deepEqual(communityRead.rows, []);
    assert.deepEqual(quickRead.rows, []);
  });

  test('deleting a Session deletes its Courts as aggregate composition', async () => {
    const organizer = await newUser('court-delete@test.local');
    const sessionId = await createTargetSession(organizer);
    await addCourt(organizer, randomUUID(), sessionId, 1, 'Quadra 2', 2);

    await client.query('delete from public.sessions where id = $1', [sessionId]);
    const { rows } = await client.query<{ count: string }>(
      'select count(*) from public.session_courts where session_id = $1',
      [sessionId],
    );
    assert.equal(rows[0].count, '0');
  });
}
