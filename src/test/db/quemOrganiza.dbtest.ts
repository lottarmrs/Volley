import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

const MIGRATION = '20260929140000_quem_organiza.sql';
const LER = 'select public.get_session_organizer($1) as organizador';

if (!isTestDatabaseConfigured()) {
  test(`quem organiza requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function como<T extends QueryResultRow = QueryResultRow>(
    actor: string,
    sql: string,
    args: unknown[] = [],
  ) {
    return asIdentityCommitting(client, actor, () => client.query<T>(sql, args));
  }

  async function conta(rotulo: string) {
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [`organiza-${rotulo}-${randomUUID()}@test.local`],
    );
    const id = rows[0].id;
    await como(id, 'select * from public.ensure_account_ready($1)', [
      `u${randomUUID().slice(0, 8)}`,
    ]);
    return id;
  }

  async function cena() {
    const dono = await conta('dono');
    const { rows } = await como<{ id: string }>(
      dono,
      'select public.create_community_with_owner($1) as id',
      [`Organiza ${randomUUID()}`],
    );
    const comunidade = rows[0].id;
    const { rows: sessoes } = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, community_id, name, date, status, type, session_context)
       values ($1, $2, 'Pelada', '2030-01-01', 'draft', 'free_play', 'COMMUNITY') returning id`,
      [dono, comunidade],
    );
    await client.query(`update public.players set nickname = 'Beto' where user_id = $1`, [dono]);
    return { dono, comunidade, sessao: sessoes[0].id };
  }

  async function membro(comunidade: string) {
    const id = await conta('membro');
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [comunidade, id],
    );
    return id;
  }

  async function atribuir(sessao: string, organizador: string, revogada = false) {
    await client.query(
      `insert into public.session_organizer_assignments (
         session_id, organizer_user_id, assigned_by_user_id, revoked_at
       ) values ($1, $2, $2, $3)`,
      [sessao, organizador, revogada ? new Date().toISOString() : null],
    );
  }

  test('o membro le quem organiza, com o nome da ficha', async () => {
    const c = await cena();
    const m = await membro(c.comunidade);
    await atribuir(c.sessao, c.dono);
    const { rows } = await como<{ organizador: { user_id: string; name: string } }>(m, LER, [
      c.sessao,
    ]);
    assert.deepEqual(rows[0].organizador, { user_id: c.dono, name: 'Beto' });
  });

  test('quem nao e da comunidade recebe 42501', async () => {
    const c = await cena();
    const fora = await conta('fora');
    await atribuir(c.sessao, c.dono);
    await assert.rejects(como(fora, LER, [c.sessao]), (erro: { code?: string }) => {
      assert.equal(erro.code, '42501');
      return true;
    });
  });

  test('sem atribuicao ativa, null', async () => {
    const c = await cena();
    const m = await membro(c.comunidade);
    const { rows } = await como<{ organizador: unknown }>(m, LER, [c.sessao]);
    assert.equal(rows[0].organizador, null);
  });

  test('atribuicao revogada nao conta', async () => {
    const c = await cena();
    const m = await membro(c.comunidade);
    await atribuir(c.sessao, c.dono, true);
    const { rows } = await como<{ organizador: unknown }>(m, LER, [c.sessao]);
    assert.equal(rows[0].organizador, null);
  });
}
