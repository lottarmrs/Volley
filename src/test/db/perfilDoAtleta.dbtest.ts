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

const MIGRATION = '20260929130000_perfil_do_atleta.sql';
const VERSION = 'v0-legacy-11';
const RECORD = 'select * from public.record_player_evaluation($1,$2,$3,$4,$5,$6)';
const PROFILE = 'select public.get_community_player_skill_profile($1,$2,$3) as profile';
const PROPOSE = 'select public.propose_player_avatar($1, $2) as id';

if (!isTestDatabaseConfigured()) {
  test(`perfil do atleta requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function recusa(actor: string, sql: string, args: unknown[]) {
    await assert.rejects(como(actor, sql, args), (erro: { code?: string }) => {
      assert.equal(erro.code, '42501');
      return true;
    });
  }

  async function conta(rotulo: string) {
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [`perfil-${rotulo}-${randomUUID()}@test.local`],
    );
    const id = rows[0].id;
    await como(id, 'select * from public.ensure_account_ready($1)', [
      `u${randomUUID().slice(0, 8)}`,
    ]);
    const { rows: fichas } = await client.query<{ id: string }>(
      'select id from public.players where user_id = $1',
      [id],
    );
    return { userId: id, fichaId: fichas[0].id };
  }

  async function cena() {
    const dono = await conta('dono');
    const { rows } = await como<{ id: string }>(
      dono.userId,
      'select public.create_community_with_owner($1) as id',
      [`Perfil ${randomUUID()}`],
    );
    return { comunidade: rows[0].id, dono };
  }

  async function vincular(comunidade: string, fichaId: string, dono: string) {
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active') on conflict (community_id, player_id) do nothing`,
      [comunidade, fichaId, dono],
    );
  }

  async function membroAdmin(comunidade: string) {
    const admin = await conta('admin');
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'admin', 'active')`,
      [comunidade, admin.userId],
    );
    return admin;
  }

  async function convidado(comunidade: string, criador: string) {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active) values ($1, $2, 'Convidado', true)`,
      [id, criador],
    );
    await vincular(comunidade, id, criador);
    return id;
  }

  async function fotoDe(fichaId: string) {
    const { rows } = await client.query<{ avatar_url: string | null }>(
      'select avatar_url from public.players where id = $1',
      [fichaId],
    );
    return rows[0].avatar_url;
  }

  test('o atleta le a propria avaliacao e nao a de outro', async () => {
    const c = await cena();
    const atleta = await conta('atleta');
    const outro = await conta('outro');
    await vincular(c.comunidade, atleta.fichaId, c.dono.userId);
    await vincular(c.comunidade, outro.fichaId, c.dono.userId);
    await como(c.dono.userId, RECORD, [
      randomUUID(),
      randomUUID(),
      c.comunidade,
      atleta.fichaId,
      VERSION,
      { saque: 7 },
    ]);

    const { rows } = await como<{ profile: { contribution_count: number } }>(
      atleta.userId,
      PROFILE,
      [c.comunidade, atleta.fichaId, VERSION],
    );
    assert.equal(rows[0].profile.contribution_count, 1);
    await recusa(atleta.userId, PROFILE, [c.comunidade, outro.fichaId, VERSION]);
  });

  test('quem avalia le a avaliacao de qualquer atleta da comunidade', async () => {
    const c = await cena();
    const atleta = await conta('atleta-2');
    await vincular(c.comunidade, atleta.fichaId, c.dono.userId);
    const { rows } = await como<{ profile: { contribution_count: number } }>(
      c.dono.userId,
      PROFILE,
      [c.comunidade, atleta.fichaId, VERSION],
    );
    assert.equal(rows[0].profile.contribution_count, 0);
  });

  test('a conta troca a propria foto e vale na hora, mesmo com outro owner_id', async () => {
    const c = await cena();
    const atleta = await conta('foto');
    await vincular(c.comunidade, atleta.fichaId, c.dono.userId);
    await client.query('update public.players set owner_id = $1 where id = $2', [
      c.dono.userId,
      atleta.fichaId,
    ]);
    await como(atleta.userId, PROPOSE, [atleta.fichaId, 'https://x.test/eu.png']);
    assert.equal(await fotoDe(atleta.fichaId), 'https://x.test/eu.png');
  });

  test('quem criou a ficha e o admin nao trocam a foto de uma conta', async () => {
    const c = await cena();
    const admin = await membroAdmin(c.comunidade);
    const atleta = await conta('foto-alheia');
    await vincular(c.comunidade, atleta.fichaId, c.dono.userId);
    await client.query('update public.players set owner_id = $1 where id = $2', [
      c.dono.userId,
      atleta.fichaId,
    ]);
    await recusa(c.dono.userId, PROPOSE, [atleta.fichaId, 'https://x.test/dono.png']);
    await recusa(admin.userId, PROPOSE, [atleta.fichaId, 'https://x.test/admin.png']);
    assert.equal(await fotoDe(atleta.fichaId), null);
  });

  test('o admin troca a foto de um convidado e vale na hora', async () => {
    const c = await cena();
    const admin = await membroAdmin(c.comunidade);
    const g = await convidado(c.comunidade, c.dono.userId);
    await como(admin.userId, PROPOSE, [g, 'https://x.test/convidado.png']);
    assert.equal(await fotoDe(g), 'https://x.test/convidado.png');
  });
}
