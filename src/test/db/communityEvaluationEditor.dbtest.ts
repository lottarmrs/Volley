import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client } from 'pg';
import {
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
} from './harness';

const VERSION = 'v0-legacy-11';
const READ = 'select public.get_community_evaluation_editor($1,$2) as editor';

if (!isTestDatabaseConfigured()) {
  test('community evaluation editor requires VOLLEY_TEST_DATABASE_URL', () =>
    assert.fail('database is not configured'));
} else {
  let client: Client;
  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.equal(
      result.failures.filter(
        ({ migration }) => migration === '20260907010305_community_evaluation_editor.sql',
      ).length,
      0,
    );
  });
  test.after(async () => client.end());

  async function user(name: string) {
    const email = `${name}-${randomUUID()}@test.local`;
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id,email,name) values ($1,$2,$3) on conflict (id) do update set email=excluded.email,name=excluded.name',
      [rows[0].id, email, name],
    );
    return rows[0].id;
  }
  async function context() {
    const owner = await user('Owner');
    const { rows } = await asIdentityCommitting(client, owner, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        'Editor test',
      ]),
    );
    const community = rows[0].id;
    await client.query(
      'delete from app_private.community_evaluation_cutovers where community_id = $1',
      [community],
    );
    const member = await user('Evaluator');
    await client.query(
      "insert into public.community_memberships (community_id,user_id,role,status) values ($1,$2,'member','active')",
      [community, member],
    );
    const player = randomUUID();
    await client.query(
      "insert into public.players (id,owner_id,name,active,has_account_identity_history) values ($1,$2,'Editor player',true,false)",
      [player, owner],
    );
    await client.query(
      "insert into public.community_players (community_id,player_id,owner_id,active,status) values ($1,$2,$3,true,'active')",
      [community, player, owner],
    );
    return { owner, member, community, player };
  }
  async function call(actor: string, sql: string, args: unknown[] = []) {
    return asIdentityCommitting(client, actor, () => client.query(sql, args));
  }
  async function editor(actor: string, c: Awaited<ReturnType<typeof context>>) {
    const { rows } = await call(actor, READ, [c.community, c.player]);
    return rows[0].editor;
  }

  async function activate(c: Awaited<ReturnType<typeof context>>) {
    await call(c.owner, 'select public.activate_community_evaluation_model($1)', [c.community]);
    await call(c.owner, 'select public.set_community_evaluator($1,$2,true)', [
      c.community,
      c.member,
    ]);
  }

  function command(c: Awaited<ReturnType<typeof context>>, previous: string | null = null) {
    return [randomUUID(), randomUUID(), c.community, c.player, VERSION, { saque: 6 }, previous];
  }

  const RECORD = 'select public.record_community_player_evaluation($1,$2,$3,$4,$5,$6,$7)';

  test('replays a saved command after supersession without appending a contribution or receipt', async () => {
    const c = await context();
    await activate(c);
    const first = command(c);
    await call(c.member, RECORD, first);
    await call(c.member, RECORD, command(c, first[1] as string));
    await call(c.member, RECORD, first);
    const { rows } = await client.query(
      'select count(*)::int as count from public.player_evaluation_contributions where player_id=$1',
      [c.player],
    );
    assert.equal(rows[0].count, 2);
    const receipts = await client.query(
      'select count(*)::int as count from app_private.command_receipts where command_id=$1',
      [first[0]],
    );
    assert.equal(receipts.rows[0].count, 1);
  });

  test('replay rechecks permission and refuses another evaluator or Community context', async () => {
    const c = await context();
    await activate(c);
    const first = command(c);
    await call(c.member, RECORD, first);
    await call(c.owner, 'select public.set_community_evaluator($1,$2,true)', [
      c.community,
      c.owner,
    ]);
    await assert.rejects(call(c.owner, RECORD, first), { code: '42501' });
    const other = await context();
    await call(other.owner, 'select public.activate_community_evaluation_model($1)', [
      other.community,
    ]);
    await assert.rejects(
      call(c.member, RECORD, [
        first[0],
        first[1],
        other.community,
        c.player,
        VERSION,
        { saque: 6 },
        null,
      ]),
      { code: '42501' },
    );
    await call(c.owner, 'select public.set_community_evaluator($1,$2,false)', [
      c.community,
      c.member,
    ]);
    await assert.rejects(call(c.member, RECORD, first), { code: '42501' });
  });

  test('revoking a never-assigned evaluator does not grant capability and null is rejected', async () => {
    const c = await context();
    await call(c.owner, 'select public.activate_community_evaluation_model($1)', [c.community]);
    await call(c.owner, 'select public.set_community_evaluator($1,$2,false)', [
      c.community,
      c.member,
    ]);
    assert.equal((await editor(c.member, c)).can_evaluate, false);
    await assert.rejects(
      call(c.owner, 'select public.set_community_evaluator($1,$2,null)', [c.community, c.member]),
      { code: '23514' },
    );
  });

  test('stale writes leave the current contribution unchanged', async () => {
    const c = await context();
    await activate(c);
    const first = command(c);
    await call(c.member, RECORD, first);
    await assert.rejects(call(c.member, RECORD, command(c)), { code: '40001' });
    assert.equal((await editor(c.member, c)).own_evaluation.contribution_id, first[1]);
  });

  test('simultaneous retries succeed once and simultaneous new edits reject a stale revision', async () => {
    const c = await context();
    await activate(c);
    const secondClient = await connect();
    try {
      const first = command(c);
      await Promise.all([
        call(c.member, RECORD, first),
        asIdentityCommitting(secondClient, c.member, () => secondClient.query(RECORD, first)),
      ]);
      const edits = await Promise.allSettled([
        call(c.member, RECORD, command(c, first[1] as string)),
        asIdentityCommitting(secondClient, c.member, () =>
          secondClient.query(RECORD, command(c, first[1] as string)),
        ),
      ]);
      assert.equal(edits.filter((r) => r.status === 'fulfilled').length, 1);
      const failed = edits.find((r) => r.status === 'rejected');
      assert.equal(failed?.status === 'rejected' && failed.reason.code, '40001');
    } finally {
      await secondClient.end();
    }
  });

  test('target lookup rejects an unauthenticated actor and only returns their active Communities', async () => {
    const c = await context();
    const other = await context();
    await activate(c);
    await activate(other);
    await assert.rejects(call(randomUUID(), READ, [c.community, c.player]), { code: '42501' });
    const result = await call(c.member, 'select public.community_evaluation_target_ids($1) as id', [
      [c.community, other.community],
    ]);
    assert.deepEqual(result.rows, [{ id: c.community }]);
    await assert.rejects(
      client.query('select public.community_evaluation_target_ids($1)', [[c.community]]),
      { code: '42501' },
    );
  });

  test('activation is separate from evaluator capability and records a source contribution', async () => {
    const c = await context();
    assert.equal((await editor(c.member, c)).authority_model, 'legacy');
    await assert.rejects(
      call(c.member, 'select public.set_community_evaluator($1,$2,true)', [c.community, c.member]),
      { code: '42501' },
    );
    await call(c.owner, 'select public.activate_community_evaluation_model($1)', [c.community]);
    assert.equal((await editor(c.member, c)).can_evaluate, false);
    await call(c.owner, 'select public.set_community_evaluator($1,$2,true)', [
      c.community,
      c.member,
    ]);
    assert.equal((await editor(c.member, c)).can_evaluate, true);
    await call(c.member, 'select public.record_community_player_evaluation($1,$2,$3,$4,$5,$6,$7)', [
      randomUUID(),
      randomUUID(),
      c.community,
      c.player,
      VERSION,
      { saque: 0, ataque: 6 },
      null,
    ]);
    const profile = await call(
      c.member,
      'select public.get_community_player_skill_profile($1,$2,$3) as profile',
      [c.community, c.player, VERSION],
    );
    const saque = profile.rows[0].profile.dimensions.find(
      (item: { dimension_key: string }) => item.dimension_key === 'saque',
    );
    assert.equal(saque.value, 0);
  });

  test('editor exposes own source and managers only see active member choices', async () => {
    const c = await context();
    await call(c.owner, 'select public.activate_community_evaluation_model($1)', [c.community]);
    await call(c.owner, 'select public.set_community_evaluator($1,$2,true)', [
      c.community,
      c.member,
    ]);
    const value = await editor(c.owner, c);
    assert.equal(value.can_manage_evaluators, true);
    assert.equal(
      value.members.some((item: { user_id: string }) => item.user_id === c.member),
      true,
    );
    const memberValue = await editor(c.member, c);
    assert.deepEqual(memberValue.own_evaluation, null);
    await call(c.member, 'select public.record_community_player_evaluation($1,$2,$3,$4,$5,$6,$7)', [
      randomUUID(),
      randomUUID(),
      c.community,
      c.player,
      VERSION,
      { defesa: 5 },
      null,
    ]);
    assert.equal((await editor(c.member, c)).own_evaluation.dimensions.defesa, 5);
  });

  test('legacy writes are rejected after activation while deletion remains available', async () => {
    const c = await context();
    const other = await context();
    const legacy = await client.query(
      "insert into public.player_evaluations (owner_id,player_id,community_id,attributes) values ($1,$2,$3,'{}') returning id",
      [c.owner, c.player, c.community],
    );
    const moving = await client.query(
      "insert into public.player_evaluations (owner_id,player_id,community_id,attributes) values ($1,$2,$3,'{}') returning id",
      [other.owner, other.player, other.community],
    );
    await call(c.owner, 'select public.activate_community_evaluation_model($1)', [c.community]);
    await call(c.owner, 'select public.activate_community_evaluation_model($1)', [c.community]);
    assert.equal(
      (
        await client.query(
          'select count(*)::int as count from app_private.community_evaluation_cutovers where community_id=$1',
          [c.community],
        )
      ).rows[0].count,
      1,
    );
    await assert.rejects(
      client.query(
        "insert into public.player_evaluations (owner_id,player_id,community_id,attributes) values ($1,$2,$3,'{}')",
        [c.owner, c.player, c.community],
      ),
      { code: '23514' },
    );
    await assert.rejects(
      client.query("update public.player_evaluations set notes='changed' where id=$1", [
        legacy.rows[0].id,
      ]),
      { code: '23514' },
    );
    await assert.rejects(
      client.query('update public.player_evaluations set community_id=$1 where id=$2', [
        other.community,
        legacy.rows[0].id,
      ]),
      { code: '23514' },
    );
    await assert.rejects(
      client.query('update public.player_evaluations set community_id=$1 where id=$2', [
        c.community,
        moving.rows[0].id,
      ]),
      { code: '23514' },
    );
    const deleted = await client.query(
      'delete from public.player_evaluations where id=$1 returning id',
      [legacy.rows[0].id],
    );
    assert.equal(deleted.rowCount, 1);
  });

  async function waitBlocked(pid: number) {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const { rows } = await client.query(
        'select cardinality(pg_blocking_pids($1)) > 0 as blocked',
        [pid],
      );
      if (rows[0].blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail('The concurrent command did not wait for the Community lock');
  }

  test('a legacy write waiting on activation sees the committed target guard', async () => {
    const c = await context();
    const other = await connect();
    let waiting: Promise<unknown> | undefined;
    try {
      const pid = (await other.query('select pg_backend_pid() as pid')).rows[0].pid;
      await client.query('begin');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [c.owner]);
      await client.query('select public.activate_community_evaluation_model($1)', [c.community]);
      waiting = asIdentityCommitting(other, c.owner, () =>
        other.query(
          "insert into public.player_evaluations (owner_id,player_id,community_id,attributes) values ($1,$2,$3,'{}')",
          [c.owner, c.player, c.community],
        ),
      ).then(
        () => ({ code: 'unexpected_success' }),
        (error) => error,
      );
      await waitBlocked(pid);
      await client.query('commit');
      assert.equal(((await waiting) as { code: string }).code, '23514');
    } finally {
      await client.query('rollback');
      await waiting;
      await other.end();
    }
  });

  test('activation waits for an in-flight legacy write and preserves it as history', async () => {
    const c = await context();
    const other = await connect();
    let waiting: Promise<unknown> | undefined;
    try {
      const pid = (await other.query('select pg_backend_pid() as pid')).rows[0].pid;
      await client.query('begin');
      await client.query(
        "insert into public.player_evaluations (owner_id,player_id,community_id,attributes) values ($1,$2,$3,'{}')",
        [c.owner, c.player, c.community],
      );
      waiting = asIdentityCommitting(other, c.owner, () =>
        other.query('select public.activate_community_evaluation_model($1)', [c.community]),
      );
      await waitBlocked(pid);
      await client.query('commit');
      await waiting;
      assert.equal((await editor(c.member, c)).authority_model, 'target');
      assert.equal(
        (
          await client.query(
            'select count(*)::int as count from public.player_evaluations where community_id=$1',
            [c.community],
          )
        ).rows[0].count,
        1,
      );
    } finally {
      await client.query('rollback');
      await waiting;
      await other.end();
    }
  });

  test('browser grants expose only authenticated RPCs and no private cutover table', async () => {
    const { rows } = await client.query(
      `select p.proname, p.prosecdef, p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') as anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=any($1)`,
      [
        [
          'activate_community_evaluation_model',
          'set_community_evaluator',
          'get_community_evaluation_editor',
          'record_community_player_evaluation',
          'community_evaluation_target_ids',
        ],
      ],
    );
    assert.equal(rows.length, 5);
    for (const row of rows) {
      assert.equal(row.prosecdef, true);
      assert.deepEqual(row.proconfig, ['search_path=""']);
      assert.equal(row.anon, false);
      assert.equal(row.authenticated, true);
    }
    const grants = await client.query(
      "select has_table_privilege('authenticated','app_private.community_evaluation_cutovers','SELECT,INSERT,UPDATE,DELETE') as access",
    );
    assert.equal(grants.rows[0].access, false);
  });
}
