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

const GRANT = 'select public.set_community_organizer($1,$2,$3)';

if (!isTestDatabaseConfigured()) {
  test('set community organizer requires VOLLEY_TEST_DATABASE_URL', () =>
    assert.fail('database is not configured'));
} else {
  let client: Client;
  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.equal(
      result.failures.filter(
        ({ migration }) => migration === '20260910100000_set_community_organizer.sql',
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
        'Organizer test',
      ]),
    );
    const community = rows[0].id;
    const member = await user('Candidate');
    await client.query(
      "insert into public.community_memberships (community_id,user_id,role,status) values ($1,$2,'member','active')",
      [community, member],
    );
    return { owner, member, community };
  }

  async function call(actor: string | null, sql: string, args: unknown[] = []) {
    return asIdentityCommitting(client, actor, () => client.query(sql, args));
  }

  async function createSession(actor: string | null, community: string) {
    return call(
      actor,
      "select public.create_target_session($1,$2,'COMMUNITY','FREE_PLAY',$3,null,null) as id",
      [randomUUID(), community, 'Sessão de teste'],
    );
  }

  let shared: Awaited<ReturnType<typeof context>>;

  test('before any grant, create_target_session by that member raises 42501', async () => {
    shared = await context();
    await assert.rejects(createSession(shared.member, shared.community), { code: '42501' });
  });

  test('the owner grants it, and the same create_target_session call now succeeds', async () => {
    await call(shared.owner, GRANT, [shared.community, shared.member, true]);
    const { rows } = await createSession(shared.member, shared.community);
    assert.ok(rows[0].id);
  });

  test('revoking it (p_enabled false) makes create_target_session raise 42501 again', async () => {
    await call(shared.owner, GRANT, [shared.community, shared.member, false]);
    await assert.rejects(createSession(shared.member, shared.community), { code: '42501' });
  });

  test('a plain member cannot grant it: 42501', async () => {
    const c = await context();
    await assert.rejects(call(c.member, GRANT, [c.community, c.member, true]), { code: '42501' });
  });

  test('granting to a non-member raises 23514', async () => {
    const c = await context();
    const stranger = await user('Stranger');
    await assert.rejects(call(c.owner, GRANT, [c.community, stranger, true]), { code: '23514' });
  });

  test('a null p_enabled raises 23514', async () => {
    const c = await context();
    await assert.rejects(call(c.owner, GRANT, [c.community, c.member, null]), { code: '23514' });
  });

  test('anonymous raises 42501', async () => {
    const c = await context();
    await assert.rejects(call(null, GRANT, [c.community, c.member, true]), { code: '42501' });
  });
}
