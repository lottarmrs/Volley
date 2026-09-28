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

const MIGRATION = '20260928120000_ficha_do_atleta.sql';

if (!isTestDatabaseConfigured()) {
  test(`ficha do atleta requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function recusa(actor: string, sql: string, args: unknown[], codigo: string, mensagem?: RegExp) {
    await assert.rejects(como(actor, sql, args), (erro: { code?: string; message?: string }) => {
      assert.equal(erro.code, codigo);
      if (mensagem) assert.match(erro.message ?? '', mensagem);
      return true;
    });
  }

  async function conta(rotulo: string, username: string | null = `u${randomUUID().slice(0, 8)}`) {
    const email = `ficha-${rotulo}-${randomUUID()}@test.local`;
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    const id = rows[0].id;
    await como(id, 'select * from public.ensure_account_ready($1)', [username]);
    return id;
  }

  async function estado(userId: string): Promise<string> {
    const { rows } = await como<{ state: string }>(
      userId,
      'select state from public.ensure_account_ready(null)',
    );
    return rows[0].state;
  }

  async function fichaDe(userId: string) {
    const { rows } = await client.query<{
      id: string;
      gender: string | null;
      primary_position: string | null;
      height: string | null;
      dominant_hand: string | null;
      nickname: string | null;
      secondary_positions: string[];
      status: Record<string, unknown>;
      owner_id: string;
    }>('select * from public.players where user_id = $1 and deleted_at is null', [userId]);
    return rows[0];
  }

  async function completa(userId: string) {
    await client.query(
      `update public.players
          set gender = 'F', primary_position = 'levantador', height = 170, dominant_hand = 'direita'
        where user_id = $1`,
      [userId],
    );
  }

  test('sem nome de usuario, needs_username vem antes de tudo', async () => {
    const id = await conta('sem-username', null);
    assert.equal(await estado(id), 'needs_username');
  });

  test('com nome de usuario e ficha vazia, needs_athlete_profile', async () => {
    const id = await conta('vazia');
    assert.equal(await estado(id), 'needs_athlete_profile');
  });

  test('faltando qualquer um dos quatro obrigatorios, continua needs_athlete_profile', async () => {
    for (const coluna of ['gender', 'primary_position', 'height', 'dominant_hand']) {
      const id = await conta(`falta-${coluna}`);
      await completa(id);
      await client.query(`update public.players set ${coluna} = null where user_id = $1`, [id]);
      assert.equal(await estado(id), 'needs_athlete_profile', `sem ${coluna}`);
    }
  });

  test('com os quatro obrigatorios, ready', async () => {
    const id = await conta('completa');
    await completa(id);
    assert.equal(await estado(id), 'ready');
  });
}
