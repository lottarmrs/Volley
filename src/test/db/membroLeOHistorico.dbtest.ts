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

const MIGRATION = '20260930120000_membro_le_o_historico.sql';

if (!isTestDatabaseConfigured()) {
  test(`membro le o historico requires ${TEST_DATABASE_URL_VAR}`, () => {
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
      [`historico-${rotulo}-${randomUUID()}@test.local`],
    );
    const id = rows[0].id;
    await como(id, 'select * from public.ensure_account_ready($1)', [
      `u${randomUUID().slice(0, 8)}`,
    ]);
    return id;
  }

  async function entra(comunidade: string, papel: string, status = 'active') {
    const id = await conta(papel);
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, $3, $4)`,
      [comunidade, id, papel, status],
    );
    return id;
  }

  async function pelada(dono: string, comunidade: string, status: string) {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, community_id, name, date, status, type)
       values ($1, $2, 'Pelada', '2030-01-01', $3, 'free_play') returning id`,
      [dono, comunidade, status],
    );
    const sessao = rows[0].id;
    const { rows: times } = await client.query<{ id: string }>(
      `insert into public.teams (owner_id, community_id, session_id, name)
       values ($1, $2, $3, 'Time A') returning id`,
      [dono, comunidade, sessao],
    );
    const { rows: jogos } = await client.query<{ id: string }>(
      `insert into public.games (
         owner_id, community_id, session_id, type, sequence_number, team_a_id, team_b_id, status
       ) values ($1, $2, $3, 'free_play', 1, 'team-a', 'team-b', 'finished') returning id`,
      [dono, comunidade, sessao],
    );
    const { rows: pontos } = await client.query<{ id: string }>(
      `insert into public.point_events (
         owner_id, community_id, session_id, game_id, sequence_number,
         scoring_team_id, conceding_team_id, occurred_at
       ) values ($1, $2, $3, $4, 1, 'team-a', 'team-b', now()) returning id`,
      [dono, comunidade, sessao, jogos[0].id],
    );
    return { sessao, time: times[0].id, jogo: jogos[0].id, ponto: pontos[0].id };
  }

  async function cena() {
    const dono = await conta('dono');
    const { rows } = await como<{ id: string }>(
      dono,
      'select public.create_community_with_owner($1) as id',
      [`Historico ${randomUUID()}`],
    );
    return { dono, comunidade: rows[0].id };
  }

  async function ve(ator: string, tabela: string, id: string) {
    const { rows } = await como(ator, `select id from public.${tabela} where id = $1`, [id]);
    return rows.length === 1;
  }

  async function recusa(ator: string, sql: string, args: unknown[], mensagem: RegExp) {
    await assert.rejects(como(ator, sql, args), (erro: { code?: string; message?: string }) => {
      assert.equal(erro.code, '42501');
      assert.match(erro.message ?? '', mensagem);
      return true;
    });
  }

  test('o membro le a pelada encerrada com times, jogos e pontos', async () => {
    const c = await cena();
    const membro = await entra(c.comunidade, 'member');
    const p = await pelada(c.dono, c.comunidade, 'finished');
    assert.equal(await ve(membro, 'sessions', p.sessao), true);
    assert.equal(await ve(membro, 'teams', p.time), true);
    assert.equal(await ve(membro, 'games', p.jogo), true);
    assert.equal(await ve(membro, 'point_events', p.ponto), true);
  });

  test('o membro nao le o rascunho nem o time dele', async () => {
    const c = await cena();
    const membro = await entra(c.comunidade, 'member');
    const p = await pelada(c.dono, c.comunidade, 'draft');
    assert.equal(await ve(membro, 'sessions', p.sessao), false);
    assert.equal(await ve(membro, 'teams', p.time), false);
  });

  test('quem e de fora nao le a pelada encerrada', async () => {
    const c = await cena();
    const fora = await conta('fora');
    const p = await pelada(c.dono, c.comunidade, 'finished');
    assert.equal(await ve(fora, 'sessions', p.sessao), false);
    assert.equal(await ve(fora, 'games', p.jogo), false);
  });

  test('admin e moderador leem o rascunho', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');
    const moderador = await entra(c.comunidade, 'moderator');
    const p = await pelada(c.dono, c.comunidade, 'draft');
    assert.equal(await ve(admin, 'sessions', p.sessao), true);
    assert.equal(await ve(moderador, 'teams', p.time), true);
  });

  test('membro pendente (ainda nao aprovado) nao le', async () => {
    const c = await cena();
    const pendente = await entra(c.comunidade, 'member', 'pending');
    const p = await pelada(c.dono, c.comunidade, 'finished');
    assert.equal(await ve(pendente, 'sessions', p.sessao), false);
  });

  test('so o dono apaga historico; quem criou descarta o proprio rascunho', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');
    const organizador = await entra(c.comunidade, 'organizador');
    const encerrada = await pelada(c.dono, c.comunidade, 'finished');
    const apagar = 'update public.sessions set deleted_at = now() where id = $1';
    await recusa(admin, apagar, [encerrada.sessao], /Only the Community owner can delete history/);
    const { rowCount: doOrganizador } = await como(organizador, apagar, [encerrada.sessao]);
    assert.equal(doOrganizador, 0);
    const { rowCount } = await como(c.dono, apagar, [encerrada.sessao]);
    assert.equal(rowCount, 1);

    const rascunho = await pelada(admin, c.comunidade, 'draft');
    const { rowCount: descartou } = await como(admin, apagar, [rascunho.sessao]);
    assert.equal(descartou, 1);
  });

  test('so o dono apaga convidado; o admin desativa', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');
    const convidado = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active) values ($1, $2, 'Convidado', true)`,
      [convidado, admin],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [c.comunidade, convidado, c.dono],
    );
    await recusa(
      admin,
      'update public.players set deleted_at = now() where id = $1',
      [convidado],
      /Only the Community owner can delete a guest/,
    );
    const { rowCount: desativou } = await como(
      admin,
      'update public.players set active = false where id = $1',
      [convidado],
    );
    assert.equal(desativou, 1);
    const { rowCount: apagou } = await como(
      c.dono,
      'update public.players set deleted_at = now() where id = $1',
      [convidado],
    );
    assert.equal(apagou, 1);
  });
}
