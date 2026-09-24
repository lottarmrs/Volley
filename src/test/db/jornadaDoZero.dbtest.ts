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
 * A jornada do zero, etapa por etapa, contra o banco de verdade.
 *
 * Cada teste aqui responde UMA pergunta de uma etapa. A etapa seguinte so e
 * escrita depois que a anterior esta respondida -- o objetivo nao e cobrir
 * comandos (as outras suites fazem isso) e sim descobrir onde a jornada trava
 * para uma pessoa real.
 */

if (!isTestDatabaseConfigured()) {
  test(`jornada do zero requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function conta(rotulo: string): Promise<string> {
    const email = `jornada-${rotulo}-${randomUUID()}@test.local`;
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

  const temVinculoAtivo = async (userId: string) =>
    ((
      await client.query(
        `select 1 from public.player_account_links where user_id = $1 and status = 'ACTIVE'`,
        [userId],
      )
    ).rowCount ?? 0) > 0;

  // ── Etapa 2: a pessoa cria a propria comunidade ───────────────────────────

  test('ETAPA 2 — quem cria a comunidade sai dela com ficha de atleta?', async () => {
    const dono = await conta('dono-novo');
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Minha pelada ${randomUUID()}`,
      ]),
    );
    const comunidade = rows[0].id;

    const { rowCount: temFicha } = await client.query(
      'select 1 from public.players where user_id = $1 and deleted_at is null',
      [dono],
    );
    const { rowCount: noElenco } = await client.query(
      `select 1 from public.community_players cp
         join public.players p on p.id = cp.player_id
        where cp.community_id = $1 and p.user_id = $2 and cp.active`,
      [comunidade, dono],
    );

    // Ate 2026-09-24 criar a comunidade dava so a ficha. Agora da as tres:
    // sem elas quem cria a pelada nao joga nela.
    assert.deepEqual(
      { temFicha: temFicha ?? 0, noElenco: noElenco ?? 0, vinculo: await temVinculoAtivo(dono) },
      { temFicha: 1, noElenco: 1, vinculo: true },
      'criar a comunidade faz de quem criou um atleta dela',
    );
  });

  // ── Etapa 3: quem cria a comunidade consegue entrar na propria lista? ─────

  test('ETAPA 3 — quem cria a comunidade consegue entrar na propria lista?', async () => {
    const dono = await conta('dono-lista');
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Minha pelada ${randomUUID()}`,
      ]),
    );
    const comunidade = rows[0].id;
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
        [sessao, comunidade, 'Primeira pelada'],
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

    const { rows: entrou } = await asIdentityCommitting(client, dono, () =>
      client.query<{ entry_status: string }>('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        janela,
      ]),
    );

    assert.equal(
      entrou[0].entry_status,
      'CONFIRMED',
      'quem abriu a pelada entra na propria lista -- era o bloqueio 1 da jornada',
    );
  });

  test('ETAPA 3 — e `ensure_account_ready` resolve isso sozinho?', async () => {
    const pessoa = await conta('ensure');

    const pronto = await asIdentityCommitting(client, pessoa, () =>
      client.query<{ player_id: string }>('select * from public.ensure_account_ready()'),
    );

    assert.ok(pronto.rows[0].player_id, 'cria a ficha');
    assert.equal(
      await temVinculoAtivo(pessoa),
      false,
      'mas nao cria o vinculo: a ficha sozinha nao deixa entrar na lista',
    );
  });

  // -- Etapa 4: existe ALGUM caminho para quem criou virar atleta? -----------

  test('ETAPA 4 — quem pode criar um vinculo de conta, no banco inteiro', async () => {
    const { rows } = await client.query<{ fn: string }>(
      `select n.nspname || '.' || p.proname as fn
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'app_private')
          and p.prokind = 'f'
          and pg_get_functiondef(p.oid) like '%into public.player_account_links%'
        order by 1`,
    );

    // Duas, e as duas so acontecem quando alguem APROVA um pedido de entrada.
    // Nao ha auto-vinculo, nem atribuicao por quem organiza. Consequencia:
    // quem cria a propria comunidade nunca recebe vinculo, porque nao ha
    // pedido de entrada para aprovar.
    assert.deepEqual(
      rows.map((linha) => linha.fn),
      ['app_private.backfill_approved_member_account_links', 'app_private.enroll_approved_member'],
    );
  });

  test('ETAPA 4 — criar a comunidade duas vezes nao duplica nada', async () => {
    const dono = await conta('dono-duplo');
    for (const nome of ['Primeira', 'Segunda']) {
      await asIdentityCommitting(client, dono, () =>
        client.query('select public.create_community_with_owner($1)', [`${nome} ${randomUUID()}`]),
      );
    }

    const { rowCount: vinculos } = await client.query(
      `select 1 from public.player_account_links where user_id = $1 and status = 'ACTIVE'`,
      [dono],
    );
    const { rowCount: fichas } = await client.query(
      'select 1 from public.players where user_id = $1 and deleted_at is null',
      [dono],
    );

    assert.deepEqual({ vinculos, fichas }, { vinculos: 1, fichas: 1 }, 'uma ficha, um vinculo');
  });

  test('ETAPA 4 — a pessoa entra no elenco de CADA comunidade que cria', async () => {
    const dono = await conta('dono-duas');
    const comunidades: string[] = [];
    for (const nome of ['Terca', 'Quinta']) {
      const { rows } = await asIdentityCommitting(client, dono, () =>
        client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
          `${nome} ${randomUUID()}`,
        ]),
      );
      comunidades.push(rows[0].id);
    }

    for (const comunidade of comunidades) {
      const { rowCount } = await client.query(
        `select 1 from public.community_players cp
           join public.players p on p.id = cp.player_id
          where cp.community_id = $1 and p.user_id = $2 and cp.active`,
        [comunidade, dono],
      );
      assert.equal(rowCount, 1, 'o elenco e por comunidade, o vinculo e por conta');
    }
  });
}
