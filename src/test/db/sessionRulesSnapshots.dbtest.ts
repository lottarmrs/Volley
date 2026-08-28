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
  test(`session rules snapshots require ${TEST_DATABASE_URL_VAR}`, () => {
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

  function assertSqlState(error: unknown, expectedCode: string): asserts error is Error {
    assert.ok(error instanceof Error);
    assert.equal((error as { code?: string }).code, expectedCode);
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
    input: {
      communityId?: string | null;
      context?: 'QUICK' | 'COMMUNITY';
      playMode?: 'FREE_PLAY' | 'STRUCTURED_MATCHES';
      name?: string;
    } = {},
  ): Promise<string> {
    const { rows } = await call<{ id: string }>(
      actorId,
      `select public.create_target_session(
         gen_random_uuid(), $1, $2, $3, $4, null, null
       ) as id`,
      [
        input.communityId ?? null,
        input.context ?? 'QUICK',
        input.playMode ?? 'FREE_PLAY',
        input.name ?? 'Target Session',
      ],
    );
    return rows[0].id;
  }

  async function freeze(
    actorId: string | null,
    input: {
      snapshotId?: string | null;
      sessionId: string;
      expectedRevision?: number | null;
      schemaVersion?: number | null;
      sourceKind?: string | null;
      rulesPayload?: unknown;
    },
  ) {
    return call(
      actorId,
      `select * from public.freeze_target_session_rules_snapshot(
         $1, $2, $3, $4, $5, $6::jsonb
       )`,
      [
        input.snapshotId === undefined ? randomUUID() : input.snapshotId,
        input.sessionId,
        input.expectedRevision === undefined ? 1 : input.expectedRevision,
        input.schemaVersion === undefined ? 1 : input.schemaVersion,
        input.sourceKind === undefined ? 'SESSION_EXPLICIT' : input.sourceKind,
        input.rulesPayload === undefined
          ? JSON.stringify({ scoring: { point_target: 15 } })
          : input.rulesPayload === null
            ? null
            : JSON.stringify(input.rulesPayload),
      ],
    );
  }

  async function addCommunityDefaults(
    communityId: string,
    ownerId: string,
    rules: unknown,
    updatedAt = '2030-01-01T12:00:00Z',
  ): Promise<{ id: string; updated_at: string; fingerprint: string }> {
    const { rows } = await client.query<{ id: string; updated_at: string; fingerprint: string }>(
      `insert into public.community_rules (owner_id, community_id, free_play_rules, updated_at)
       values ($1, $2, $3::jsonb, $4::timestamptz)
       returning id, updated_at::text, pg_catalog.md5(free_play_rules::text) as fingerprint`,
      [ownerId, communityId, JSON.stringify(rules), updatedAt],
    );
    return rows[0];
  }

  test('session_rules_snapshots Session FK retains a complete leading-column btree index', async () => {
    const { rows } = await client.query<{ constraint_name: string; fk_column: string }>(
      `select con.conname as constraint_name, att.attname as fk_column
         from pg_constraint con
         cross join lateral unnest(con.conkey) as fk(attnum)
         join pg_attribute att
           on att.attrelid = con.conrelid
          and att.attnum = fk.attnum
        where con.contype = 'f'
          and con.conrelid = 'public.session_rules_snapshots'::regclass
          and not exists (
            select 1
              from pg_index i
             where i.indrelid = con.conrelid
               and i.indisvalid
               and i.indisready
               and i.indpred is null
               and (select relam from pg_class where oid = i.indexrelid)
                   = (select oid from pg_am where amname = 'btree')
               and i.indkey[0] = fk.attnum
          )
        order by att.attname`,
    );
    assert.deepEqual(rows, []);
  });

  test('an assigned Organizer freezes an explicit immutable rules snapshot and advances Session revision', async () => {
    const organizer = await newUser('snapshot-explicit@test.local');
    const sessionId = await createTargetSession(organizer);
    const snapshotId = randomUUID();
    const rules = { scoring: { point_target: 15, win_by_two: true } };

    const result = await freeze(organizer, {
      snapshotId,
      sessionId,
      rulesPayload: rules,
    });
    assert.deepEqual(result.rows, [{ snapshot_id: snapshotId, session_revision: 2 }]);

    const persisted = await client.query<{
      id: string;
      session_id: string;
      rules_scope: string;
      rules_schema_version: number;
      rules_payload: unknown;
      source_kind: string;
      source_community_rules_id: string | null;
      source_default_updated_at: string | null;
      source_default_fingerprint: string | null;
      captured_at: string | null;
    }>(
      `select id, session_id, rules_scope, rules_schema_version, rules_payload, source_kind,
              source_community_rules_id, source_default_updated_at, source_default_fingerprint,
              captured_at::text as captured_at
         from public.session_rules_snapshots where id = $1`,
      [snapshotId],
    );
    assert.deepEqual(
      persisted.rows.map(({ captured_at: _capturedAt, ...snapshot }) => snapshot),
      [
        {
          id: snapshotId,
          session_id: sessionId,
          rules_scope: 'SESSION_MATCH_EXECUTION',
          rules_schema_version: 1,
          rules_payload: rules,
          source_kind: 'SESSION_EXPLICIT',
          source_community_rules_id: null,
          source_default_updated_at: null,
          source_default_fingerprint: null,
        },
      ],
    );
    assert.ok(persisted.rows[0].captured_at);
  });

  test('each Session has one snapshot and different Sessions retain different final snapshot identities', async () => {
    const organizer = await newUser('snapshot-identity@test.local');
    const firstSessionId = await createTargetSession(organizer, { name: 'First snapshot Session' });
    const secondSessionId = await createTargetSession(organizer, {
      name: 'Second snapshot Session',
    });
    const firstSnapshotId = randomUUID();
    const secondSnapshotId = randomUUID();

    await freeze(organizer, { snapshotId: firstSnapshotId, sessionId: firstSessionId });
    await freeze(organizer, { snapshotId: secondSnapshotId, sessionId: secondSessionId });
    const duplicate = await freeze(organizer, {
      snapshotId: randomUUID(),
      sessionId: firstSessionId,
      expectedRevision: 2,
    }).catch((error: Error) => error);

    assertSqlState(duplicate, '23505');
    const { rows } = await client.query<{ session_id: string; id: string }>(
      `select session_id, id from public.session_rules_snapshots
       where session_id in ($1, $2) order by session_id`,
      [firstSessionId, secondSessionId],
    );
    assert.equal(rows.length, 2);
    assert.notEqual(firstSnapshotId, secondSnapshotId);
    assert.deepEqual(
      new Set(rows.map((row) => row.id)),
      new Set([firstSnapshotId, secondSnapshotId]),
    );
  });

  test('freeze rejects stale revision, a null final UUID, invalid schema, non-object payload, and invalid source kind', async () => {
    const organizer = await newUser('snapshot-validation@test.local');
    const sessionId = await createTargetSession(organizer);
    await freeze(organizer, { sessionId });

    const invalidCommands: Array<[string, Parameters<typeof freeze>[1]]> = [
      ['stale revision', { sessionId, expectedRevision: 1 }],
      ['null final UUID', { sessionId, snapshotId: null, expectedRevision: 2 }],
      ['unsupported schema version', { sessionId, schemaVersion: 2, expectedRevision: 2 }],
      ['null JSONB', { sessionId, rulesPayload: null, expectedRevision: 2 }],
      ['array JSONB', { sessionId, rulesPayload: [], expectedRevision: 2 }],
      ['invalid source kind', { sessionId, sourceKind: 'COMPETITION_RULES', expectedRevision: 2 }],
    ];
    const expectedSqlStates = new Map([
      ['stale revision', '40001'],
      ['null final UUID', '23514'],
      ['unsupported schema version', '23514'],
      ['null JSONB', '23514'],
      ['array JSONB', '23514'],
      ['invalid source kind', '23514'],
    ]);

    for (const [name, command] of invalidCommands) {
      const rejected = await freeze(organizer, command).catch((error: Error) => error);
      assertSqlState(rejected, expectedSqlStates.get(name)!);
    }
  });

  test('freeze rejects anonymous, eligible-but-unassigned, terminal, and legacy callers with contract SQLSTATEs', async () => {
    const owner = await newUser('snapshot-authority-owner@test.local');
    const assignedOrganizer = await newUser('snapshot-authority-assigned@test.local');
    const unassignedOrganizer = await newUser('snapshot-authority-unassigned@test.local');
    const community = await targetCommunity(owner, 'Snapshot authority boundary');
    await activeMembership(community, assignedOrganizer);
    await activeMembership(community, unassignedOrganizer);
    await grantOrganizer(community, assignedOrganizer);
    await grantOrganizer(community, unassignedOrganizer);
    const sessionId = await createTargetSession(assignedOrganizer, {
      communityId: community,
      context: 'COMMUNITY',
    });
    const legacy = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, name, date, status, type)
       values ($1, 'Legacy snapshot Session', '2030-01-01', 'draft', 'free_play') returning id`,
      [owner],
    );

    const anonymous = await freeze(null, { sessionId }).catch((error: Error) => error);
    const unassigned = await freeze(unassignedOrganizer, { sessionId }).catch(
      (error: Error) => error,
    );
    await client.query(
      `update public.sessions set lifecycle_status = 'CANCELLED', status = 'cancelled'
       where id = $1`,
      [sessionId],
    );
    const terminal = await freeze(assignedOrganizer, { sessionId }).catch((error: Error) => error);
    const legacyRejected = await freeze(assignedOrganizer, {
      sessionId: legacy.rows[0].id,
    }).catch((error: Error) => error);

    assertSqlState(anonymous, '42501');
    assertSqlState(unassigned, '42501');
    assertSqlState(terminal, '23514');
    assertSqlState(legacyRejected, 'P0002');
  });

  test('authenticated direct mutation is denied and privileged mutation cannot alter or delete a snapshot', async () => {
    const organizer = await newUser('snapshot-immutability@test.local');
    const sessionId = await createTargetSession(organizer);
    const snapshotId = randomUUID();
    await freeze(organizer, { snapshotId, sessionId });

    const directInsert = await callFailing(
      organizer,
      `insert into public.session_rules_snapshots (
         id, session_id, rules_scope, rules_schema_version, rules_payload, source_kind
       ) values ($1, $2, 'SESSION_MATCH_EXECUTION', 1, '{}'::jsonb, 'SESSION_EXPLICIT')`,
      [randomUUID(), randomUUID()],
    );
    const directUpdate = await callFailing(
      organizer,
      `update public.session_rules_snapshots set rules_payload = '{"tampered":true}'::jsonb
       where id = $1`,
      [snapshotId],
    );
    const directDelete = await callFailing(
      organizer,
      'delete from public.session_rules_snapshots where id = $1',
      [snapshotId],
    );
    for (const rejected of [directInsert, directUpdate, directDelete]) {
      assert.ok(rejected instanceof Error);
      assert.match((rejected as Error).message, /permission denied|row-level security/i);
    }

    const privilegedUpdate = await client
      .query(
        `update public.session_rules_snapshots set rules_payload = '{"tampered":true}'::jsonb
         where id = $1`,
        [snapshotId],
      )
      .catch((error: Error) => error);
    const privilegedDelete = await client
      .query('delete from public.session_rules_snapshots where id = $1', [snapshotId])
      .catch((error: Error) => error);
    assertSqlState(privilegedUpdate, '55000');
    assertSqlState(privilegedDelete, '55000');
  });

  test('COMMUNITY_DEFAULTS copies FREE_PLAY defaults with server-derived provenance', async () => {
    const owner = await newUser('snapshot-default-owner@test.local');
    const organizer = await newUser('snapshot-default-organizer@test.local');
    const community = await targetCommunity(owner, 'Snapshot defaults');
    await activeMembership(community, organizer);
    await grantOrganizer(community, organizer);
    const defaults = { scoring: { point_target: 21, win_by_two: false } };
    const source = await addCommunityDefaults(community, owner, defaults);
    const sessionId = await createTargetSession(organizer, {
      communityId: community,
      context: 'COMMUNITY',
    });
    const snapshotId = randomUUID();

    const result = await freeze(organizer, {
      snapshotId,
      sessionId,
      sourceKind: 'COMMUNITY_DEFAULTS',
      rulesPayload: null,
    });
    assert.deepEqual(result.rows, [{ snapshot_id: snapshotId, session_revision: 2 }]);
    const { rows } = await client.query<{
      rules_scope: string;
      rules_schema_version: number;
      rules_payload: unknown;
      source_kind: string;
      source_community_rules_id: string;
      source_default_updated_at: string;
      source_default_fingerprint: string;
    }>(
      `select rules_scope, rules_schema_version, rules_payload, source_kind,
              source_community_rules_id, source_default_updated_at::text,
              source_default_fingerprint
         from public.session_rules_snapshots where id = $1`,
      [snapshotId],
    );
    assert.deepEqual(rows, [
      {
        rules_scope: 'SESSION_MATCH_EXECUTION',
        rules_schema_version: 1,
        rules_payload: defaults,
        source_kind: 'COMMUNITY_DEFAULTS',
        source_community_rules_id: source.id,
        source_default_updated_at: source.updated_at,
        source_default_fingerprint: source.fingerprint,
      },
    ]);
  });

  test('a later Community default change never rewrites captured payload or provenance', async () => {
    const owner = await newUser('snapshot-frozen-default-owner@test.local');
    const organizer = await newUser('snapshot-frozen-default-organizer@test.local');
    const community = await targetCommunity(owner, 'Frozen snapshot defaults');
    await activeMembership(community, organizer);
    await grantOrganizer(community, organizer);
    const original = { scoring: { point_target: 15, win_by_two: true } };
    const source = await addCommunityDefaults(community, owner, original);
    const sessionId = await createTargetSession(organizer, {
      communityId: community,
      context: 'COMMUNITY',
    });
    const snapshotId = randomUUID();
    await freeze(organizer, {
      snapshotId,
      sessionId,
      sourceKind: 'COMMUNITY_DEFAULTS',
      rulesPayload: null,
    });
    await client.query(
      `update public.community_rules
          set free_play_rules = $2::jsonb, updated_at = '2031-01-01T12:00:00Z'
        where community_id = $1`,
      [community, JSON.stringify({ scoring: { point_target: 99, win_by_two: false } })],
    );

    const { rows } = await client.query<{
      rules_payload: unknown;
      source_community_rules_id: string;
      source_default_updated_at: string;
      source_default_fingerprint: string;
    }>(
      `select rules_payload, source_community_rules_id, source_default_updated_at::text,
              source_default_fingerprint
         from public.session_rules_snapshots where id = $1`,
      [snapshotId],
    );
    assert.deepEqual(rows, [
      {
        rules_payload: original,
        source_community_rules_id: source.id,
        source_default_updated_at: source.updated_at,
        source_default_fingerprint: source.fingerprint,
      },
    ]);
  });

  test('COMMUNITY_DEFAULTS rejects Quick, missing defaults, caller payload, and STRUCTURED_MATCHES', async () => {
    const owner = await newUser('snapshot-default-rejections-owner@test.local');
    const organizer = await newUser('snapshot-default-rejections-organizer@test.local');
    const missingDefaultsCommunity = await targetCommunity(owner, 'No snapshot defaults');
    const defaultsCommunity = await targetCommunity(owner, 'Structured snapshot defaults');
    await activeMembership(missingDefaultsCommunity, organizer);
    await activeMembership(defaultsCommunity, organizer);
    await grantOrganizer(missingDefaultsCommunity, organizer);
    await grantOrganizer(defaultsCommunity, organizer);
    await addCommunityDefaults(defaultsCommunity, owner, { scoring: { point_target: 15 } });
    const quickSessionId = await createTargetSession(organizer);
    const noDefaultsSessionId = await createTargetSession(organizer, {
      communityId: missingDefaultsCommunity,
      context: 'COMMUNITY',
    });
    const payloadSessionId = await createTargetSession(organizer, {
      communityId: defaultsCommunity,
      context: 'COMMUNITY',
    });
    const structuredSessionId = await createTargetSession(organizer, {
      communityId: defaultsCommunity,
      context: 'COMMUNITY',
      playMode: 'STRUCTURED_MATCHES',
    });

    for (const command of [
      { sessionId: quickSessionId, sourceKind: 'COMMUNITY_DEFAULTS', rulesPayload: null },
      { sessionId: noDefaultsSessionId, sourceKind: 'COMMUNITY_DEFAULTS', rulesPayload: null },
      {
        sessionId: payloadSessionId,
        sourceKind: 'COMMUNITY_DEFAULTS',
        rulesPayload: { forged: true },
      },
      { sessionId: structuredSessionId, sourceKind: 'COMMUNITY_DEFAULTS', rulesPayload: null },
    ]) {
      const rejected = await freeze(organizer, command).catch((error: Error) => error);
      assertSqlState(rejected, '23514');
    }
  });

  test('SESSION_EXPLICIT rejects COMPETITION_RULES, keeping Competition outside source ownership', async () => {
    const organizer = await newUser('snapshot-competition-boundary@test.local');
    const sessionId = await createTargetSession(organizer);
    const rejected = await freeze(organizer, {
      sessionId,
      sourceKind: 'COMPETITION_RULES',
    }).catch((error: Error) => error);

    assertSqlState(rejected, '23514');
  });

  test('active Community members and assigned Quick Organizers can read snapshots', async () => {
    const owner = await newUser('snapshot-read-owner@test.local');
    const communityOrganizer = await newUser('snapshot-read-community-organizer@test.local');
    const member = await newUser('snapshot-read-member@test.local');
    const quickOrganizer = await newUser('snapshot-read-quick-organizer@test.local');
    const community = await targetCommunity(owner, 'Snapshot readers');
    await activeMembership(community, communityOrganizer);
    await activeMembership(community, member);
    await grantOrganizer(community, communityOrganizer);
    const communitySessionId = await createTargetSession(communityOrganizer, {
      communityId: community,
      context: 'COMMUNITY',
    });
    const quickSessionId = await createTargetSession(quickOrganizer);
    await freeze(communityOrganizer, { sessionId: communitySessionId });
    await freeze(quickOrganizer, { sessionId: quickSessionId });

    const memberRead = await call<{ session_id: string }>(
      member,
      'select session_id from public.session_rules_snapshots where session_id = $1',
      [communitySessionId],
    );
    const quickRead = await call<{ session_id: string }>(
      quickOrganizer,
      'select session_id from public.session_rules_snapshots where session_id = $1',
      [quickSessionId],
    );
    assert.deepEqual(memberRead.rows, [{ session_id: communitySessionId }]);
    assert.deepEqual(quickRead.rows, [{ session_id: quickSessionId }]);
  });

  test('outsiders, suspended Community members, revoked Quick assignments, and anonymous callers cannot read snapshots', async () => {
    const owner = await newUser('snapshot-read-deny-owner@test.local');
    const organizer = await newUser('snapshot-read-deny-organizer@test.local');
    const member = await newUser('snapshot-read-deny-member@test.local');
    const outsider = await newUser('snapshot-read-deny-outsider@test.local');
    const quickOrganizer = await newUser('snapshot-read-deny-quick-organizer@test.local');
    const community = await targetCommunity(owner, 'Snapshot reader revocations');
    await activeMembership(community, organizer);
    await activeMembership(community, member);
    await grantOrganizer(community, organizer);
    const communitySessionId = await createTargetSession(organizer, {
      communityId: community,
      context: 'COMMUNITY',
    });
    const quickSessionId = await createTargetSession(quickOrganizer);
    await freeze(organizer, { sessionId: communitySessionId });
    await freeze(quickOrganizer, { sessionId: quickSessionId });
    await client.query(
      "update public.community_memberships set status = 'suspended' where community_id = $1 and user_id = $2",
      [community, member],
    );
    await client.query(
      'update public.session_organizer_assignments set revoked_at = now() where session_id = $1',
      [quickSessionId],
    );

    for (const [actor, sessionId] of [
      [outsider, communitySessionId],
      [member, communitySessionId],
      [quickOrganizer, quickSessionId],
    ] as const) {
      const read = await call(
        actor,
        'select * from public.session_rules_snapshots where session_id = $1',
        [sessionId],
      );
      assert.deepEqual(read.rows, []);
    }
    const anonymous = await callFailing(
      null,
      'select * from public.session_rules_snapshots where session_id = $1',
      [communitySessionId],
    );
    assertSqlState(anonymous, '42501');
  });

  test('Session, Courts, and Rules Snapshot reads use the same generic visibility result', async () => {
    const owner = await newUser('snapshot-shared-visibility-owner@test.local');
    const organizer = await newUser('snapshot-shared-visibility-organizer@test.local');
    const member = await newUser('snapshot-shared-visibility-member@test.local');
    const outsider = await newUser('snapshot-shared-visibility-outsider@test.local');
    const community = await targetCommunity(owner, 'Shared target Session visibility');
    await activeMembership(community, organizer);
    await activeMembership(community, member);
    await grantOrganizer(community, organizer);
    const sessionId = await createTargetSession(organizer, {
      communityId: community,
      context: 'COMMUNITY',
    });
    await freeze(organizer, { sessionId });

    for (const [actor, expected] of [
      [member, true],
      [outsider, false],
    ] as const) {
      const resolver = await call<{ allowed: boolean }>(
        actor,
        'select app_private.current_user_can_read_target_session($1) as allowed',
        [sessionId],
      );
      assert.deepEqual(resolver.rows, [{ allowed: expected }]);
      const courts = await call(
        actor,
        'select * from public.session_courts where session_id = $1',
        [sessionId],
      );
      const snapshots = await call(
        actor,
        'select * from public.session_rules_snapshots where session_id = $1',
        [sessionId],
      );
      assert.equal(courts.rows.length > 0, expected);
      assert.equal(snapshots.rows.length > 0, expected);
      const session = await callFailing(actor, 'select * from public.read_target_session($1)', [
        sessionId,
      ]);
      assert.equal(!(session instanceof Error), expected);
    }
  });
}
