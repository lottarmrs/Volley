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

const VERSION = 'v0-legacy-11';
const RECORD = 'select * from public.record_player_evaluation($1,$2,$3,$4,$5,$6)';
const RECORD_EDITOR = 'select public.record_community_player_evaluation($1,$2,$3,$4,$5,$6,$7)';
const PROFILE = 'select public.get_community_player_skill_profile($1,$2,$3) as profile';

if (!isTestDatabaseConfigured()) {
  test(`avaliacao da comunidade requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.equal(
      result.failures.filter(
        ({ migration }) => migration === '20260925130000_avaliacao_da_comunidade.sql',
      ).length,
      0,
    );
  });

  test.after(async () => {
    await client?.end();
  });

  async function usuario(rotulo: string): Promise<string> {
    const email = `aval-${rotulo}-${randomUUID()}@test.local`;
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id, email, name) values ($1, $2, $3) on conflict do nothing',
      [rows[0].id, email, rotulo],
    );
    return rows[0].id;
  }

  async function como<T extends QueryResultRow = QueryResultRow>(
    actor: string,
    sql: string,
    args: unknown[] = [],
  ) {
    return asIdentityCommitting(client, actor, () => client.query<T>(sql, args));
  }

  async function recusa(actor: string, sql: string, args: unknown[], mensagem?: RegExp) {
    await assert.rejects(como(actor, sql, args), (erro: { code?: string; message?: string }) => {
      assert.equal(erro.code, '42501');
      if (mensagem) assert.match(erro.message ?? '', mensagem);
      return true;
    });
  }

  async function atleta(comunidade: string, dono: string, userId: string | null = null) {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active, user_id, has_account_identity_history)
       values ($1, $2, $3, true, $4, $5)`,
      [id, dono, `Atleta ${id.slice(0, 6)}`, userId, userId !== null],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [comunidade, id, dono],
    );
    return id;
  }

  async function entra(comunidade: string, papel: 'admin' | 'member') {
    const id = await usuario(papel);
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, $3, 'active')`,
      [comunidade, id, papel],
    );
    return id;
  }

  async function cena() {
    const dono = await usuario('dono');
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Avaliacao ${randomUUID()}`,
      ]),
    );
    const comunidade = rows[0].id;
    const { rows: fichas } = await client.query<{ id: string }>(
      'select id from public.players where user_id = $1',
      [dono],
    );
    return { comunidade, dono, fichaDoDono: fichas[0].id };
  }

  async function avalia(actor: string, comunidade: string, ficha: string, saque = 6) {
    return como(actor, RECORD, [randomUUID(), randomUUID(), comunidade, ficha, VERSION, { saque }]);
  }

  async function saqueNoPerfil(actor: string, comunidade: string, ficha: string) {
    const { rows } = await como<{
      profile: { dimensions: { dimension_key: string; value: number | null }[] };
    }>(actor, PROFILE, [comunidade, ficha, VERSION]);
    return rows[0].profile.dimensions.find((d) => d.dimension_key === 'saque')?.value ?? null;
  }

  test('dono e admin avaliam pelo cargo; membro nao; membro com EVALUATOR sim', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');
    const membro = await entra(c.comunidade, 'member');
    const ficha = await atleta(c.comunidade, c.dono);

    await avalia(c.dono, c.comunidade, ficha);
    await avalia(admin, c.comunidade, ficha);
    await recusa(membro, RECORD, [
      randomUUID(),
      randomUUID(),
      c.comunidade,
      ficha,
      VERSION,
      { saque: 5 },
    ]);

    await como(c.dono, 'select public.set_community_evaluator($1,$2,true)', [c.comunidade, membro]);
    await avalia(membro, c.comunidade, ficha);
  });

  test('admin rebaixado a membro deixa de avaliar na mesma hora', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');
    const ficha = await atleta(c.comunidade, c.dono);

    await avalia(admin, c.comunidade, ficha);
    await client.query(
      "update public.community_memberships set role = 'member' where community_id = $1 and user_id = $2",
      [c.comunidade, admin],
    );
    await recusa(admin, RECORD, [
      randomUUID(),
      randomUUID(),
      c.comunidade,
      ficha,
      VERSION,
      { saque: 5 },
    ]);
  });
}
