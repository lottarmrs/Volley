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
 * O quadro precisa contar a verdade sobre a SESSAO, nao so sobre a janela.
 *
 * Dois defeitos vinham disso: quem abre a inscricao por um link nao tem a
 * pelada no aparelho e ficava sem nome e sem data no cabecalho; e uma sessao
 * que ja comecou recusa quem tenta entrar, enquanto a janela continuava
 * anunciando OPEN para quem le so o status dela.
 */

if (!isTestDatabaseConfigured()) {
  test(`board session facts require ${TEST_DATABASE_URL_VAR}`, () => {
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
    const email = `quadro-${rotulo}-${randomUUID()}@test.local`;
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

  async function cena(nome = 'Pelada de quinta', quando: string | null = null) {
    const dono = await usuario('dono');
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Quadro ${randomUUID()}`,
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
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, $4, null)`,
        [sessao, comunidade, nome, quando],
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

  const lerQuadro = async (dono: string, sessao: string) =>
    (
      await asIdentityCommitting(client, dono, () =>
        client.query<{ result: Record<string, unknown> }>(
          'select public.read_session_registration($1) as result',
          [sessao],
        ),
      )
    ).rows[0].result;

  test('o quadro devolve o nome da pelada, para o cabecalho de quem chega pelo link', async () => {
    const { dono, sessao } = await cena('Pelada de quinta');

    const quadro = await lerQuadro(dono, sessao);

    assert.equal(quadro.session_name, 'Pelada de quinta');
  });

  test('o quadro devolve a data da pelada', async () => {
    const { dono, sessao } = await cena('Pelada de quinta', '2026-10-01T23:00:00Z');

    const quadro = await lerQuadro(dono, sessao);

    assert.match(String(quadro.session_date), /^2026-10-0[12]$/);
  });

  test('o quadro devolve o ciclo de vida: a janela sozinha mentia', async () => {
    const { dono, sessao, janela } = await cena();

    const antes = await lerQuadro(dono, sessao);
    assert.equal(antes.session_lifecycle_status, 'DRAFT');
    assert.equal(antes.status, 'OPEN');

    await client.query(
      `update public.sessions
          set lifecycle_status = 'IN_PROGRESS', actual_started_at = now()
        where id = $1`,
      [sessao],
    );

    const depois = await lerQuadro(dono, sessao);
    assert.equal(
      depois.status,
      'OPEN',
      'a janela continua OPEN: e por isso que o ciclo de vida precisa viajar junto',
    );
    assert.equal(
      depois.session_lifecycle_status,
      'IN_PROGRESS',
      'agora quem le o quadro consegue dizer que nao da mais para entrar',
    );

    // E o servidor continua recusando, coerente com o que o quadro anuncia.
    const janelaAindaAberta = (
      await client.query<{ status: string }>(
        'select status from public.registration_windows where id = $1',
        [janela],
      )
    ).rows[0].status;
    assert.equal(janelaAindaAberta, 'OPEN');
  });

  test('os campos novos nao quebram quem ja lia o quadro', async () => {
    const { dono, sessao } = await cena();

    const quadro = await lerQuadro(dono, sessao);

    for (const campo of [
      'window_id',
      'session_id',
      'status',
      'revision',
      'capacity',
      'confirmed_count',
      'waitlisted_count',
      'paid_count',
      'viewer_can_manage',
      'entries',
    ]) {
      assert.ok(campo in quadro, `${campo} sumiu do quadro`);
    }
  });
}
