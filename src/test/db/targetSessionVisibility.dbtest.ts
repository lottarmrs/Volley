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
 * Quem consegue LER uma sessao da comunidade.
 *
 * Fui investigar por que a sessao target some em outro aparelho, esperando
 * achar so o filtro do cliente (`scopeOperationalFetch` restringe o download em
 * lote a `authority_model = 'legacy'`). Achei um segundo portao, maior e
 * anterior: a policy de leitura de `sessions` chama
 * `current_user_has_community_role(community_id)` SEM passar os papeis, e o
 * padrao da funcao e ['owner','admin','moderator'].
 *
 * Ou seja: um `member` comum nao le sessao nenhuma da propria comunidade --
 * legada ou target. O atleta so enxerga a pelada pelas RPCs `security definer`
 * (o quadro da inscricao), nunca pelas linhas.
 *
 * Esta suite fixa o limite como ele E hoje, para que qualquer mudanca de
 * politica seja deliberada e apareca aqui.
 */

if (!isTestDatabaseConfigured()) {
  test(`target session visibility requires ${TEST_DATABASE_URL_VAR}`, () => {
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
    const email = `visib-${rotulo}-${randomUUID()}@test.local`;
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

  async function cena() {
    const dono = await usuario('dono');
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Visibilidade ${randomUUID()}`,
      ]),
    );
    const comunidade = rows[0].id;
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [comunidade, dono],
    );

    const atleta = await usuario('atleta');
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [comunidade, atleta],
    );
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict do nothing`,
      [comunidade, atleta],
    );

    const sessao = randomUUID();
    await asIdentityCommitting(client, dono, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [sessao, comunidade, 'Pelada de quinta'],
      ),
    );

    const deFora = await usuario('de-fora');
    return { comunidade, sessao, dono, atleta, deFora };
  }

  const leSessao = async (userId: string, sessao: string) =>
    (
      await asIdentityCommitting(client, userId, () =>
        client.query<{ id: string; authority_model: string }>(
          'select id, authority_model from public.sessions where id = $1',
          [sessao],
        ),
      )
    ).rows;

  test('o membro comum NAO le a sessao da propria comunidade', async () => {
    const { sessao, atleta } = await cena();

    assert.deepEqual(
      await leSessao(atleta, sessao),
      [],
      'a policy chama current_user_has_community_role sem papeis, e o padrao exclui `member`',
    );
  });

  test('moderador para cima le, e o authority_model nao entra na conta', async () => {
    const { comunidade, sessao } = await cena();

    for (const papel of ['moderator', 'admin']) {
      const pessoa = await usuario(papel);
      await client.query(
        `insert into public.community_members (community_id, user_id, role, status)
         values ($1, $2, $3, 'active')`,
        [comunidade, pessoa, papel],
      );

      const linhas = await leSessao(pessoa, sessao);
      assert.equal(linhas.length, 1, `${papel} deveria ler`);
      assert.equal(
        linhas[0].authority_model,
        'target',
        'a policy de leitura nao olha authority_model: o filtro de legacy e do cliente',
      );
    }
  });

  test('quem criou le a propria sessao pelo owner_id, independente de papel', async () => {
    const { sessao, dono } = await cena();

    assert.equal((await leSessao(dono, sessao)).length, 1);
  });

  test('quem nao e do grupo continua sem ver', async () => {
    const { sessao, deFora } = await cena();

    assert.deepEqual(await leSessao(deFora, sessao), []);
  });

  test('ler nao e escrever: o membro comum continua barrado no update generico', async () => {
    const { sessao, atleta } = await cena();

    const { rowCount } = await asIdentityCommitting(client, atleta, () =>
      client.query(`update public.sessions set name = 'Sequestrada' where id = $1`, [sessao]),
    );

    assert.equal(
      rowCount,
      0,
      'a policy de update filtra em silencio, e e por isso que o cliente precisa pular a sessao target no upload',
    );
    const { rows } = await client.query<{ name: string }>(
      'select name from public.sessions where id = $1',
      [sessao],
    );
    assert.equal(rows[0].name, 'Pelada de quinta');
  });
}
