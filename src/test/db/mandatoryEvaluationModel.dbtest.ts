import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import type { Client } from 'pg';
import {
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  splitSqlStatements,
} from './harness';

const MIGRATION = '20260915180000_mandatory_evaluation_model.sql';

if (!isTestDatabaseConfigured()) {
  test('mandatory evaluation model requires VOLLEY_TEST_DATABASE_URL', () =>
    assert.fail('database is not configured'));
} else {
  let client: Client;
  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.deepEqual(
      result.failures.filter(({ migration }) => migration === MIGRATION),
      [],
    );
  });
  test.after(async () => client.end());

  async function user(name: string) {
    const email = `${name}-${randomUUID()}@test.local`.toLowerCase();
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id,email,name) values ($1,$2,$3) on conflict (id) do update set email=excluded.email,name=excluded.name',
      [rows[0].id, email, name],
    );
    return { id: rows[0].id, email };
  }

  async function legacyCommunity(ownerId: string) {
    const { rows } = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id) values ($1, $2) returning id',
      [`Mandatory ${randomUUID()}`, ownerId],
    );
    return rows[0].id;
  }

  async function rpc(actor: string | null, sql: string, args: unknown[] = []) {
    return asIdentityCommitting(client, actor, async () => {
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: actor, role: actor ? 'authenticated' : 'anon', aal: 'aal2' }),
      ]);
      return client.query(sql, args);
    });
  }

  async function memberRowId(community: string, userId: string) {
    const { rows } = await client.query<{ id: string }>(
      'select id from public.community_members where community_id = $1 and user_id = $2',
      [community, userId],
    );
    return rows[0].id;
  }

  async function setRole(actor: string, community: string, userId: string, role: string) {
    await rpc(actor, 'select public.set_community_member_role($1, $2)', [
      await memberRowId(community, userId),
      role,
    ]);
  }

  async function createSession(actor: string, community: string) {
    return rpc(
      actor,
      "select public.create_target_session($1,$2,'COMMUNITY','FREE_PLAY',$3,null,null) as id",
      [randomUUID(), community, 'Sessão obrigatória'],
    );
  }

  async function inTransactionWith(setting: string, sql: string, args: unknown[]) {
    await client.query('begin');
    try {
      await client.query('select set_config($1, $2, true)', [setting, 'on']);
      await client.query(sql, args);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }

  async function activeResponsibilities(community: string, userId: string) {
    const { rows } = await client.query<{ responsibility: string }>(
      `select responsibility from public.community_responsibilities
        where community_id = $1 and user_id = $2 and revoked_at is null
        order by responsibility`,
      [community, userId],
    );
    return rows.map((row) => row.responsibility);
  }

  async function drift(community: string) {
    const { rows } = await client.query<{ user_id: string | null; issue: string }>(
      'select user_id, issue from app_private.community_membership_drift() where community_id = $1',
      [community],
    );
    return rows;
  }

  async function activated(community: string) {
    const { rows } = await client.query<{ n: number }>(
      'select count(*)::int as n from app_private.community_evaluation_cutovers where community_id = $1',
      [community],
    );
    return rows[0].n === 1;
  }

  async function panelContext() {
    const owner = await user('Owner');
    const member = await user('Member');
    const community = await legacyCommunity(owner.id);
    await rpc(owner.id, 'select public.add_community_member_by_identifier($1, $2)', [
      community,
      member.email,
    ]);
    return { owner, member, community };
  }

  test('a legacy Community is activated as soon as it is inserted', async () => {
    const owner = await user('LegacyOwner');
    const community = await legacyCommunity(owner.id);
    assert.equal(await activated(community), true);
  });

  test('create_community_with_owner activates the target Community without rank-derived ORGANIZER', async () => {
    const owner = await user('TargetOwner');
    const { rows } = await rpc(owner.id, 'select public.create_community_with_owner($1) as id', [
      'Target activated',
    ]);
    const community = rows[0].id as string;
    assert.equal(await activated(community), true);
    assert.deepEqual(await activeResponsibilities(community, owner.id), []);
  });

  test('the legacy owner holds ORGANIZER and creates a target Session; a member cannot', async () => {
    const c = await panelContext();
    assert.deepEqual(await activeResponsibilities(c.community, c.owner.id), ['ORGANIZER']);
    const { rows } = await createSession(c.owner.id, c.community);
    assert.equal(rows.length, 1);
    await assert.rejects(createSession(c.member.id, c.community), { code: '42501' });
    assert.deepEqual(await drift(c.community), []);
  });

  for (const role of ['admin', 'moderator', 'organizador']) {
    test(`${role} grants ORGANIZER and returning to member revokes it`, async () => {
      const c = await panelContext();
      await setRole(c.owner.id, c.community, c.member.id, role);
      assert.deepEqual(await activeResponsibilities(c.community, c.member.id), ['ORGANIZER']);
      await setRole(c.owner.id, c.community, c.member.id, 'member');
      assert.deepEqual(await activeResponsibilities(c.community, c.member.id), []);
      await assert.rejects(createSession(c.member.id, c.community), { code: '42501' });
      assert.deepEqual(await drift(c.community), []);
    });
  }

  test('an ownership transfer keeps ORGANIZER for both parties', async () => {
    const c = await panelContext();
    const master = await user('Master');
    await inTransactionWith(
      'app.allow_role_change',
      "update public.profiles set role = 'master' where id = $1",
      [master.id],
    );
    await rpc(master.id, 'select public.transfer_community_ownership($1, $2)', [
      c.community,
      await memberRowId(c.community, c.member.id),
    ]);
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), ['ORGANIZER']);
    assert.deepEqual(await activeResponsibilities(c.community, c.owner.id), ['ORGANIZER']);
    assert.deepEqual(await drift(c.community), []);
  });

  test('drift reports MISSING_ORGANIZER for an admin whose ORGANIZER was revoked by hand', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'admin');
    await client.query(
      "update public.community_responsibilities set revoked_at = now() where community_id = $1 and user_id = $2 and responsibility = 'ORGANIZER'",
      [c.community, c.member.id],
    );
    assert.deepEqual(await drift(c.community), [
      { user_id: c.member.id, issue: 'MISSING_ORGANIZER' },
    ]);
  });

  test('the migration activates and backfills Communities that existed before it', async () => {
    await rebuildFromMigrations(client, { excludeMigrationNames: [MIGRATION] });
    const owner = await user('BeforeOwner');
    const admin = await user('BeforeAdmin');
    const community = await legacyCommunity(owner.id);
    await client.query(
      "insert into public.community_members (community_id, user_id, role, status) values ($1, $2, 'admin', 'active')",
      [community, admin.id],
    );
    assert.equal(await activated(community), false);
    assert.deepEqual(await activeResponsibilities(community, owner.id), []);
    assert.deepEqual(await activeResponsibilities(community, admin.id), []);

    const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', MIGRATION), 'utf8');
    for (const statement of splitSqlStatements(sql)) await client.query(statement);

    assert.equal(await activated(community), true);
    assert.deepEqual(await activeResponsibilities(community, owner.id), ['ORGANIZER']);
    assert.deepEqual(await activeResponsibilities(community, admin.id), ['ORGANIZER']);
    assert.deepEqual(await drift(community), []);
  });
}
