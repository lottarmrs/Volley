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

const MIGRATION = '20260914120000_mirror_community_members_to_target.sql';

if (!isTestDatabaseConfigured()) {
  test('community membership mirror requires VOLLEY_TEST_DATABASE_URL', () =>
    assert.fail('database is not configured'));
} else {
  let client: Client;
  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.equal(result.failures.filter(({ migration }) => migration === MIGRATION).length, 0);
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
      [`Mirror ${randomUUID()}`, ownerId],
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
      [randomUUID(), community, 'Sessão espelhada'],
    );
  }

  async function membership(community: string, userId: string) {
    const { rows } = await client.query<{ role: string; status: string }>(
      'select role, status from public.community_memberships where community_id = $1 and user_id = $2',
      [community, userId],
    );
    return rows[0] ?? null;
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

  test('promoting a panel member to organizador lets them create a target Session', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'organizador');
    const { rows } = await createSession(c.member.id, c.community);
    assert.ok(rows[0].id);
    assert.deepEqual(await drift(c.community), []);
  });
}
