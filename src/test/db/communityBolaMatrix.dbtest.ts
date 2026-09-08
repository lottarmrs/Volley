import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client, Pool, PoolClient } from 'pg';
import {
  asIdentity,
  asIdentityCommitting,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

/**
 * XS-W2-07 — Community RLS / BOLA cutover matrix, against a real PostgreSQL.
 *
 * THE RULE: resource context derives from the target resource's own relationships. A
 * payload `community_id` cannot redirect authorization to a different Community.
 *
 * That is the whole BOLA/IDOR class (GINV-SEC-001, ADR-SEC-006): knowing a UUID must grant
 * nothing. Every privileged path is therefore exercised twice -- once against the actor's
 * OWN community, where the expected answer is known, and once against a FOREIGN community
 * whose id is perfectly valid. A test that only used invalid ids would prove nothing,
 * because "row not found" is not authorization.
 *
 * Seven actors x the W2 target paths. The suspended member matters especially: losing
 * access must actually remove capability, not merely hide a button.
 */

if (!isTestDatabaseConfigured()) {
  test(`BOLA matrix requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run \`npm run test:db\`.`);
  });
} else {
  let client: Client;
  let pool: Pool;

  // Two complete communities. Everything foreign is addressed by a VALID id.
  const world = {
    ownerA: '',
    adminA: '',
    memberA: '',
    organizerA: '',
    suspendedA: '',
    ownerB: '',
    memberB: '',
    communityA: '',
    communityB: '',
    playerA: '',
    playerB: '',
    requestA: '',
    requestB: '',
  };

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
    pool = createPool();

    const user = async (email: string) => {
      const { rows } = await client.query<{ id: string }>(
        'insert into auth.users (email) values ($1) returning id',
        [email],
      );
      await client.query(
        'insert into public.profiles (id, email) values ($1, $2) on conflict do nothing',
        [rows[0].id, email],
      );
      return rows[0].id;
    };

    world.ownerA = await user('bola-owner-a@test.local');
    world.adminA = await user('bola-admin-a@test.local');
    world.memberA = await user('bola-member-a@test.local');
    world.organizerA = await user('bola-organizer-a@test.local');
    world.suspendedA = await user('bola-suspended-a@test.local');
    world.ownerB = await user('bola-owner-b@test.local');
    world.memberB = await user('bola-member-b@test.local');

    const create = async (ownerId: string, name: string) => {
      const db = await pool.connect();
      try {
        const { rows } = await asIdentityCommitting(db, ownerId, () =>
          db.query<{ id: string }>('select public.create_community_with_owner($1) as id', [name]),
        );
        return rows[0].id;
      } finally {
        db.release();
      }
    };

    world.communityA = await create(world.ownerA, 'Community A');
    world.communityB = await create(world.ownerB, 'Community B');

    const seat = (community: string, userId: string, role: string, status = 'active') =>
      client.query(
        `insert into public.community_memberships (community_id, user_id, role, status)
         values ($1, $2, $3, $4)`,
        [community, userId, role, status],
      );

    await seat(world.communityA, world.adminA, 'admin');
    await seat(world.communityA, world.memberA, 'member');
    await seat(world.communityA, world.organizerA, 'member');
    await seat(world.communityA, world.suspendedA, 'member', 'suspended');
    await seat(world.communityB, world.memberB, 'member');

    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')`,
      [world.communityA, world.organizerA],
    );

    const player = async (name: string, ownerId: string, community: string) => {
      const { rows } = await client.query<{ id: string }>(
        'insert into public.players (name, owner_id) values ($1, $2) returning id',
        [name, ownerId],
      );
      await client.query(
        `insert into public.community_players (community_id, player_id, owner_id)
         values ($1, $2, $3)`,
        [community, rows[0].id, ownerId],
      );
      return rows[0].id;
    };
    world.playerA = await player('Atleta A', world.ownerA, world.communityA);
    world.playerB = await player('Atleta B', world.ownerB, world.communityB);

    const request = async (community: string, userId: string) => {
      const { rows } = await client.query<{ id: string }>(
        `insert into public.community_join_requests (community_id, user_id, status)
         values ($1, $2, 'pending') returning id`,
        [community, userId],
      );
      return rows[0].id;
    };
    world.requestA = await request(world.communityA, world.memberB);
    world.requestB = await request(world.communityB, world.memberA);
  });

  test.after(async () => {
    await pool?.end();
    await client?.end();
  });

  type Outcome = 'allowed' | 'denied';

  /** Runs a read as an identity and reports whether anything was visible. */
  async function read(userId: string | null, sql: string, params: unknown[]): Promise<Outcome> {
    const db = await pool.connect();
    try {
      const result = await asIdentity(db, userId, () => db.query(sql, params)).catch(
        (error: Error) => error,
      );
      if (result instanceof Error) return 'denied';
      return (result.rowCount ?? 0) > 0 ? 'allowed' : 'denied';
    } finally {
      db.release();
    }
  }

  /** Runs a privileged command as an identity and reports whether it succeeded. */
  async function command(userId: string | null, sql: string, params: unknown[]): Promise<Outcome> {
    const db = await pool.connect();
    try {
      const result = await asIdentityCommitting(db, userId, () => db.query(sql, params)).catch(
        (error: Error) => error,
      );
      return result instanceof Error ? 'denied' : 'allowed';
    } finally {
      db.release();
    }
  }

  const actor = () => ({
    anonymous: null as string | null,
    'member same Community': world.memberA,
    'member other Community': world.memberB,
    'Organizer same Community': world.organizerA,
    'Admin same Community': world.adminA,
    'Owner same Community': world.ownerA,
    'suspended member': world.suspendedA,
  });

  // ── Reads ────────────────────────────────────────────────────────────────
  test('MATRIX: Community read', async () => {
    const expected: Record<string, Outcome> = {
      anonymous: 'denied',
      'member same Community': 'allowed',
      'member other Community': 'denied',
      'Organizer same Community': 'allowed',
      'Admin same Community': 'allowed',
      'Owner same Community': 'allowed',
      // A suspended membership is not an active one; losing access must actually remove it.
      'suspended member': 'denied',
    };

    for (const [label, uid] of Object.entries(actor())) {
      const got = await read(uid, 'select 1 from public.communities where id = $1', [
        world.communityA,
      ]);
      assert.equal(got, expected[label], `Community read as ${label}`);
    }
  });

  test('MATRIX: Membership read', async () => {
    const expected: Record<string, Outcome> = {
      anonymous: 'denied',
      'member same Community': 'allowed',
      'member other Community': 'denied',
      'Organizer same Community': 'allowed',
      'Admin same Community': 'allowed',
      'Owner same Community': 'allowed',
      'suspended member': 'denied',
    };

    for (const [label, uid] of Object.entries(actor())) {
      // Reading OTHER people's memberships, not one's own row.
      const got = await read(
        uid,
        'select 1 from public.community_memberships where community_id = $1 and user_id <> $2',
        [world.communityA, uid ?? world.ownerA],
      );
      assert.equal(got, expected[label], `Membership read as ${label}`);
    }
  });

  test('MATRIX: CommunityPlayer access', async () => {
    const expected: Record<string, Outcome> = {
      anonymous: 'denied',
      'member same Community': 'allowed',
      'member other Community': 'denied',
      'Organizer same Community': 'allowed',
      'Admin same Community': 'allowed',
      'Owner same Community': 'allowed',
      'suspended member': 'denied',
    };

    for (const [label, uid] of Object.entries(actor())) {
      const got = await read(
        uid,
        'select 1 from public.community_players where community_id = $1',
        [world.communityA],
      );
      assert.equal(got, expected[label], `CommunityPlayer access as ${label}`);
    }
  });

  // ── Privileged commands ──────────────────────────────────────────────────
  test('MATRIX: settings writes', async () => {
    const expected: Record<string, Outcome> = {
      anonymous: 'denied',
      'member same Community': 'denied',
      'member other Community': 'denied',
      // Running sessions is a duty, not governance (GINV-CAP-001).
      'Organizer same Community': 'denied',
      'Admin same Community': 'allowed',
      'Owner same Community': 'allowed',
      'suspended member': 'denied',
    };

    for (const [label, uid] of Object.entries(actor())) {
      const got = await command(uid, 'select public.update_community_profile($1, $2, null, null)', [
        world.communityA,
        `renamed by ${label}`,
      ]);
      assert.equal(got, expected[label], `settings write as ${label}`);
    }
  });

  test('MATRIX: ownership transfer', async () => {
    const expected: Record<string, Outcome> = {
      anonymous: 'denied',
      'member same Community': 'denied',
      'member other Community': 'denied',
      'Organizer same Community': 'denied',
      // Not even an Admin: transfer is the Owner's alone.
      'Admin same Community': 'denied',
      'suspended member': 'denied',
    };

    for (const [label, uid] of Object.entries(actor())) {
      if (label === 'Owner same Community') continue; // asserted last, since it succeeds
      const got = await command(uid, 'select public.transfer_community_ownership_v2($1, $2)', [
        world.communityA,
        world.memberA,
      ]);
      assert.equal(got, expected[label], `ownership transfer as ${label}`);
    }
  });

  test('MATRIX: JoinRequest operations', async () => {
    // Approving a pending request for community A.
    const expected: Record<string, Outcome> = {
      anonymous: 'denied',
      'member same Community': 'denied',
      'member other Community': 'denied',
      'Organizer same Community': 'denied',
      'suspended member': 'denied',
    };

    for (const [label, uid] of Object.entries(actor())) {
      if (label === 'Admin same Community' || label === 'Owner same Community') continue;
      const got = await command(uid, 'select public.approve_community_join_request($1)', [
        world.requestA,
      ]);
      assert.equal(got, expected[label], `JoinRequest approve as ${label}`);
    }

    // And a privileged actor genuinely can, so the row above is not vacuous.
    const byAdmin = await command(
      world.adminA,
      'select public.approve_community_join_request($1)',
      [world.requestA],
    );
    assert.equal(byAdmin, 'allowed', 'an Admin of the same community may approve');
  });

  test('MATRIX: Organizer assignment', async () => {
    // No write policy exists on community_responsibilities yet: assignment is an operator
    // action until a command lands. Every browser actor must therefore be refused, INCLUDING
    // the Owner -- so the absence is deliberate rather than an oversight nobody noticed.
    for (const [label, uid] of Object.entries(actor())) {
      const got = await command(
        uid,
        `insert into public.community_responsibilities (community_id, user_id, responsibility)
         values ($1, $2, 'ORGANIZER')`,
        [world.communityA, world.memberA],
      );
      assert.equal(got, 'denied', `Organizer assignment as ${label} must be refused`);
    }
  });

  // ── EXIT GATE: cross-Community UUID guessing ─────────────────────────────
  test('EXIT GATE: a payload community_id cannot redirect authorization', async () => {
    // The Owner of A is genuinely privileged -- in A. Passing B's VALID id must grant
    // nothing there. This is the precise shape of the BOLA class.
    const foreignPaths: Array<[string, string, unknown[]]> = [
      [
        'settings write',
        'select public.update_community_profile($1, $2, null, null)',
        [world.communityB, 'hijacked'],
      ],
      ['archive', 'select public.archive_community($1)', [world.communityB]],
      [
        'ownership transfer',
        'select public.transfer_community_ownership_v2($1, $2)',
        [world.communityB, world.memberB],
      ],
      [
        'approve foreign join request',
        'select public.approve_community_join_request($1)',
        [world.requestB],
      ],
      [
        'reject foreign join request',
        'select public.reject_community_join_request($1, null)',
        [world.requestB],
      ],
    ];

    for (const [label, sql, params] of foreignPaths) {
      for (const privileged of [world.ownerA, world.adminA]) {
        const got = await command(privileged, sql, params);
        assert.equal(got, 'denied', `${label} against a FOREIGN community must be denied`);
      }
    }

    // Nothing moved in B.
    const { rows } = await client.query<{ name: string; owner_id: string; archived: boolean }>(
      'select name, owner_id, archived from public.communities where id = $1',
      [world.communityB],
    );
    assert.equal(rows[0].name, 'Community B');
    assert.equal(rows[0].owner_id, world.ownerB);
    assert.equal(rows[0].archived, false);

    const request = await client.query<{ status: string }>(
      'select status from public.community_join_requests where id = $1',
      [world.requestB],
    );
    assert.equal(request.rows[0].status, 'pending', 'the foreign request was not decided');
  });

  test('EXIT GATE: reading a foreign Community by valid id returns nothing', async () => {
    // Not an error -- an empty result. RLS hides the row rather than confirming it exists,
    // which is what stops UUID enumeration being an oracle.
    for (const [label, uid] of Object.entries(actor())) {
      const got = await read(uid, 'select 1 from public.communities where id = $1', [
        world.communityB,
      ]);
      if (label === 'member other Community') {
        assert.equal(got, 'allowed', 'a member of B may of course read B');
        continue;
      }
      assert.equal(got, 'denied', `${label} must not read a foreign community`);
    }
  });

  test('EXIT GATE: a capability check is scoped to the community it names', async () => {
    // The resolver must answer per-community, not "is this person privileged anywhere".
    const db = await pool.connect();
    try {
      const own = await asIdentity(db, world.adminA, () =>
        db.query<{ ok: boolean }>(
          'select public.current_user_has_community_capability($1, $2) as ok',
          [world.communityA, 'community.members.manage'],
        ),
      );
      const foreign = await asIdentity(db, world.adminA, () =>
        db.query<{ ok: boolean }>(
          'select public.current_user_has_community_capability($1, $2) as ok',
          [world.communityB, 'community.members.manage'],
        ),
      );

      assert.equal(own.rows[0].ok, true);
      assert.equal(foreign.rows[0].ok, false, 'privilege must not leak across communities');
    } finally {
      db.release();
    }
  });

  test('EXIT GATE: a suspended member retains no capability at all', async () => {
    // community_capabilities deixou de ser executavel pelo papel `authenticated` na
    // remediacao de 2026-09-08 (achado A7): o parametro target_user_id e livre, entao o
    // grant permitia sondar o grafo de papeis de qualquer usuario. A funcao segue sendo a
    // fonte da verdade, agora alcancada so por current_user_has_community_capability e por
    // quem administra o banco -- por isso a consulta crua abaixo roda como dona.
    // A afirmacao em si nao muda: suspensao remove capability, nao apenas esconde a UI.
    const db = await pool.connect();
    try {
      const { rows } = await db.query('select public.community_capabilities($1, $2)', [
        world.communityA,
        world.suspendedA,
      ]);
      assert.equal(rows.length, 0, 'suspension must remove capability, not just hide UI');

      const viaWrapper = await asIdentity(db, world.suspendedA, () =>
        db.query<{ ok: boolean }>(
          'select public.current_user_has_community_capability($1, $2) as ok',
          [world.communityA, 'community.members.manage'],
        ),
      );
      assert.equal(
        viaWrapper.rows[0].ok,
        false,
        'e o mesmo resultado pela superficie que o cliente realmente enxerga',
      );
    } finally {
      db.release();
    }
  });

  test('the Owner CAN transfer, so the denial matrix is not vacuous', async () => {
    // Asserted last: it mutates ownership of A, and every other row above depends on the
    // original arrangement.
    const got = await command(
      world.ownerA,
      'select public.transfer_community_ownership_v2($1, $2)',
      [world.communityA, world.adminA],
    );
    assert.equal(got, 'allowed');

    const { rows } = await client.query<{ user_id: string }>(
      `select user_id from public.community_memberships
        where community_id = $1 and role = 'owner' and status = 'active'`,
      [world.communityA],
    );
    assert.deepEqual(
      rows.map((r) => r.user_id),
      [world.adminA],
    );
  });
}
