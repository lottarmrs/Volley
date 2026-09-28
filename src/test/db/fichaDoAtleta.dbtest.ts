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

  async function recusa(
    actor: string,
    sql: string,
    args: unknown[],
    codigo: string,
    mensagem?: RegExp,
  ) {
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

  const GRAVA = 'select public.update_my_athlete_profile($1,$2,$3,$4,$5,$6,$7,$8) as estado';
  const valido = ['M', 'ponteiro', 182, 'direita', 'Zé', ['oposto'], null, null];

  test('grava a propria ficha e devolve ready', async () => {
    const id = await conta('grava');
    const { rows } = await como<{ estado: string }>(id, GRAVA, valido);
    assert.equal(rows[0].estado, 'ready');
    const ficha = await fichaDe(id);
    assert.equal(ficha.gender, 'M');
    assert.equal(ficha.primary_position, 'ponteiro');
    assert.equal(Number(ficha.height), 182);
    assert.equal(ficha.dominant_hand, 'direita');
    assert.equal(ficha.nickname, 'Zé');
    assert.deepEqual(ficha.secondary_positions, ['oposto']);
  });

  test('cada campo invalido e recusado com a propria mensagem', async () => {
    const id = await conta('invalido');
    const casos: Array<[number, unknown, RegExp]> = [
      [0, 'X', /gender/i],
      [0, null, /gender/i],
      [1, 'goleiro', /primary position/i],
      [1, null, /primary position/i],
      [2, 119, /height/i],
      [2, 231, /height/i],
      [2, null, /height/i],
      [3, 'ambas', /dominant hand/i],
      [3, null, /dominant hand/i],
      [5, ['goleiro'], /secondary/i],
      [5, ['oposto', 'oposto'], /secondary/i],
      [5, ['ponteiro'], /secondary/i],
    ];
    for (const [indice, valor, mensagem] of casos) {
      const args = [...valido];
      args[indice] = valor;
      await recusa(id, GRAVA, args, '23514', mensagem);
    }
  });

  test('apelido e limitacao em branco viram null; nulos preservam lesionado e presenca', async () => {
    const id = await conta('branco');
    await client.query(
      `update public.players
          set status = '{"lesionado": true, "limitacaoFisica": "joelho", "presencaFrequente": true}'
        where user_id = $1`,
      [id],
    );
    await como(id, GRAVA, ['F', 'central', 175, 'esquerda', '  ', [], null, null]);
    let ficha = await fichaDe(id);
    assert.equal(ficha.nickname, null);
    assert.deepEqual(ficha.status, {
      lesionado: true,
      limitacaoFisica: 'joelho',
      presencaFrequente: true,
    });

    await como(id, GRAVA, ['F', 'central', 175, 'esquerda', null, [], false, '  ']);
    ficha = await fichaDe(id);
    assert.deepEqual(ficha.status, {
      lesionado: false,
      limitacaoFisica: null,
      presencaFrequente: true,
    });
  });

  test('a RPC nunca grava em outra ficha', async () => {
    const a = await conta('a');
    const b = await conta('b');
    await como(a, GRAVA, valido);
    assert.equal((await fichaDe(b)).gender, null);
  });

  test('sem ficha para a conta, P0002', async () => {
    const id = await conta('sem-ficha');
    await client.query('set session_replication_role = replica');
    try {
      await client.query('delete from public.players where user_id = $1', [id]);
    } finally {
      await client.query('set session_replication_role = origin');
    }
    await recusa(id, GRAVA, valido, 'P0002');
  });

  async function comunidadeCom(atletaUserId: string) {
    const dono = await conta('dono-com');
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Ficha ${randomUUID()}`,
      ]),
    );
    const comunidade = rows[0].id;
    const ficha = await fichaDe(atletaUserId);
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [comunidade, ficha.id, dono],
    );
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'owner', 'active') on conflict do nothing`,
      [comunidade, dono],
    );
    return { comunidade, dono, fichaId: ficha.id };
  }

  test('dono da comunidade nao altera nenhuma coluna de ficha com conta', async () => {
    const atleta = await conta('atleta-com');
    const c = await comunidadeCom(atleta);
    for (const sql of [
      "update public.players set gender = 'F' where id = $1",
      "update public.players set status = '{\"lesionado\": true}' where id = $1",
      'update public.players set active = false where id = $1',
    ]) {
      const { rowCount } = await como(c.dono, sql, [c.fichaId]);
      assert.equal(rowCount, 0, sql);
    }
  });

  test('o atleta altera a propria ficha, mesmo quando outra conta e o owner_id', async () => {
    const atleta = await conta('dono-outro');
    const organizador = await conta('organizador');
    const { id } = await fichaDe(atleta);
    await client.query('update public.players set owner_id = $1 where id = $2', [organizador, id]);
    const { rowCount } = await como(atleta, "update public.players set nickname = 'Eu' where id = $1", [id]);
    assert.equal(rowCount, 1);
    const { rowCount: doOrganizador } = await como(
      organizador,
      "update public.players set nickname = 'Outro' where id = $1",
      [id],
    );
    assert.equal(doOrganizador, 0, 'owner_id nao basta quando a ficha tem conta');
  });

  test('ficha sem conta continua editavel por dono da comunidade e pelo owner_id', async () => {
    const dono = await conta('dono-sem');
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Sem conta ${randomUUID()}`,
      ]),
    );
    const comunidade = rows[0].id;
    const criador = await conta('criador');
    const fichaId = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active) values ($1, $2, 'Convidado', true)`,
      [fichaId, criador],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [comunidade, fichaId, dono],
    );
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'owner', 'active') on conflict do nothing`,
      [comunidade, dono],
    );
    assert.equal((await como(criador, "update public.players set gender = 'F' where id = $1", [fichaId])).rowCount, 1);
    assert.equal((await como(dono, "update public.players set gender = 'M' where id = $1", [fichaId])).rowCount, 1);
  });
}
