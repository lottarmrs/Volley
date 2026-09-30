import assert from 'node:assert/strict';
import test from 'node:test';
import type { Client } from 'pg';
import {
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

const MIGRATION = '20260930140000_dados_online_comunidade.sql';
const TABELAS = [
  'communities',
  'community_members',
  'community_players',
  'community_rules',
  'players',
];

if (!isTestDatabaseConfigured()) {
  test(`dados online requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  test('comunidade, membros, elenco e regras estao na publicacao de tempo real', async () => {
    const { rows } = await client.query<{ tablename: string }>(
      `select tablename from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public'
        order by tablename`,
    );
    const publicadas = rows.map(({ tablename }) => tablename);
    for (const tabela of TABELAS) assert.ok(publicadas.includes(tabela), tabela);
  });
}
