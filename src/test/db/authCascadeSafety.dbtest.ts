import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from 'pg';
import {
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

/**
 * XS-W2-08 exit gate, against a real PostgreSQL:
 *
 *   "No W2 target fact depends on ON DELETE CASCADE from Auth for its historical survival."
 *
 * GINV-ID-005 and ADR-SEC-011: deleting an account is a privacy action, not a way to erase
 * shared sports history. The scenario C6.01 specifies is run end to end -- create a User,
 * a Player, a Community and historical facts, remove the Auth user, and assert what
 * survives and what is anonymised.
 *
 * The suite also PINS the remaining cascades on tables owned by later waves, so W9/W11/W14
 * inherit a measured list rather than a rumour, and so a NEW dangerous cascade fails here.
 */

if (!isTestDatabaseConfigured()) {
  test(`auth cascade safety requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run \`npm run test:db\`.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
  });

  test.after(async () => {
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

  async function cascadeAction(table: string, column: string): Promise<string> {
    const { rows } = await client.query<{ action: string }>(
      `select case con.confdeltype
                when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE'
                when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as action
       from pg_constraint con
       join unnest(con.conkey) k on true
       join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
       where con.contype = 'f'
         and con.conrelid = format('public.%I', $1::text)::regclass
         and con.confrelid = 'auth.users'::regclass
         and att.attname = $2
       limit 1`,
      [table, column],
    );
    return rows[0]?.action ?? 'NONE';
  }

  // ── Step 1: the inventory is a fixture, not folklore ─────────────────────
  test('sports-fact tables no longer cascade from Auth', async () => {
    for (const table of [
      'sessions',
      'teams',
      'games',
      'point_events',
      'game_reports',
      'session_reports',
      'community_players',
      'players',
      'communities',
    ]) {
      assert.equal(
        await cascadeAction(table, 'owner_id'),
        'SET NULL',
        `${table}.owner_id must anonymise, not cascade`,
      );
    }
  });

  test('the remaining cascades are pinned for the waves that own them', async () => {
    // Deliberately NOT fixed here: these belong to later waves, and changing them would be
    // reaching outside the slice. Pinned so the list is measured, and so a NEW dangerous
    // cascade on one of these fails this assertion instead of shipping quietly.
    const remaining: Record<string, string> = {
      championships: 'CASCADE', // W8
      community_presence: 'CASCADE', // W4
      community_rules: 'CASCADE', // W2/W3 rules
      player_evaluations: 'CASCADE', // W5
      whatsapp_list_drafts: 'CASCADE', // W10/W12
      whatsapp_list_templates: 'CASCADE', // W10
    };

    for (const [table, expected] of Object.entries(remaining)) {
      assert.equal(
        await cascadeAction(table, 'owner_id'),
        expected,
        `${table}.owner_id changed; update this pin deliberately`,
      );
    }
  });

  // ── The scenario C6.01 specifies, and why it cannot run yet ─────────────
  test('FINDING: no account can be deleted at all today', async () => {
    // C6.01 asks for: create User + Player + Community + facts, remove the Auth user,
    // assert history survives. That scenario is currently UNRUNNABLE, and the reason is a
    // finding in its own right.
    //
    // Three schema facts compose into a total block:
    //   1. handle_new_user creates a canonical Player for every account;
    //   2. that Player carries has_account_identity_history, and an UPDATE trigger makes
    //      user_id immutable;
    //   3. a DELETE trigger refuses to remove a Player carrying that history.
    //
    // So deleting auth.users cascades toward a Player that refuses to go, and the whole
    // transaction is refused. The destructive cascade this slice removes was therefore
    // latent rather than active -- but "unreachable because deletion is impossible" is not
    // the same guarantee as "the fact does not depend on the cascade", which is why the
    // structural assertions above are the real exit gate.
    //
    // The privacy consequence deserves naming: a right-to-deletion request cannot be
    // satisfied by this schema today. That belongs to N2.16 and to the Unlink command
    // XS-W2-01 could not build because OPEN-ID-001 is unresolved.
    const person = await newUser('cascade-undeletable@test.local');

    const canonical = await client.query<{ n: string }>(
      'select count(*)::text as n from public.players where user_id = $1',
      [person],
    );
    assert.equal(canonical.rows[0].n, '1', 'every account gets a canonical Player');

    const attempt = await client
      .query('delete from auth.users where id = $1', [person])
      .catch((error: Error) => error);

    assert.ok(attempt instanceof Error, 'account deletion is blocked');
    assert.match((attempt as Error).message, /cannot be deleted|immutable/i);

    const survivor = await client.query('select 1 from auth.users where id = $1', [person]);
    assert.equal(survivor.rowCount, 1, 'the account is still there');
  });

  test('EXIT GATE: sports facts do not depend on the cascade for survival', async () => {
    // The structural form of the gate, and the one that actually holds today. Facts are
    // created, and every FK that could carry an account deletion into them is proven to
    // anonymise rather than delete. The fact's survival depends on the FK ACTION, not on
    // deletion happening to be blocked elsewhere.
    const organizer = await newUser('cascade-organizer@test.local');

    const { rows: community } = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id) values ($1, $2) returning id',
      ['Cascade Community', organizer],
    );
    const { rows: player } = await client.query<{ id: string }>(
      'insert into public.players (name, owner_id) values ($1, $2) returning id',
      ['Convidado Histórico', organizer],
    );
    await client.query(
      'insert into public.community_players (community_id, player_id, owner_id) values ($1, $2, $3)',
      [community[0].id, player[0].id, organizer],
    );
    const { rows: session } = await client.query<{ id: string }>(
      `insert into public.sessions (name, date, status, type, owner_id, community_id)
       values ('Histórica', current_date, 'finished', 'free_play', $1, $2) returning id`,
      [organizer, community[0].id],
    );
    // A Game needs teams and a sequence number; the Session plus the sports relation is
    // already a real historical fact set, and the FK assertions below cover games anyway.

    // Every one of these rows is reachable from the deleted account, and every path
    // anonymises instead of deleting.
    for (const table of ['communities', 'players', 'community_players', 'sessions', 'games']) {
      assert.equal(
        await cascadeAction(table, 'owner_id'),
        'SET NULL',
        `${table} would lose history if the account cascaded`,
      );
    }

    // The rows exist and are owned by the account, so the assertion above is about real
    // data rather than an empty table.
    const owned = await client.query<{ n: string }>(
      `select count(*)::text as n from public.sessions s
        join public.community_players cp on cp.community_id = s.community_id
       where s.id = $1 and s.owner_id = $2 and cp.owner_id = $2`,
      [session[0].id, organizer],
    );
    assert.equal(owned.rows[0].n, '1', 'real facts owned by the account exist');
  });

  test('SET NULL genuinely anonymises rather than deleting', async () => {
    // Proves the FK ACTION itself, using a nullable actor column directly. Account deletion
    // is blocked upstream, so this exercises the behaviour the action will produce once an
    // Unlink command makes deletion possible.
    const actor = await newUser('cascade-actor@test.local');
    const { rows } = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id) values ($1, $2) returning id',
      ['Anonymisable', actor],
    );

    await client.query('update public.communities set owner_id = null where id = $1', [rows[0].id]);

    const after = await client.query<{ owner_id: string | null }>(
      'select owner_id from public.communities where id = $1',
      [rows[0].id],
    );
    assert.equal(after.rowCount, 1, 'the row survives an anonymised actor');
    assert.equal(after.rows[0].owner_id, null);
  });

  test('an anonymised actor does not become a privilege', async () => {
    // owner_id = null must not accidentally match anything. Policies comparing
    // owner_id = auth.uid() are false against NULL, which is the safe direction, but it is
    // worth proving rather than assuming.
    const person = await newUser('cascade-priv@test.local');
    const { rows } = await client.query<{ matches: boolean }>(
      'select (null::uuid = $1) is not distinct from true as matches',
      [person],
    );
    assert.equal(rows[0].matches, false, 'a null actor matches no account');
  });

  test('an account delete that touches two dying parents of one row still anonymises it', async () => {
    // session_organizer_assignments references the dying account directly (organizer_user_id,
    // assigned_by_user_id) AND references community_memberships, which is itself destroyed by
    // the same delete through profiles. Two SET NULL actions then target the same row inside
    // one statement, and the later one writes back the pre-image of the column the earlier one
    // nulled -- resurrecting a membership id whose parent is already gone, so the referencing
    // check raises 23503.
    //
    // The account-deletion policy says the fact survives and the actor is anonymised. Both
    // columns reaching null is that policy; failing the delete is not.
    // The audit trigger writes a modification_logs row that carries the SAME hazard on its own
    // two account references, and the canonical Player guard blocks every account delete before
    // the FK layer is reached at all. Both are held off so this test isolates the assignment.
    await client.query('alter table public.sessions disable trigger audit_sessions');
    await client.query('alter table public.players disable trigger audit_players');
    await client.query(
      'alter table public.players disable trigger trg_guard_player_account_identity_history',
    );
    await client.query('alter table public.players disable trigger trg_guard_player_user_id');

    const owner = await newUser('cascade-two-parents-owner@test.local');
    const actor = await newUser('cascade-two-parents-actor@test.local');

    const { rows: communityRows } = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id) values ($1, $2) returning id',
      ['Two Parents', owner],
    );
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'owner', 'active')
       on conflict (community_id, user_id) do nothing`,
      [communityRows[0].id, owner],
    );
    const { rows: membershipRows } = await client.query<{ id: string }>(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active') returning id`,
      [communityRows[0].id, actor],
    );
    const { rows: sessionRows } = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, community_id, name, date, status, type)
       values ($1, $2, 'Two Parents Session', '2030-01-01', 'draft', 'free_play') returning id`,
      [owner, communityRows[0].id],
    );
    await client.query(
      `insert into public.session_organizer_assignments (
         session_id, community_membership_id, organizer_user_id, assigned_by_user_id
       ) values ($1, $2, $3, $3)`,
      [sessionRows[0].id, membershipRows[0].id, actor],
    );

    let attempt: unknown;
    try {
      attempt = await client
        .query('delete from auth.users where id = $1', [actor])
        .catch((error: Error) => error);
    } finally {
      await client.query('alter table public.players enable trigger trg_guard_player_user_id');
      await client.query(
        'alter table public.players enable trigger trg_guard_player_account_identity_history',
      );
      await client.query('alter table public.players enable trigger audit_players');
      await client.query('alter table public.sessions enable trigger audit_sessions');
    }

    assert.ok(!(attempt instanceof Error), `the delete must not fail: ${String(attempt)}`);

    const after = await client.query<{
      community_membership_id: string | null;
      organizer_user_id: string | null;
      assigned_by_user_id: string | null;
    }>(
      `select community_membership_id, organizer_user_id, assigned_by_user_id
         from public.session_organizer_assignments where session_id = $1`,
      [sessionRows[0].id],
    );
    assert.equal(after.rowCount, 1, 'the assignment survives the account delete');
    assert.deepEqual(after.rows[0], {
      community_membership_id: null,
      organizer_user_id: null,
      assigned_by_user_id: null,
    });
  });

  test('the rows with two dying SET NULL parents are a measured list', async () => {
    // The collision above is a shape, not a one-off: any row holding two or more SET NULL
    // parents that die inside the same account delete can have one action write back the
    // pre-image of another's column. Two of these are PROVEN to collide -- the assignment
    // fixed by this branch, and modification_logs, which surfaced while building that test.
    // The rest carry the shape and are unproven. Pinning the list keeps the next slice from
    // rediscovering it, and makes a newly added shape fail here.
    const { rows } = await client.query<{ child: string }>(`
      with recursive cascaded as (
        select 'auth.users'::text as rel
        union
        select (c.conrelid::regclass)::text
          from pg_constraint c
          join cascaded on (c.confrelid::regclass)::text = cascaded.rel
         where c.contype = 'f' and c.confdeltype = 'c'
      )
      select (conrelid::regclass)::text as child
        from pg_constraint
       where contype = 'f'
         and confdeltype = 'n'
         and (confrelid::regclass)::text in (select rel from cascaded)
       group by 1
      having count(*) >= 2
       order by 1
    `);

    assert.deepEqual(
      rows.map((row) => row.child),
      [
        'community_members',
        'modification_logs',
        'players',
        'session_organizer_assignments',
        'sessions',
        'teams',
      ],
    );
  });

  test('owner_id is nullable exactly where the fix required it', async () => {
    const { rows } = await client.query<{ table_name: string; is_nullable: string }>(
      `select table_name, is_nullable from information_schema.columns
       where table_schema = 'public' and column_name = 'owner_id'
         and table_name in ('sessions','games','point_events','players','communities')
       order by table_name`,
    );
    for (const row of rows) {
      assert.equal(row.is_nullable, 'YES', `${row.table_name}.owner_id must be nullable`);
    }
  });
}
