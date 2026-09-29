import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client } from 'pg';
import {
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

const MIGRATION = '20260929120000_convidado_numa_comunidade.sql';

if (!isTestDatabaseConfigured()) {
  test(`convidado numa comunidade requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.equal(result.failures.filter(({ migration }) => migration === MIGRATION).length, 0);
  });

  test.after(async () => {
    await client?.end();
  });

  async function conta(rotulo: string) {
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [`convidado-${rotulo}-${randomUUID()}@test.local`],
    );
    const id = rows[0].id;
    await asIdentityCommitting(client, id, () =>
      client.query('select * from public.ensure_account_ready($1)', [
        `u${randomUUID().slice(0, 8)}`,
      ]),
    );
    return id;
  }

  async function comunidade(dono: string) {
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Comunidade ${randomUUID()}`,
      ]),
    );
    return rows[0].id;
  }

  async function convidado(dono: string) {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active) values ($1, $2, 'Convidado', true)`,
      [id, dono],
    );
    return id;
  }

  function vincular(comunidadeId: string, playerId: string, dono: string) {
    return client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')
       on conflict (community_id, player_id)
       do update set active = true, status = 'active', deleted_at = null`,
      [comunidadeId, playerId, dono],
    );
  }

  async function recusaVinculo(comunidadeId: string, playerId: string, dono: string) {
    await assert.rejects(
      vincular(comunidadeId, playerId, dono),
      (erro: { code?: string; message?: string }) => {
        assert.equal(erro.code, '23514');
        assert.match(erro.message ?? '', /already belongs to another community/);
        return true;
      },
    );
  }

  test('convidado em A nao entra em B', async () => {
    const dono = await conta('dono');
    const a = await comunidade(dono);
    const b = await comunidade(dono);
    const g = await convidado(dono);
    await vincular(a, g, dono);
    await recusaVinculo(b, g, dono);
  });

  test('atleta com conta pode estar em A e B', async () => {
    const dono = await conta('dono-conta');
    const atleta = await conta('atleta');
    const a = await comunidade(dono);
    const b = await comunidade(dono);
    const { rows } = await client.query<{ id: string }>(
      'select id from public.players where user_id = $1',
      [atleta],
    );
    await vincular(a, rows[0].id, dono);
    await vincular(b, rows[0].id, dono);
  });

  test('reescrever o vinculo na mesma comunidade passa', async () => {
    const dono = await conta('dono-mesma');
    const a = await comunidade(dono);
    const g = await convidado(dono);
    await vincular(a, g, dono);
    await vincular(a, g, dono);
  });

  test('vinculo apagado libera outra comunidade, e reativar o antigo e recusado', async () => {
    const dono = await conta('dono-apagado');
    const a = await comunidade(dono);
    const b = await comunidade(dono);
    const g = await convidado(dono);
    await vincular(a, g, dono);
    await client.query(
      'update public.community_players set deleted_at = now() where community_id = $1 and player_id = $2',
      [a, g],
    );
    await vincular(b, g, dono);
    await recusaVinculo(a, g, dono);
  });

  test('vinculo inativo nao conta', async () => {
    const dono = await conta('dono-inativo');
    const a = await comunidade(dono);
    const b = await comunidade(dono);
    const g = await convidado(dono);
    await vincular(a, g, dono);
    await client.query(
      "update public.community_players set status = 'inactive' where community_id = $1 and player_id = $2",
      [a, g],
    );
    await vincular(b, g, dono);
  });

  test('convidado que ganha conta pode entrar em outra comunidade', async () => {
    const dono = await conta('dono-ganha');
    const a = await comunidade(dono);
    const b = await comunidade(dono);
    const g = await convidado(dono);
    await vincular(a, g, dono);
    const novaConta = await conta('ganhou');
    await client.query('set session_replication_role = replica');
    try {
      await client.query('update public.players set user_id = null where user_id = $1', [
        novaConta,
      ]);
      await client.query(
        'update public.players set user_id = $1, has_account_identity_history = true where id = $2',
        [novaConta, g],
      );
    } finally {
      await client.query('set session_replication_role = origin');
    }
    await vincular(b, g, dono);
  });
}
