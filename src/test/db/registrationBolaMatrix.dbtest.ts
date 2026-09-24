import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client, Pool } from 'pg';
import {
  asIdentity,
  asIdentityCommitting,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

/**
 * Matriz de autorização da inscrição e do pagamento.
 *
 * A suíte já prova o COMPORTAMENTO de cada comando (registrationFlow,
 * registrationPayment). O que faltava era a outra pergunta: para cada papel da
 * comunidade, QUEM pode. O gate de escrita não é o papel sozinho -- é a
 * atribuição de organizador na sessão MAIS associação ativa MAIS a
 * responsabilidade ORGANIZER --, então dono e admin sem atribuição são negados,
 * e isso precisa estar preso em teste para ninguem "consertar" por engano.
 */

type Resultado = 'permitido' | 'negado';

if (!isTestDatabaseConfigured()) {
  test(`registration BOLA matrix requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;
  let pool: Pool;

  const mundo = {
    dono: '',
    admin: '',
    organizadorDeOutraSessao: '',
    organizador: '',
    atleta: '',
    suspenso: '',
    deOutraComunidade: '',
    comunidade: '',
    outraComunidade: '',
    sessao: '',
    outraSessao: '',
    janela: '',
    atletaPlayerId: '',
    organizadorPlayerId: '',
    jaInscrito: '',
    jaInscritoPlayerId: '',
  };

  async function usuario(rotulo: string): Promise<string> {
    const email = `reg-bola-${rotulo}-${randomUUID()}@test.local`;
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

  /** Cria o Player canônico da conta e liga a conta a ele, como o app faz. */
  async function atletaDaConta(userId: string, comunidade: string, dono: string): Promise<string> {
    const { rows } = await asIdentityCommitting(client, userId, () =>
      client.query<{ player_id: string }>('select * from public.ensure_account_ready()'),
    );
    const playerId = rows[0].player_id;
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

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
    pool = createPool();

    mundo.dono = await usuario('dono');
    mundo.admin = await usuario('admin');
    mundo.organizadorDeOutraSessao = await usuario('org-outra-sessao');
    mundo.organizador = await usuario('organizador');
    mundo.atleta = await usuario('atleta');
    mundo.suspenso = await usuario('suspenso');
    mundo.deOutraComunidade = await usuario('outra');
    mundo.jaInscrito = await usuario('ja-inscrito');

    const criarComunidade = async (ownerId: string, nome: string) => {
      const { rows } = await asIdentityCommitting(client, ownerId, () =>
        client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [nome]),
      );
      return rows[0].id;
    };
    mundo.comunidade = await criarComunidade(mundo.dono, `Matriz ${randomUUID()}`);
    mundo.outraComunidade = await criarComunidade(mundo.deOutraComunidade, `Outra ${randomUUID()}`);

    const assentar = (userId: string, role: string, status = 'active') =>
      client.query(
        `insert into public.community_memberships (community_id, user_id, role, status)
         values ($1, $2, $3, $4)
         on conflict (community_id, user_id) do update set role = $3, status = $4`,
        [mundo.comunidade, userId, role, status],
      );

    await assentar(mundo.admin, 'admin');
    await assentar(mundo.organizadorDeOutraSessao, 'member');
    await assentar(mundo.organizador, 'member');
    await assentar(mundo.atleta, 'member');
    await assentar(mundo.suspenso, 'member', 'suspended');
    await assentar(mundo.jaInscrito, 'member');

    // A responsabilidade ORGANIZER e uma das tres pernas do gate de escrita.
    for (const userId of [mundo.dono, mundo.organizador, mundo.organizadorDeOutraSessao]) {
      await client.query(
        `insert into public.community_responsibilities (community_id, user_id, responsibility)
         values ($1, $2, 'ORGANIZER')
         on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
        [mundo.comunidade, userId],
      );
    }

    mundo.atletaPlayerId = await atletaDaConta(mundo.atleta, mundo.comunidade, mundo.dono);
    mundo.organizadorPlayerId = await atletaDaConta(
      mundo.organizador,
      mundo.comunidade,
      mundo.dono,
    );

    // Quem cria a sessao ganha a atribuicao de organizador nela.
    mundo.sessao = randomUUID();
    await asIdentityCommitting(client, mundo.organizador, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [mundo.sessao, mundo.comunidade, 'Pelada da matriz'],
      ),
    );

    mundo.janela = randomUUID();
    await asIdentityCommitting(client, mundo.organizador, () =>
      client.query('select * from public.create_registration_window($1,$2,$3,$4,null)', [
        randomUUID(),
        mundo.janela,
        mundo.sessao,
        4,
      ]),
    );
    await asIdentityCommitting(client, mundo.organizador, () =>
      client.query('select * from public.open_registration($1,$2,$3)', [
        randomUUID(),
        mundo.janela,
        1,
      ]),
    );

    // Alguem precisa estar inscrito para os comandos que agem sobre uma
    // inscricao existente terem alvo. Fica separado do `atleta`, que a matriz
    // de join usa justamente por ainda nao estar inscrito.
    mundo.jaInscritoPlayerId = await atletaDaConta(mundo.jaInscrito, mundo.comunidade, mundo.dono);
    await asIdentityCommitting(client, mundo.jaInscrito, () =>
      client.query('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        mundo.janela,
      ]),
    );

    // Tem a responsabilidade ORGANIZER e atribuicao -- mas de OUTRA sessao.
    // E o caso que separa "pode organizar nesta comunidade" de "pode nesta
    // sessao", que e o que o gate realmente exige.
    mundo.outraSessao = randomUUID();
    await asIdentityCommitting(client, mundo.organizadorDeOutraSessao, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [mundo.outraSessao, mundo.comunidade, 'Outra pelada'],
      ),
    );
  });

  test.after(async () => {
    await pool?.end();
    await client?.end();
  });

  /** Roda um comando como a identidade e diz se passou. Sempre desfaz. */
  async function comando(
    userId: string | null,
    sql: string,
    params: unknown[],
  ): Promise<Resultado> {
    const db = await pool.connect();
    try {
      const resultado = await asIdentity(db, userId, () => db.query(sql, params)).catch(
        (erro: Error) => erro,
      );
      return resultado instanceof Error ? 'negado' : 'permitido';
    } finally {
      db.release();
    }
  }

  const atores = () => ({
    anônimo: null as string | null,
    'atleta membro': mundo.atleta,
    'membro suspenso': mundo.suspenso,
    'membro de outra comunidade': mundo.deOutraComunidade,
    'organizador de outra sessão': mundo.organizadorDeOutraSessao,
    'admin sem atribuição': mundo.admin,
    'dono sem atribuição na sessão': mundo.dono,
    'organizador da sessão': mundo.organizador,
  });

  async function matriz(
    nome: string,
    esperado: Record<string, Resultado>,
    sql: string,
    params: (userId: string | null) => unknown[],
  ) {
    for (const [rotulo, uid] of Object.entries(atores())) {
      const obtido = await comando(uid, sql, params(uid));
      assert.equal(obtido, esperado[rotulo], `${nome} como ${rotulo}`);
    }
  }

  test('MATRIZ: ler o quadro da inscrição', async () => {
    await matriz(
      'read_registration_board',
      {
        anônimo: 'negado',
        'atleta membro': 'permitido',
        'membro suspenso': 'negado',
        'membro de outra comunidade': 'negado',
        'organizador de outra sessão': 'permitido',
        'admin sem atribuição': 'permitido',
        'dono sem atribuição na sessão': 'permitido',
        'organizador da sessão': 'permitido',
      },
      'select public.read_registration_board($1)',
      () => [mundo.janela],
    );
  });

  test('MATRIZ: marcar pagamento', async () => {
    await matriz(
      'mark_registration_payment',
      {
        anônimo: 'negado',
        'atleta membro': 'negado',
        'membro suspenso': 'negado',
        'membro de outra comunidade': 'negado',
        // Papel na comunidade nao basta: o gate exige atribuicao NA SESSAO.
        'organizador de outra sessão': 'negado',
        'admin sem atribuição': 'negado',
        'dono sem atribuição na sessão': 'negado',
        'organizador da sessão': 'permitido',
      },
      'select * from public.mark_registration_payment($1,$2,$3,true)',
      () => [randomUUID(), mundo.janela, mundo.jaInscritoPlayerId],
    );
  });

  test('MATRIZ: definir o prazo de pagamento', async () => {
    await matriz(
      'set_registration_payment_due',
      {
        anônimo: 'negado',
        'atleta membro': 'negado',
        'membro suspenso': 'negado',
        'membro de outra comunidade': 'negado',
        'organizador de outra sessão': 'negado',
        'admin sem atribuição': 'negado',
        'dono sem atribuição na sessão': 'negado',
        'organizador da sessão': 'permitido',
      },
      'select * from public.set_registration_payment_due($1,$2,$3)',
      () => [randomUUID(), mundo.janela, new Date(Date.now() + 86400000).toISOString()],
    );
  });

  test('MATRIZ: aplicar o corte do prazo', async () => {
    await matriz(
      'apply_registration_payment_deadline',
      {
        anônimo: 'negado',
        'atleta membro': 'negado',
        'membro suspenso': 'negado',
        'membro de outra comunidade': 'negado',
        'organizador de outra sessão': 'negado',
        'admin sem atribuição': 'negado',
        'dono sem atribuição na sessão': 'negado',
        'organizador da sessão': 'permitido',
      },
      'select * from public.apply_registration_payment_deadline($1,$2)',
      () => [randomUUID(), mundo.janela],
    );
  });

  test('MATRIZ: mudar a capacidade', async () => {
    await matriz(
      'change_registration_capacity',
      {
        anônimo: 'negado',
        'atleta membro': 'negado',
        'membro suspenso': 'negado',
        'membro de outra comunidade': 'negado',
        'organizador de outra sessão': 'negado',
        'admin sem atribuição': 'negado',
        'dono sem atribuição na sessão': 'negado',
        'organizador da sessão': 'permitido',
      },
      'select * from public.change_registration_capacity($1,$2,$3)',
      () => [randomUUID(), mundo.janela, 6],
    );
  });

  test('MATRIZ: inscrever-se por conta própria', async () => {
    await matriz(
      'join_registration',
      {
        anônimo: 'negado',
        'atleta membro': 'permitido',
        'membro suspenso': 'negado',
        'membro de outra comunidade': 'negado',
        // Sao membros ativos, mas sem Player ligado a conta nem assento no
        // elenco: join_registration exige os dois. A recusa vem dai, nao de
        // regra de organizacao -- entrar na lista e acao de atleta.
        'organizador de outra sessão': 'negado',
        'admin sem atribuição': 'negado',
        // O dono CRIOU esta comunidade, e desde 2026-09-24 criar uma comunidade
        // ja poe quem criou no elenco dela com vinculo de conta. Entao ele tem
        // as duas coisas e entra na lista, sem precisar organizar a sessao.
        // Antes era negado, e a recusa era acidente: ele simplesmente nao tinha
        // como virar atleta em lugar nenhum.
        'dono sem atribuição na sessão': 'permitido',
        'organizador da sessão': 'permitido',
      },
      'select * from public.join_registration($1,$2,$3)',
      () => [randomUUID(), randomUUID(), mundo.janela],
    );
  });

  test('um segundo organizador assume a sessao de quem nao pode mais', async () => {
    // O cenario real: quem abriu a lista na segunda nao vai na quinta. Outro
    // organizador da comunidade precisa poder assumir -- e, hoje, precisa TER a
    // responsabilidade ORGANIZER, porque e dela que vem a capacidade
    // session.manage. Ser dono ou admin nao basta.
    const antes = await comando(
      mundo.organizadorDeOutraSessao,
      'select * from public.mark_registration_payment($1,$2,$3,true)',
      [randomUUID(), mundo.janela, mundo.jaInscritoPlayerId],
    );
    assert.equal(antes, 'negado', 'sem atribuicao nesta sessao, nao mexe na lista');

    const { rows } = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [mundo.sessao],
    );
    await asIdentityCommitting(client, mundo.organizadorDeOutraSessao, () =>
      client.query('select * from public.assign_target_session_organizer($1,$2,$3,$4,$5)', [
        randomUUID(),
        randomUUID(),
        mundo.sessao,
        rows[0].revision,
        mundo.organizadorDeOutraSessao,
      ]),
    );

    const depois = await comando(
      mundo.organizadorDeOutraSessao,
      'select * from public.mark_registration_payment($1,$2,$3,true)',
      [randomUUID(), mundo.janela, mundo.jaInscritoPlayerId],
    );
    assert.equal(depois, 'permitido', 'com a atribuicao, assume a lista');
  });

  test('o admin sem a responsabilidade ORGANIZER nao consegue assumir a sessao', async () => {
    const { rows } = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [mundo.sessao],
    );
    const tentativa = await comando(
      mundo.admin,
      'select * from public.assign_target_session_organizer($1,$2,$3,$4,$5)',
      [randomUUID(), randomUUID(), mundo.sessao, rows[0].revision, mundo.admin],
    );
    assert.equal(
      tentativa,
      'negado',
      'session.manage vem so da responsabilidade ORGANIZER, nao do papel admin',
    );
  });
}
