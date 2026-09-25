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

const VERSION = 'v0-legacy-11';
const RECORD = 'select * from public.record_player_evaluation($1,$2,$3,$4,$5,$6)';
const RECORD_EDITOR = 'select public.record_community_player_evaluation($1,$2,$3,$4,$5,$6,$7)';
const PROFILE = 'select public.get_community_player_skill_profile($1,$2,$3) as profile';

if (!isTestDatabaseConfigured()) {
  test(`avaliacao da comunidade requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.equal(
      result.failures.filter(
        ({ migration }) => migration === '20260925130000_avaliacao_da_comunidade.sql',
      ).length,
      0,
    );
  });

  test.after(async () => {
    await client?.end();
  });

  async function usuario(rotulo: string): Promise<string> {
    const email = `aval-${rotulo}-${randomUUID()}@test.local`;
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id, email, name) values ($1, $2, $3) on conflict do nothing',
      [rows[0].id, email, rotulo],
    );
    return rows[0].id;
  }

  async function como<T extends QueryResultRow = QueryResultRow>(
    actor: string,
    sql: string,
    args: unknown[] = [],
  ) {
    return asIdentityCommitting(client, actor, () => client.query<T>(sql, args));
  }

  async function recusa(actor: string, sql: string, args: unknown[], mensagem?: RegExp) {
    await assert.rejects(como(actor, sql, args), (erro: { code?: string; message?: string }) => {
      assert.equal(erro.code, '42501');
      if (mensagem) assert.match(erro.message ?? '', mensagem);
      return true;
    });
  }

  async function atleta(comunidade: string, dono: string, userId: string | null = null) {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active, user_id, has_account_identity_history)
       values ($1, $2, $3, true, $4, $5)`,
      [id, dono, `Atleta ${id.slice(0, 6)}`, userId, userId !== null],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [comunidade, id, dono],
    );
    return id;
  }

  async function entra(comunidade: string, papel: 'admin' | 'member') {
    const id = await usuario(papel);
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, $3, 'active')`,
      [comunidade, id, papel],
    );
    return id;
  }

  async function cena() {
    const dono = await usuario('dono');
    const { rows } = await asIdentityCommitting(client, dono, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Avaliacao ${randomUUID()}`,
      ]),
    );
    const comunidade = rows[0].id;
    const { rows: fichas } = await client.query<{ id: string }>(
      'select id from public.players where user_id = $1',
      [dono],
    );
    return { comunidade, dono, fichaDoDono: fichas[0].id };
  }

  async function avalia(actor: string, comunidade: string, ficha: string, saque = 6) {
    return como(actor, RECORD, [randomUUID(), randomUUID(), comunidade, ficha, VERSION, { saque }]);
  }

  async function saqueNoPerfil(actor: string, comunidade: string, ficha: string) {
    const { rows } = await como<{
      profile: { dimensions: { dimension_key: string; value: number | null }[] };
    }>(actor, PROFILE, [comunidade, ficha, VERSION]);
    return rows[0].profile.dimensions.find((d) => d.dimension_key === 'saque')?.value ?? null;
  }

  test('dono e admin avaliam pelo cargo; membro nao; membro com EVALUATOR sim', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');
    const membro = await entra(c.comunidade, 'member');
    const ficha = await atleta(c.comunidade, c.dono);

    await avalia(c.dono, c.comunidade, ficha);
    await avalia(admin, c.comunidade, ficha);
    await recusa(membro, RECORD, [
      randomUUID(),
      randomUUID(),
      c.comunidade,
      ficha,
      VERSION,
      { saque: 5 },
    ]);

    await como(c.dono, 'select public.set_community_evaluator($1,$2,true)', [c.comunidade, membro]);
    await avalia(membro, c.comunidade, ficha);
  });

  test('admin rebaixado a membro deixa de avaliar na mesma hora', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');
    const ficha = await atleta(c.comunidade, c.dono);

    await avalia(admin, c.comunidade, ficha);
    await client.query(
      "update public.community_memberships set role = 'member' where community_id = $1 and user_id = $2",
      [c.comunidade, admin],
    );
    await recusa(admin, RECORD, [
      randomUUID(),
      randomUUID(),
      c.comunidade,
      ficha,
      VERSION,
      { saque: 5 },
    ]);
  });

  const SOZINHO = /Only the sole evaluator of this Community can assess themselves/;

  test('com dois avaliadores, ninguem grava na propria ficha, por nenhum dos dois caminhos', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');

    await recusa(
      c.dono,
      RECORD,
      [randomUUID(), randomUUID(), c.comunidade, c.fichaDoDono, VERSION, { saque: 9 }],
      SOZINHO,
    );
    await recusa(
      c.dono,
      RECORD_EDITOR,
      [randomUUID(), randomUUID(), c.comunidade, c.fichaDoDono, VERSION, { saque: 9 }, null],
      SOZINHO,
    );
    await avalia(admin, c.comunidade, c.fichaDoDono);
  });

  test('o unico avaliador se avalia, e a nota entra no perfil marcada como autoavaliacao', async () => {
    const c = await cena();

    await avalia(c.dono, c.comunidade, c.fichaDoDono, 9);

    const { rows } = await client.query<{ is_self_assessment: boolean }>(
      `select is_self_assessment from public.player_evaluation_contributions
        where community_id = $1 and player_id = $2 and superseded_at is null`,
      [c.comunidade, c.fichaDoDono],
    );
    assert.deepEqual(rows, [{ is_self_assessment: true }]);
    assert.equal(await saqueNoPerfil(c.dono, c.comunidade, c.fichaDoDono), 9);
  });

  test('outra nota tira a autoavaliacao da media sem apaga-la; e o dono nao altera mais a sua', async () => {
    const c = await cena();
    await avalia(c.dono, c.comunidade, c.fichaDoDono, 9);

    const avaliador = await entra(c.comunidade, 'member');
    await como(c.dono, 'select public.set_community_evaluator($1,$2,true)', [
      c.comunidade,
      avaliador,
    ]);

    assert.equal(
      await saqueNoPerfil(c.dono, c.comunidade, c.fichaDoDono),
      9,
      'vale ate alguem avaliar',
    );
    await recusa(
      c.dono,
      RECORD,
      [randomUUID(), randomUUID(), c.comunidade, c.fichaDoDono, VERSION, { saque: 10 }],
      SOZINHO,
    );

    await avalia(avaliador, c.comunidade, c.fichaDoDono, 4);
    assert.equal(await saqueNoPerfil(c.dono, c.comunidade, c.fichaDoDono), 4);

    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from public.player_evaluation_contributions
        where player_id = $1 and is_self_assessment and superseded_at is null`,
      [c.fichaDoDono],
    );
    assert.equal(rows[0].n, 1, 'a autoavaliacao continua registrada');
  });

  test('a autoavaliacao de uma conta anonimizada continua marcada e continua saindo da conta', async () => {
    const c = await cena();
    await avalia(c.dono, c.comunidade, c.fichaDoDono, 9);
    await client.query(
      `update public.player_evaluation_contributions set evaluator_user_id = null
        where player_id = $1 and is_self_assessment`,
      [c.fichaDoDono],
    );

    const avaliador = await entra(c.comunidade, 'member');
    await como(c.dono, 'select public.set_community_evaluator($1,$2,true)', [
      c.comunidade,
      avaliador,
    ]);
    await avalia(avaliador, c.comunidade, c.fichaDoDono, 3);

    assert.equal(await saqueNoPerfil(avaliador, c.comunidade, c.fichaDoDono), 3);
  });

  test('o reenvio de um comando ja registrado devolve o recibo, mesmo depois de surgir outro avaliador', async () => {
    const c = await cena();
    const args = [randomUUID(), randomUUID(), c.comunidade, c.fichaDoDono, VERSION, { saque: 8 }];
    const primeiro = await como(c.dono, RECORD, args);

    await entra(c.comunidade, 'admin');
    const reenvio = await como(c.dono, RECORD, args);
    assert.deepEqual(reenvio.rows, primeiro.rows);
  });

  const ROSTER = 'select public.list_community_evaluation_roster($1) as roster';

  type Linha = {
    player_id: string;
    has_account: boolean;
    my_last_evaluated_at: string | null;
    is_self: boolean;
  };

  async function lista(actor: string, comunidade: string): Promise<Linha[]> {
    const { rows } = await como<{ roster: Linha[] }>(actor, ROSTER, [comunidade]);
    return rows[0].roster;
  }

  test('a lista recusa quem nao avalia', async () => {
    const c = await cena();
    const membro = await entra(c.comunidade, 'member');
    await recusa(membro, ROSTER, [c.comunidade], /Not authorized to evaluate Players/);
  });

  test('a lista traz o elenco, marca quem eu avaliei, e nao traz nota', async () => {
    const c = await cena();
    const admin = await entra(c.comunidade, 'admin');
    const avaliada = await atleta(c.comunidade, c.dono);
    const pendente = await atleta(c.comunidade, c.dono);
    await avalia(admin, c.comunidade, avaliada);

    const linhas = await lista(admin, c.comunidade);
    const porId = new Map(linhas.map((l) => [l.player_id, l]));

    assert.notEqual(porId.get(avaliada)?.my_last_evaluated_at, null);
    assert.equal(porId.get(pendente)?.my_last_evaluated_at, null);
    assert.equal(porId.get(avaliada)?.has_account, false);
    assert.ok(linhas.every((l) => !('dimensions' in l) && !('value' in l)));
  });

  test('quem pede so aparece na lista quando pode se autoavaliar', async () => {
    const c = await cena();

    const sozinho = await lista(c.dono, c.comunidade);
    assert.deepEqual(
      sozinho.filter((l) => l.is_self).map((l) => l.player_id),
      [c.fichaDoDono],
    );

    const admin = await entra(c.comunidade, 'admin');
    const acompanhado = await lista(c.dono, c.comunidade);
    assert.equal(
      acompanhado.some((l) => l.player_id === c.fichaDoDono),
      false,
    );
    assert.equal(
      (await lista(admin, c.comunidade)).some((l) => l.player_id === c.fichaDoDono),
      true,
    );
  });
}
