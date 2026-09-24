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
 * Coerencia entre as partes que a inscricao encosta.
 *
 * As suites existentes provam cada comando isolado. Esta procura o que NAO
 * conversa: o cargo legado contra a responsabilidade nova, o repasse contra a
 * lista ja aberta, o vinculo de atleta contra a participacao na comunidade, o
 * ciclo de vida da sessao contra a janela.
 */

if (!isTestDatabaseConfigured()) {
  test(`registration coherence requires ${TEST_DATABASE_URL_VAR}`, () => {
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
    const email = `coerencia-${rotulo}-${randomUUID()}@test.local`;
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id, email) values ($1, $2) on conflict do nothing',
      [rows[0].id, email],
    );
    return rows[0].id;
  }

  function comoAal2(actor: string, sql: string, args: unknown[] = []) {
    return asIdentityCommitting(client, actor, async () => {
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: actor, role: 'authenticated', aal: 'aal2' }),
      ]);
      return client.query(sql, args);
    });
  }

  const erroDe = (promessa: Promise<unknown>) =>
    promessa.then(
      () => null,
      (thrown: Error & { code?: string }) => thrown,
    );

  async function comunidadeAlvo(dono: string) {
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Coerencia ${randomUUID()}`,
      ]),
    );
    return rows[0].id;
  }

  /** Comunidade legada: e so nela que o espelho de `community_members` age. */
  async function comunidadeLegada(dono: string) {
    const { rows } = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id) values ($1, $2) returning id',
      [`Legada ${randomUUID()}`, dono],
    );
    return rows[0].id;
  }

  async function daResponsabilidade(comunidade: string, userId: string) {
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [comunidade, userId],
    );
  }

  async function membro(comunidade: string, userId: string) {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [comunidade, userId],
    );
  }

  /** Cria o atleta e o vincula a conta -- o que join_registration exige. */
  async function viraAtleta(comunidade: string, userId: string, dono: string) {
    const pronto = await asIdentityCommitting(client, userId, () =>
      client.query<{ player_id: string }>('select * from public.ensure_account_ready()'),
    );
    const playerId = pronto.rows[0].player_id;
    await client.query(
      `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
       select $1, $2, 'ACTIVE', 'SELF_CLAIM', now()
        where not exists (
          select 1 from public.player_account_links where user_id = $2 and status = 'ACTIVE'
        )`,
      [playerId, userId],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')
       on conflict (community_id, player_id) do nothing`,
      [comunidade, playerId, dono],
    );
    return playerId;
  }

  async function sessaoComJanelaAberta(comunidade: string, organizador: string, capacidade = 4) {
    const sessao = randomUUID();
    await asIdentityCommitting(client, organizador, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [sessao, comunidade, 'Pelada de quinta'],
      ),
    );
    const janela = randomUUID();
    await asIdentityCommitting(client, organizador, () =>
      client.query('select * from public.create_registration_window($1,$2,$3,$4,null)', [
        randomUUID(),
        janela,
        sessao,
        capacidade,
      ]),
    );
    await asIdentityCommitting(client, organizador, () =>
      client.query('select * from public.open_registration($1,$2,$3)', [randomUUID(), janela, 1]),
    );
    return { sessao, janela };
  }

  const entrar = (userId: string, janela: string) =>
    asIdentityCommitting(client, userId, () =>
      client.query<{ entry_status: string }>('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        janela,
      ]),
    );

  const temOrganizer = async (comunidade: string, userId: string) =>
    (
      await client.query(
        `select 1 from public.community_responsibilities
          where community_id = $1 and user_id = $2
            and responsibility = 'ORGANIZER' and revoked_at is null`,
        [comunidade, userId],
      )
    ).rowCount ?? 0;

  // -- 1. Participar da comunidade nao basta: falta o vinculo de atleta -------
  test('membro ativo SEM atleta e recusado, e a recusa nao e a mesma de quem nao e membro', async () => {
    const dono = await usuario('dono1');
    const comunidade = await comunidadeAlvo(dono);
    await daResponsabilidade(comunidade, dono);
    const { janela } = await sessaoComJanelaAberta(comunidade, dono);

    const semAtleta = await usuario('sem-atleta');
    await membro(comunidade, semAtleta);
    const deFora = await usuario('de-fora');

    const recusaSemAtleta = await erroDe(entrar(semAtleta, janela));
    const recusaDeFora = await erroDe(entrar(deFora, janela));

    assert.equal(recusaSemAtleta?.code, '42501');
    assert.equal(recusaDeFora?.code, '42501');
    assert.match(String(recusaSemAtleta?.message), /Player account link/i);
    assert.match(String(recusaDeFora?.message), /active member/i);
    assert.notEqual(
      recusaSemAtleta?.message,
      recusaDeFora?.message,
      'o servidor separa os dois casos; quem consome so pelo codigo 42501 os confunde',
    );
  });

  test('com o vinculo de atleta o mesmo membro entra, sem mais nada mudar', async () => {
    const dono = await usuario('dono2');
    const comunidade = await comunidadeAlvo(dono);
    await daResponsabilidade(comunidade, dono);
    const { janela } = await sessaoComJanelaAberta(comunidade, dono);

    const pessoa = await usuario('pessoa');
    await membro(comunidade, pessoa);
    assert.equal((await erroDe(entrar(pessoa, janela)))?.code, '42501');

    await viraAtleta(comunidade, pessoa, dono);
    const { rows } = await entrar(pessoa, janela);
    assert.equal(rows[0].entry_status, 'CONFIRMED');
  });

  test('estar no elenco da comunidade e uma TERCEIRA exigencia, com recusa propria', async () => {
    const dono = await usuario('dono3');
    const comunidade = await comunidadeAlvo(dono);
    await daResponsabilidade(comunidade, dono);
    const { janela } = await sessaoComJanelaAberta(comunidade, dono);

    const pessoa = await usuario('fora-do-elenco');
    await membro(comunidade, pessoa);
    const pronto = await asIdentityCommitting(client, pessoa, () =>
      client.query<{ player_id: string }>('select * from public.ensure_account_ready()'),
    );
    await client.query(
      `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
       values ($1, $2, 'ACTIVE', 'SELF_CLAIM', now())`,
      [pronto.rows[0].player_id, pessoa],
    );

    const resultado = await erroDe(entrar(pessoa, janela));
    assert.notEqual(
      resultado,
      null,
      'estar na comunidade e ter conta de atleta nao basta: falta estar no elenco',
    );
    assert.match(String(resultado?.message), /not on this Community's roster/i);
  });

  // -- 2. Cargo legado contra responsabilidade nova ---------------------------
  test('tirar a organizacao de quem a recebeu pelo cargo legado deixa os dois modelos discordando', async () => {
    const dono = await usuario('dono4');
    const comunidade = await comunidadeLegada(dono);
    const pessoa = await usuario('cargo-legado');

    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'organizador', 'active')`,
      [comunidade, pessoa],
    );
    assert.equal(await temOrganizer(comunidade, pessoa), 1, 'o espelho concede pelo cargo');

    await comoAal2(dono, 'select public.set_community_organizer($1,$2,$3)', [
      comunidade,
      pessoa,
      false,
    ]);

    assert.equal(await temOrganizer(comunidade, pessoa), 0, 'a responsabilidade foi tirada');
    const { rows: cargo } = await client.query<{ role: string }>(
      'select role from public.community_members where community_id = $1 and user_id = $2',
      [comunidade, pessoa],
    );
    assert.equal(cargo[0].role, 'organizador', 'mas o cargo legado continua dizendo o contrario');

    const { rows: desvio } = await client.query<{ issue: string }>(
      'select issue from app_private.community_membership_drift() where user_id = $1',
      [pessoa],
    );
    assert.deepEqual(
      desvio.map((linha) => linha.issue),
      ['MISSING_ORGANIZER'],
      'o proprio detector do repositorio acusa a discordancia',
    );
  });

  test('qualquer toque no cargo legado devolve a responsabilidade que o painel tinha tirado', async () => {
    const dono = await usuario('dono5');
    const comunidade = await comunidadeLegada(dono);
    const pessoa = await usuario('devolvida');

    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'organizador', 'active')`,
      [comunidade, pessoa],
    );
    await comoAal2(dono, 'select public.set_community_organizer($1,$2,$3)', [
      comunidade,
      pessoa,
      false,
    ]);
    assert.equal(await temOrganizer(comunidade, pessoa), 0);

    await client.query(
      `update public.community_members set role = 'member' where community_id = $1 and user_id = $2`,
      [comunidade, pessoa],
    );
    await client.query(
      `update public.community_members set role = 'organizador' where community_id = $1 and user_id = $2`,
      [comunidade, pessoa],
    );

    assert.equal(
      await temOrganizer(comunidade, pessoa),
      1,
      'o espelho reconcede, entao tirar pelo painel novo nao se sustenta sozinho',
    );
  });

  test('derrubar o cargo junto faz a remocao parar de pe', async () => {
    const dono = await usuario('dono5b');
    const comunidade = await comunidadeLegada(dono);
    const pessoa = await usuario('removida-de-vez');

    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'organizador', 'active')`,
      [comunidade, pessoa],
    );

    // A ordem que o painel usa: derruba o cargo e so entao tira a
    // responsabilidade. O espelho ja revoga no primeiro passo.
    await client.query(
      `update public.community_members set role = 'member' where community_id = $1 and user_id = $2`,
      [comunidade, pessoa],
    );
    await comoAal2(dono, 'select public.set_community_organizer($1,$2,$3)', [
      comunidade,
      pessoa,
      false,
    ]);

    assert.equal(await temOrganizer(comunidade, pessoa), 0);
    const { rows: desvio } = await client.query<{ issue: string }>(
      'select issue from app_private.community_membership_drift() where user_id = $1',
      [pessoa],
    );
    assert.deepEqual(desvio, [], 'sem cargo e sem responsabilidade, os dois modelos concordam');
  });

  // -- 3. Repasse contra lista ja aberta --------------------------------------
  test('depois do repasse, quem recebeu mexe na lista que a outra pessoa abriu', async () => {
    const dono = await usuario('dono6');
    const comunidade = await comunidadeAlvo(dono);
    await daResponsabilidade(comunidade, dono);
    const { sessao, janela } = await sessaoComJanelaAberta(comunidade, dono);

    const substituto = await usuario('substituto');
    await membro(comunidade, substituto);
    await comoAal2(dono, 'select public.set_community_organizer($1,$2,$3)', [
      comunidade,
      substituto,
      true,
    ]);
    const { rows: rev } = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [sessao],
    );
    await comoAal2(dono, 'select * from public.assign_target_session_organizer($1,$2,$3,$4,$5)', [
      randomUUID(),
      randomUUID(),
      sessao,
      rev[0].revision,
      substituto,
    ]);

    assert.equal(
      await erroDe(
        asIdentityCommitting(client, substituto, () =>
          client.query('select * from public.change_registration_capacity($1::uuid,$2::uuid,$3)', [
            randomUUID(),
            janela,
            10,
          ]),
        ),
      ),
      null,
      'quem recebeu a pelada opera a lista que ja existia',
    );
  });

  test('tirar a responsabilidade de quem organiza tranca a lista aberta no meio do caminho', async () => {
    const dono = await usuario('dono7');
    const comunidade = await comunidadeAlvo(dono);
    await daResponsabilidade(comunidade, dono);
    const { janela } = await sessaoComJanelaAberta(comunidade, dono);

    await comoAal2(dono, 'select public.set_community_organizer($1,$2,$3)', [
      comunidade,
      dono,
      false,
    ]);

    const recusa = await erroDe(
      asIdentityCommitting(client, dono, () =>
        client.query('select * from public.change_registration_capacity($1::uuid,$2::uuid,$3)', [
          randomUUID(),
          janela,
          10,
        ]),
      ),
    );
    assert.equal(
      recusa?.code,
      '42501',
      'a atribuicao na sessao continua de pe, mas o portao exige a responsabilidade da comunidade',
    );
  });

  // -- 4. Ciclo de vida da sessao contra a janela -----------------------------
  test('sessao que ja comecou nao aceita mais ninguem, mesmo com a janela OPEN', async () => {
    const dono = await usuario('dono8');
    const comunidade = await comunidadeAlvo(dono);
    await daResponsabilidade(comunidade, dono);
    const { sessao, janela } = await sessaoComJanelaAberta(comunidade, dono);

    const pessoa = await usuario('atrasada');
    await membro(comunidade, pessoa);
    await viraAtleta(comunidade, pessoa, dono);

    await client.query(
      `update public.sessions
          set lifecycle_status = 'IN_PROGRESS', actual_started_at = now()
        where id = $1`,
      [sessao],
    );

    const recusa = await erroDe(entrar(pessoa, janela));
    assert.equal(recusa?.code, '23514');
    assert.match(String(recusa?.message), /DRAFT or SCHEDULED/i);

    const { rows } = await client.query<{ status: string }>(
      'select status from public.registration_windows where id = $1',
      [janela],
    );
    assert.equal(
      rows[0].status,
      'OPEN',
      'a janela continua anunciando OPEN: quem le so o status da janela mente para o atleta',
    );
  });
}
