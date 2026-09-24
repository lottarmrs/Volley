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
 * O repasse da organização de uma pelada.
 *
 * Cenário real: quem abriu a lista na segunda não vai na quinta. A cadeia usa
 * dois comandos que já existem -- `set_community_organizer` concede a
 * responsabilidade, `assign_target_session_organizer` amarra a pessoa àquela
 * sessão -- e nenhuma regra de autorização muda.
 *
 * Esta suíte fixa o que cada passo exige, incluindo a consequência incômoda:
 * `session.manage` vem só da responsabilidade ORGANIZER, então o dono precisa
 * tê-la para delegar, mesmo quando delega a outra pessoa.
 */

if (!isTestDatabaseConfigured()) {
  test(`organizer handover requires ${TEST_DATABASE_URL_VAR}`, () => {
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
    const email = `repasse-${rotulo}-${randomUUID()}@test.local`;
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

  /** Roda como a identidade, com AAL2 satisfeito pelo claim que require_aal2 lê. */
  function comoAal2(actor: string, sql: string, args: unknown[] = []) {
    return asIdentityCommitting(client, actor, async () => {
      await client.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: actor, role: 'authenticated', aal: 'aal2' }),
      ]);
      return client.query(sql, args);
    });
  }

  function semAal2(actor: string, sql: string, args: unknown[] = []) {
    return asIdentityCommitting(client, actor, () => client.query(sql, args));
  }

  async function cena() {
    const dono = await usuario('dono');
    const organizador = await usuario('organizador');
    const substituto = await usuario('substituto');

    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Repasse ${randomUUID()}`,
      ]),
    );
    const comunidade = rows[0].id;

    for (const userId of [organizador, substituto]) {
      await client.query(
        `insert into public.community_memberships (community_id, user_id, role, status)
         values ($1, $2, 'member', 'active')
         on conflict (community_id, user_id) do update set status = 'active'`,
        [comunidade, userId],
      );
    }

    // Quem abriu a pelada: tem a responsabilidade e criou a sessao.
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [comunidade, organizador],
    );
    const sessao = randomUUID();
    await asIdentityCommitting(client, organizador, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [sessao, comunidade, 'Pelada de quinta'],
      ),
    );

    return { comunidade, sessao, dono, organizador, substituto };
  }

  const revisaoDaSessao = async (sessao: string) =>
    (
      await client.query<{ revision: number }>(
        'select revision from public.sessions where id = $1',
        [sessao],
      )
    ).rows[0].revision;

  function atribuir(actor: string, sessao: string, alvo: string, revisao: number) {
    return comoAal2(actor, 'select * from public.assign_target_session_organizer($1,$2,$3,$4,$5)', [
      randomUUID(),
      randomUUID(),
      sessao,
      revisao,
      alvo,
    ]);
  }

  const organizaAgora = async (sessao: string, userId: string) =>
    (
      await client.query(
        `select 1 from public.session_organizer_assignments
          where session_id = $1 and organizer_user_id = $2 and revoked_at is null`,
        [sessao, userId],
      )
    ).rowCount ?? 0;

  test('o dono sozinho nao consegue atribuir: session.manage vem da responsabilidade', async () => {
    const { sessao, dono, substituto } = await cena();

    const erro = await atribuir(dono, sessao, substituto, await revisaoDaSessao(sessao)).catch(
      (thrown: Error & { code?: string }) => thrown,
    );

    assert.ok(erro instanceof Error, 'o dono sem ORGANIZER e recusado');
    assert.equal((erro as { code?: string }).code, '42501');
  });

  test('o dono assume a pelada: concede a si mesmo e se atribui', async () => {
    const { comunidade, sessao, dono } = await cena();

    await comoAal2(dono, 'select public.set_community_organizer($1,$2,true)', [comunidade, dono]);
    await atribuir(dono, sessao, dono, await revisaoDaSessao(sessao));

    assert.equal(await organizaAgora(sessao, dono), 1, 'o dono passa a organizar a sessao');
  });

  test('o dono passa a pelada para outro membro', async () => {
    const { comunidade, sessao, dono, substituto } = await cena();

    // Para delegar, o dono precisa de session.manage -- ou seja, da propria
    // responsabilidade. E a consequencia incomoda que a tela precisa dizer.
    await comoAal2(dono, 'select public.set_community_organizer($1,$2,true)', [comunidade, dono]);
    await comoAal2(dono, 'select public.set_community_organizer($1,$2,true)', [
      comunidade,
      substituto,
    ]);
    await atribuir(dono, sessao, substituto, await revisaoDaSessao(sessao));

    assert.equal(await organizaAgora(sessao, substituto), 1, 'o substituto organiza');
    assert.equal(
      await organizaAgora(sessao, dono),
      0,
      'delegar nao atribui o dono a sessao, so o alvo',
    );
  });

  test('sem a responsabilidade, o alvo e recusado como organizador nao efetivo', async () => {
    const { comunidade, sessao, dono, substituto } = await cena();
    await comoAal2(dono, 'select public.set_community_organizer($1,$2,true)', [comunidade, dono]);

    const erro = await atribuir(dono, sessao, substituto, await revisaoDaSessao(sessao)).catch(
      (thrown: Error & { code?: string }) => thrown,
    );

    assert.ok(erro instanceof Error);
    assert.equal(
      (erro as { code?: string }).code,
      '23514',
      'conceder a responsabilidade ao alvo e passo obrigatorio, nao opcional',
    );
  });

  test('quem ja organiza a comunidade assume a sessao sem depender do dono', async () => {
    const { comunidade, sessao, substituto } = await cena();
    // O substituto ja e organizador da comunidade, concedido por quem pode.
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [comunidade, substituto],
    );

    await atribuir(substituto, sessao, substituto, await revisaoDaSessao(sessao));

    assert.equal(await organizaAgora(sessao, substituto), 1);
  });

  test('atribuir organizador exige dois fatores?', async () => {
    const { comunidade, sessao, dono } = await cena();
    await comoAal2(dono, 'select public.set_community_organizer($1,$2,true)', [comunidade, dono]);

    const resultado = await semAal2(
      dono,
      'select * from public.assign_target_session_organizer($1,$2,$3,$4,$5)',
      [randomUUID(), randomUUID(), sessao, await revisaoDaSessao(sessao), dono],
    ).catch((thrown: Error & { code?: string; message: string }) => thrown);

    // Fixa o que o servidor faz hoje, seja qual for: a tela precisa saber se
    // deve pedir dois fatores antes de oferecer o botao.
    const exigeAal2 = resultado instanceof Error && /AAL2|duas etapas/i.test(resultado.message);
    assert.equal(
      exigeAal2,
      false,
      'assign_target_session_organizer nao exige AAL2; so set_community_organizer exige',
    );
  });
}
