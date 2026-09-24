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

/**
 * A pessoa aprovada na comunidade consegue entrar na lista?
 *
 * Existem DUAS formas de dizer "esta conta e este atleta":
 *
 *   * `players.user_id` -- o que `build_registration_board` le para o
 *     `viewer_player_id`, ou seja, o que a TELA mostra;
 *   * `player_account_links` com status ACTIVE -- o que
 *     `current_user_active_player_id()` le, ou seja, o que o COMANDO exige.
 *
 * Ate 2026-09-24 `enroll_approved_member` (chamado por `approve_join_request`)
 * criava a primeira e nao a segunda: a pessoa aprovada se via como atleta na
 * tela e era recusada ao entrar na lista. Agora cria as duas, e esta suite
 * guarda isso.
 */

if (!isTestDatabaseConfigured()) {
  test(`approved member join requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
  });

  test.after(async () => {
    await client?.end();
  });

  async function usuario(rotulo: string): Promise<string> {
    const email = `aprovado-${rotulo}-${randomUUID()}@test.local`;
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id, email, name) values ($1, $2, $3) on conflict do nothing',
      [rows[0].id, email, `Pessoa ${rotulo}`],
    );
    return rows[0].id;
  }

  /** Comunidade legada: e o caminho que `approve_join_request` cobre. */
  async function cena() {
    const dono = await usuario('dono');
    const { rows } = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id, join_code) values ($1, $2, $3) returning id',
      [`Aprovacao ${randomUUID()}`, dono, randomUUID().slice(0, 6).toUpperCase()],
    );
    const comunidade = rows[0].id;
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'owner', 'active')
       on conflict (community_id, user_id) do update
         set role = 'owner', status = 'active'`,
      [comunidade, dono],
    );
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [comunidade, dono],
    );

    const sessao = randomUUID();
    await asIdentityCommitting(client, dono, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [sessao, comunidade, 'Pelada de quinta'],
      ),
    );
    const janela = randomUUID();
    await asIdentityCommitting(client, dono, () =>
      client.query('select * from public.create_registration_window($1,$2,$3,$4,null)', [
        randomUUID(),
        janela,
        sessao,
        12,
      ]),
    );
    await asIdentityCommitting(client, dono, () =>
      client.query('select * from public.open_registration($1,$2,$3)', [randomUUID(), janela, 1]),
    );

    return { dono, comunidade, sessao, janela };
  }

  /** O caminho real: a pessoa pede pelo codigo e quem administra aprova. */
  async function entraEAprovada(comunidade: string, dono: string) {
    const pessoa = await usuario('nova');
    const { rows: codigo } = await client.query<{ join_code: string }>(
      'select join_code from public.communities where id = $1',
      [comunidade],
    );
    await asIdentityCommitting(client, pessoa, () =>
      client.query('select public.request_to_join_community($1)', [codigo[0].join_code]),
    );
    const { rows: pedido } = await client.query<{ id: string }>(
      'select id from public.community_members where community_id = $1 and user_id = $2',
      [comunidade, pessoa],
    );
    await asIdentityCommitting(client, dono, () =>
      client.query('select public.approve_join_request($1)', [pedido[0].id]),
    );
    return pessoa;
  }

  test('a aprovacao ja cria o atleta e o poe no elenco', async () => {
    const { comunidade, dono } = await cena();
    const pessoa = await entraEAprovada(comunidade, dono);

    const { rows: atleta } = await client.query<{ id: string }>(
      'select id from public.players where user_id = $1',
      [pessoa],
    );
    assert.equal(atleta.length, 1, 'enroll_approved_member cria o atleta');

    const { rowCount: noElenco } = await client.query(
      `select 1 from public.community_players
        where community_id = $1 and player_id = $2 and active`,
      [comunidade, atleta[0].id],
    );
    assert.equal(noElenco, 1, 'e o poe no elenco');
  });

  test('e cria o vinculo de conta que o comando exige', async () => {
    const { comunidade, dono } = await cena();
    const pessoa = await entraEAprovada(comunidade, dono);

    const { rows } = await client.query<{ provenance: string }>(
      `select provenance from public.player_account_links
        where user_id = $1 and status = 'ACTIVE'`,
      [pessoa],
    );
    assert.equal(rows.length, 1, 'sem isto o join_registration recusa');
    assert.equal(
      rows[0].provenance,
      'ORGANIZER_ASSIGNED',
      'foi quem administra que aprovou a entrada',
    );
  });

  test('aprovar de novo nao duplica o vinculo, que tem unicidade parcial', async () => {
    const { comunidade, dono } = await cena();
    const pessoa = await entraEAprovada(comunidade, dono);

    const { rows: pedido } = await client.query<{ id: string }>(
      'select id from public.community_members where community_id = $1 and user_id = $2',
      [comunidade, pessoa],
    );
    await asIdentityCommitting(client, dono, () =>
      client.query('select public.approve_join_request($1)', [pedido[0].id]),
    );

    const { rowCount } = await client.query(
      `select 1 from public.player_account_links where user_id = $1 and status = 'ACTIVE'`,
      [pessoa],
    );
    assert.equal(rowCount, 1);
  });

  test('vinculo que a pessoa ja tinha nao e reescrito pela aprovacao', async () => {
    const { comunidade, dono } = await cena();

    // Ha uma ficha por conta (`players_user_id_unique_idx`), entao o caso real
    // e a pessoa ja ter reivindicado a propria ficha antes de pedir entrada.
    const pessoa = await usuario('ja-vinculada');
    const pronto = await asIdentityCommitting(client, pessoa, () =>
      client.query<{ player_id: string }>('select * from public.ensure_account_ready()'),
    );
    const fichaPropria = pronto.rows[0].player_id;
    await client.query(
      `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
       values ($1, $2, 'ACTIVE', 'SELF_CLAIM', now())`,
      [fichaPropria, pessoa],
    );

    const { rows: codigo } = await client.query<{ join_code: string }>(
      'select join_code from public.communities where id = $1',
      [comunidade],
    );
    await asIdentityCommitting(client, pessoa, () =>
      client.query('select public.request_to_join_community($1)', [codigo[0].join_code]),
    );
    const { rows: pedido } = await client.query<{ id: string }>(
      'select id from public.community_members where community_id = $1 and user_id = $2',
      [comunidade, pessoa],
    );
    await asIdentityCommitting(client, dono, () =>
      client.query('select public.approve_join_request($1)', [pedido[0].id]),
    );

    const { rows } = await client.query<{ player_id: string; provenance: string }>(
      `select player_id, provenance from public.player_account_links
        where user_id = $1 and status = 'ACTIVE'`,
      [pessoa],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].player_id, fichaPropria, 'o vinculo que ela ja tinha fica de pe');
    assert.equal(rows[0].provenance, 'SELF_CLAIM', 'a aprovacao nao reescreve a origem');
  });

  test('o que a tela mostra e o que o comando exige passam a concordar', async () => {
    const { comunidade, dono, sessao, janela } = await cena();
    const pessoa = await entraEAprovada(comunidade, dono);

    const { rows: quadro } = await asIdentityCommitting(client, pessoa, () =>
      client.query<{ result: Record<string, unknown> }>(
        'select public.read_session_registration($1) as result',
        [sessao],
      ),
    );
    assert.notEqual(quadro[0].result.viewer_player_id, null, 'a tela diz que ela e atleta');

    const { rows } = await asIdentityCommitting(client, pessoa, () =>
      client.query<{ entry_status: string }>('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        janela,
      ]),
    );
    assert.equal(rows[0].entry_status, 'CONFIRMED', 'e a lista concorda');
  });

  test('a jornada inteira, do pedido de entrada ate a vaga, sem ninguem mexer no banco', async () => {
    const { comunidade, dono, janela } = await cena();

    const pessoa = await entraEAprovada(comunidade, dono);
    const { rows } = await asIdentityCommitting(client, pessoa, () =>
      client.query<{ entry_status: string }>('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        janela,
      ]),
    );

    assert.equal(rows[0].entry_status, 'CONFIRMED');
  });
}
