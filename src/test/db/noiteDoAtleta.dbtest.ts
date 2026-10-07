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

const MIGRATION = '20261005120000_sua_noite.sql';
const VERSION = 'v0-legacy-11';
const RECORD = 'select * from public.record_player_evaluation($1,$2,$3,$4,$5,$6)';
const CARD = 'select * from public.get_community_card_stats($1)';
const PENDING = 'select * from public.get_my_pending_night()';
const SEEN = 'select public.mark_my_night_seen($1)';

if (!isTestDatabaseConfigured()) {
  test(`noite do atleta requires ${TEST_DATABASE_URL_VAR}`, () => {
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
      [`noite-${rotulo}-${randomUUID()}@test.local`],
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
      [`Noite ${randomUUID()}`],
    );
    return { comunidade: rows[0].id, dono };
  }

  async function membro(c: { comunidade: string; dono: { userId: string } }, rotulo: string) {
    const pessoa = await conta(rotulo);
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [c.comunidade, pessoa.userId],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active') on conflict (community_id, player_id) do nothing`,
      [c.comunidade, pessoa.fichaId, c.dono.userId],
    );
    return pessoa;
  }

  async function peladaJogada(comunidade: string, dono: string, fichaId: string, diasAtras = 0) {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, community_id, name, date, status, type)
       values ($1, $2, 'Pelada', current_date, 'finished', 'free_play') returning id`,
      [dono, comunidade],
    );
    const sessao = rows[0].id;
    await client.query(
      `insert into public.career_events
         (player_id, community_id, session_id, type, occurred_at, source_key, contract_version)
       values ($1, $2, $3, 'session_played', now() - make_interval(days => $4), $5, 1)`,
      [
        fichaId,
        comunidade,
        sessao,
        diasAtras,
        `player:${fichaId}|session:${sessao}|session_played`,
      ],
    );
    return sessao;
  }

  test('membro le os numeros da carta de outro atleta, sem cobertura nem contagem', async () => {
    const c = await cena();
    const ana = await membro(c, 'ana');
    const bia = await membro(c, 'bia');
    await como(c.dono.userId, RECORD, [
      randomUUID(),
      randomUUID(),
      c.comunidade,
      ana.fichaId,
      VERSION,
      { saque: 7, ataque: 8 },
    ]);

    const { rows } = await como<{ player_id: string; dimension_key: string; value: string }>(
      bia.userId,
      CARD,
      [c.comunidade],
    );
    const daAna = rows.filter((row) => row.player_id === ana.fichaId);
    assert.deepEqual(daAna.map((row) => [row.dimension_key, Number(row.value)]).sort(), [
      ['ataque', 8],
      ['saque', 7],
    ]);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['dimension_key', 'player_id', 'value']);
  });

  test('quem nao e membro nao le os numeros da carta', async () => {
    const c = await cena();
    const estranho = await conta('estranho');
    await recusa(estranho.userId, CARD, [c.comunidade]);
  });

  test('a noite pendente aparece para quem jogou e some depois de vista', async () => {
    const c = await cena();
    const ana = await membro(c, 'ana-noite');
    const sessao = await peladaJogada(c.comunidade, c.dono.userId, ana.fichaId);

    const antes = await como<{ session_id: string; community_id: string }>(ana.userId, PENDING);
    assert.equal(antes.rows.length, 1);
    assert.equal(antes.rows[0].session_id, sessao);
    assert.equal(antes.rows[0].community_id, c.comunidade);

    await como(ana.userId, SEEN, [sessao]);
    await como(ana.userId, SEEN, [sessao]);
    const depois = await como(ana.userId, PENDING);
    assert.equal(depois.rows.length, 0);
  });

  test('so a mais recente, e nada com mais de 7 dias', async () => {
    const c = await cena();
    const ana = await membro(c, 'ana-janela');
    await peladaJogada(c.comunidade, c.dono.userId, ana.fichaId, 9);
    const { rows: vazio } = await como(ana.userId, PENDING);
    assert.equal(vazio.length, 0);

    await peladaJogada(c.comunidade, c.dono.userId, ana.fichaId, 3);
    const recente = await peladaJogada(c.comunidade, c.dono.userId, ana.fichaId, 1);
    const { rows } = await como<{ session_id: string }>(ana.userId, PENDING);
    assert.deepEqual(
      rows.map((row) => row.session_id),
      [recente],
    );
  });

  test('vista a mais recente, a anterior nao volta', async () => {
    const c = await cena();
    const ana = await membro(c, 'ana-anterior');
    await peladaJogada(c.comunidade, c.dono.userId, ana.fichaId, 3);
    const recente = await peladaJogada(c.comunidade, c.dono.userId, ana.fichaId, 1);
    await como(ana.userId, SEEN, [recente]);
    const { rows } = await como(ana.userId, PENDING);
    assert.equal(rows.length, 0);
  });

  test('no mesmo instante, vale a pelada criada por ultimo', async () => {
    const c = await cena();
    const ana = await membro(c, 'ana-empate');
    const velha = await peladaJogada(c.comunidade, c.dono.userId, ana.fichaId);
    const nova = await peladaJogada(c.comunidade, c.dono.userId, ana.fichaId);
    await client.query(
      `update public.sessions
          set created_at = case when id = $1 then now() else now() - interval '1 hour' end
        where id in ($1, $2)`,
      [nova, velha],
    );
    await client.query(
      `update public.career_events set occurred_at = date_trunc('day', now())
        where session_id in ($1, $2)`,
      [nova, velha],
    );
    const { rows } = await como<{ session_id: string }>(ana.userId, PENDING);
    assert.deepEqual(
      rows.map((row) => row.session_id),
      [nova],
    );
  });

  test('quem nao jogou nao tem a noite nem marca a de outro', async () => {
    const c = await cena();
    const ana = await membro(c, 'ana-jogou');
    const bia = await membro(c, 'bia-nao-jogou');
    const sessao = await peladaJogada(c.comunidade, c.dono.userId, ana.fichaId);

    const { rows } = await como(bia.userId, PENDING);
    assert.equal(rows.length, 0);
    await recusa(bia.userId, SEEN, [sessao]);
    const { rows: views } = await client.query(
      'select 1 from public.athlete_night_views where session_id = $1',
      [sessao],
    );
    assert.equal(views.length, 0);
  });
}
