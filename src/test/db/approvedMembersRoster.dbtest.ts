import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Client } from 'pg';
import { asIdentityCommitting, connect, rebuildFromMigrations } from './harness';

let client: Client;
test.before(async () => {
  client = await connect();
  const result = await rebuildFromMigrations(client);
  assert.deepEqual(
    result.failures.filter(
      (failure) =>
        failure.migration.includes('approved_members_join_roster') ||
        failure.migration.includes('enrolled_roster_owner'),
    ),
    [],
  );
});
test.after(async () => client?.end());

async function user() {
  const email = `${randomUUID()}@test.local`;
  const { rows } = await client.query(
    'insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id',
    [email, JSON.stringify({ name: 'Atleta' })],
  );
  await client.query(
    'insert into public.profiles (id, email, name) values ($1, $2, $3) on conflict (id) do update set name = excluded.name',
    [rows[0].id, email, 'Atleta'],
  );
  return { id: rows[0].id as string, email };
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

async function context() {
  const owner = await user();
  const member = await user();
  const { rows } = await client.query(
    'insert into public.communities (name, owner_id) values ($1, $2) returning id',
    ['Elenco', owner.id],
  );
  return { owner, member, community: rows[0].id as string };
}

async function roster(community: string, member: string) {
  const { rows } = await client.query(
    `select p.id, p.name, cp.active, cp.status, cp.deleted_at
       from public.players p join public.community_players cp on cp.player_id = p.id
      where cp.community_id = $1 and p.user_id = $2`,
    [community, member],
  );
  return rows;
}

async function pending(community: string, member: string) {
  const { rows } = await client.query(
    "insert into public.community_members (community_id, user_id, role, status) values ($1, $2, 'member', 'pending') returning id",
    [community, member],
  );
  return rows[0].id as string;
}

test('aprovar inclui o atleta existente uma única vez, sem alterar sua identidade', async () => {
  const c = await context();
  const account = await rpc(c.member.id, 'select * from public.ensure_account_ready($1)', [
    `a${randomUUID().replaceAll('-', '').slice(0, 20)}`,
  ]);
  const request = await pending(c.community, c.member.id);
  assert.deepEqual(await roster(c.community, c.member.id), []);
  await rpc(c.owner.id, 'select public.approve_join_request($1)', [request]);
  await rpc(c.owner.id, 'select public.approve_join_request($1)', [request]);
  assert.deepEqual(await roster(c.community, c.member.id), [
    {
      id: account.rows[0].player_id,
      name: 'Atleta',
      active: true,
      status: 'active',
      deleted_at: null,
    },
  ]);
});

test('adição direta cria a ficha ausente e inclui o membro no elenco', async () => {
  const c = await context();
  await rpc(c.owner.id, 'select public.add_community_member_by_identifier($1, $2)', [
    c.community,
    c.member.email,
  ]);
  const rows = await roster(c.community, c.member.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].active, true);
});

test('readicionar um administrador ativo não altera seu cargo', async () => {
  const c = await context();
  await rpc(c.owner.id, 'select public.add_community_member_by_identifier($1, $2, $3)', [
    c.community,
    c.member.email,
    'admin',
  ]);
  await assert.rejects(
    rpc(c.owner.id, 'select public.add_community_member_by_identifier($1, $2)', [
      c.community,
      c.member.email,
    ]),
    { code: '22023' },
  );
  const { rows } = await client.query(
    'select role from public.community_members where community_id = $1 and user_id = $2',
    [c.community, c.member.id],
  );
  assert.equal(rows[0].role, 'admin');
});

test('aprovação do modelo novo também inclui o atleta no elenco', async () => {
  const c = await context();
  const request = await rpc(c.member.id, 'select public.request_community_join($1) as id', [
    c.community,
  ]);
  assert.deepEqual(await roster(c.community, c.member.id), []);
  await rpc(c.owner.id, 'select public.approve_community_join_request($1)', [request.rows[0].id]);
  assert.equal((await roster(c.community, c.member.id)).length, 1);
});

test('quem não pode aprovar não cria ficha nem vínculo esportivo', async () => {
  const c = await context();
  const request = await pending(c.community, c.member.id);
  await assert.rejects(rpc(c.member.id, 'select public.approve_join_request($1)', [request]), {
    code: '42501',
  });
  assert.deepEqual(await roster(c.community, c.member.id), []);
});

test('atleta banido impede aprovação e mantém o pedido pendente', async () => {
  const c = await context();
  const account = await rpc(c.member.id, 'select * from public.ensure_account_ready()');
  await client.query(
    "insert into public.community_players (owner_id, community_id, player_id, active, status) values ($1, $2, $3, false, 'banned')",
    [c.owner.id, c.community, account.rows[0].player_id],
  );
  const request = await pending(c.community, c.member.id);
  await assert.rejects(rpc(c.owner.id, 'select public.approve_join_request($1)', [request]), {
    code: '23514',
  });
  const { rows } = await client.query('select status from public.community_members where id = $1', [
    request,
  ]);
  assert.equal(rows[0].status, 'pending');
  assert.equal((await roster(c.community, c.member.id))[0].status, 'banned');
});

test('migration preenche membros ativos antigos sem restaurar remoções do elenco', async () => {
  const c = await context();
  const removed = await user();
  const waiting = await user();
  await pending(c.community, waiting.id);
  for (const member of [c.member, removed]) {
    await client.query(
      "insert into public.community_members (community_id, user_id, role, status) values ($1, $2, 'member', 'active')",
      [c.community, member.id],
    );
  }
  const account = await rpc(removed.id, 'select * from public.ensure_account_ready()');
  await client.query(
    "insert into public.community_players (owner_id, community_id, player_id, active, status, deleted_at) values ($1, $2, $3, false, 'inactive', now())",
    [c.owner.id, c.community, account.rows[0].player_id],
  );
  const migration = readFileSync(
    'supabase/migrations/20260915155701_approved_members_join_roster.sql',
    'utf8',
  );
  const ownerFix = readFileSync(
    'supabase/migrations/20260917120000_enrolled_roster_owner.sql',
    'utf8',
  );
  await client.query(migration);
  await client.query(ownerFix);
  await client.query(migration);
  await client.query(ownerFix);
  assert.equal((await roster(c.community, c.member.id)).length, 1);
  assert.deepEqual(await roster(c.community, waiting.id), []);
  const removedRows = await roster(c.community, removed.id);
  assert.equal(removedRows[0].active, false);
  assert.ok(removedRows[0].deleted_at);
});

test('o sync de quem aprovou consegue reenviar o vínculo do atleta aprovado', async () => {
  const c = await context();
  const account = await rpc(c.member.id, 'select * from public.ensure_account_ready()');
  const request = await pending(c.community, c.member.id);
  await rpc(c.owner.id, 'select public.approve_join_request($1)', [request]);
  await rpc(
    c.owner.id,
    `insert into public.community_players (owner_id, community_id, player_id, active)
     values ($1, $2, $3, true)
     on conflict (community_id, player_id) do update
       set owner_id = excluded.owner_id, active = excluded.active`,
    [c.owner.id, c.community, account.rows[0].player_id],
  );
  assert.equal((await roster(c.community, c.member.id)).length, 1);
});

test('reparo devolve ao dono da comunidade o vínculo que só a conta do atleta possuía', async () => {
  const c = await context();
  const account = await rpc(c.member.id, 'select * from public.ensure_account_ready()');
  await client.query(
    "insert into public.community_members (community_id, user_id, role, status) values ($1, $2, 'member', 'active')",
    [c.community, c.member.id],
  );
  await client.query(
    'insert into public.community_players (owner_id, community_id, player_id, active) values ($1, $2, $3, true)',
    [c.member.id, c.community, account.rows[0].player_id],
  );
  const migration = readFileSync(
    'supabase/migrations/20260917120000_enrolled_roster_owner.sql',
    'utf8',
  );
  await client.query(migration);
  await client.query(migration);
  const { rows } = await client.query(
    'select owner_id from public.community_players where community_id = $1 and player_id = $2',
    [c.community, account.rows[0].player_id],
  );
  assert.equal(rows[0].owner_id, c.owner.id);
});
