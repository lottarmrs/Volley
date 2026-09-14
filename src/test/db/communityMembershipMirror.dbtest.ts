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

  async function legacyRows(community: string, userId: string) {
    const { rows } = await client.query<{ n: number }>(
      'select count(*)::int as n from public.community_members where community_id = $1 and user_id = $2',
      [community, userId],
    );
    return rows[0].n;
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

  test('returning to member revokes ORGANIZER and create_target_session raises 42501', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'organizador');
    await setRole(c.owner.id, c.community, c.member.id, 'member');
    assert.deepEqual(await membership(c.community, c.member.id), {
      role: 'member',
      status: 'active',
    });
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), []);
    await assert.rejects(createSession(c.member.id, c.community), { code: '42501' });
    assert.deepEqual(await drift(c.community), []);
  });

  test('remove_community_member deletes the membership and revokes every responsibility', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'organizador');
    await client.query(
      "insert into public.community_responsibilities (community_id, user_id, responsibility) values ($1, $2, 'EVALUATOR')",
      [c.community, c.member.id],
    );
    await rpc(c.owner.id, 'select public.remove_community_member($1)', [
      await memberRowId(c.community, c.member.id),
    ]);
    assert.equal(await legacyRows(c.community, c.member.id), 0);
    assert.equal(await membership(c.community, c.member.id), null);
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), []);
    await assert.rejects(createSession(c.member.id, c.community), { code: '42501' });
    assert.deepEqual(await drift(c.community), []);
  });

  test('leave_community deletes the membership and revokes ORGANIZER', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'organizador');
    await rpc(c.member.id, 'select public.leave_community($1)', [c.community]);
    assert.equal(await legacyRows(c.community, c.member.id), 0);
    assert.equal(await membership(c.community, c.member.id), null);
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), []);
    assert.deepEqual(await drift(c.community), []);
  });

  test('a join request becomes a membership only when approved, never when rejected', async () => {
    const owner = await user('JoinOwner');
    const approved = await user('Approved');
    const rejected = await user('Rejected');
    const community = await legacyCommunity(owner.id);
    const { rows } = await rpc(owner.id, 'select public.generate_join_code($1) as code', [
      community,
    ]);
    const code = rows[0].code as string;

    for (const applicant of [approved, rejected]) {
      await rpc(applicant.id, 'select public.request_to_join_community($1)', [code]);
      assert.equal(await membership(community, applicant.id), null);
    }

    await rpc(owner.id, 'select public.approve_join_request($1)', [
      await memberRowId(community, approved.id),
    ]);
    await rpc(owner.id, 'select public.reject_join_request($1)', [
      await memberRowId(community, rejected.id),
    ]);

    assert.deepEqual(await membership(community, approved.id), {
      role: 'member',
      status: 'active',
    });
    assert.equal(await membership(community, rejected.id), null);
    assert.deepEqual(await drift(community), []);
  });

  test('a moderator mirrors as member, never above it', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'moderator');
    assert.deepEqual(await membership(c.community, c.member.id), {
      role: 'member',
      status: 'active',
    });
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), []);
  });

  test('an ORGANIZER granted by set_community_organizer survives member -> admin', async () => {
    const c = await panelContext();
    await rpc(c.owner.id, 'select public.set_community_organizer($1, $2, true)', [
      c.community,
      c.member.id,
    ]);
    await setRole(c.owner.id, c.community, c.member.id, 'admin');
    assert.deepEqual(await membership(c.community, c.member.id), {
      role: 'admin',
      status: 'active',
    });
    assert.deepEqual(await activeResponsibilities(c.community, c.member.id), ['ORGANIZER']);
  });

  test('the legacy ownership transfer leaves exactly one active owner membership', async () => {
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
    assert.deepEqual(await membership(c.community, c.member.id), {
      role: 'owner',
      status: 'active',
    });
    assert.deepEqual(await membership(c.community, c.owner.id), {
      role: 'admin',
      status: 'active',
    });
    assert.deepEqual(await drift(c.community), []);
  });

  test('a target Community is not mirrored and create_community_with_owner still works', async () => {
    const owner = await user('TargetOwner');
    const legacyOrganizer = await user('LegacyOrganizer');
    const { rows } = await rpc(owner.id, 'select public.create_community_with_owner($1) as id', [
      'Target mirror fence',
    ]);
    const community = rows[0].id as string;
    await client.query(
      "insert into public.community_members (community_id, user_id, role, status) values ($1, $2, 'organizador', 'active')",
      [community, legacyOrganizer.id],
    );
    assert.equal(await membership(community, legacyOrganizer.id), null);
    assert.deepEqual(await activeResponsibilities(community, legacyOrganizer.id), []);
  });

  test('deleting a legacy Community cascades through the mirror without error', async () => {
    const c = await panelContext();
    await setRole(c.owner.id, c.community, c.member.id, 'organizador');
    await inTransactionWith(
      'app.allow_reset_bypass',
      'delete from public.communities where id = $1',
      [c.community],
    );
    const { rows } = await client.query<{ n: number }>(
      'select count(*)::int as n from public.community_memberships where community_id = $1',
      [c.community],
    );
    assert.equal(rows[0].n, 0);
  });

  test('no mirror function is executable by anon or authenticated', async () => {
    for (const fn of [
      'app_private.legacy_membership_mirrored(uuid)',
      'app_private.project_legacy_community_membership(uuid, uuid)',
      'app_private.mirror_community_member_to_target()',
      'app_private.community_membership_drift()',
    ]) {
      for (const role of ['anon', 'authenticated']) {
        const { rows } = await client.query<{ ok: boolean }>(
          'select has_function_privilege($1, $2, $3) as ok',
          [role, fn, 'execute'],
        );
        assert.equal(rows[0].ok, false, `${role} must not execute ${fn}`);
      }
    }
  });
}
