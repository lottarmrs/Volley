import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client, Pool, QueryResultRow } from 'pg';
import {
  asIdentity,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

/**
 * Prova da remediacao da auditoria de seguranca de 2026-09-08
 * (20260908160000_security_audit_remediation.sql), contra um PostgreSQL real.
 *
 * Cada bloco prova DUAS coisas, porque so a negativa nao basta: o caminho de ataque passa a
 * ser negado E o fluxo legitimo que dependia daquela superficie continua funcionando. Um
 * `revoke` que fecha o furo e quebra o cadastro nao e correcao, e troca de defeito.
 */

if (!isTestDatabaseConfigured()) {
  test(`security audit remediation requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run \`npm run test:db\`.`);
  });
} else {
  let client: Client;
  let pool: Pool;

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
    pool = createPool();
  });

  test.after(async () => {
    await pool?.end();
    await client?.end();
  });

  async function newUser(email: string): Promise<string> {
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

  /**
   * Comunidade fora da coorte 'target'. `create_community_with_owner` sempre cria linhas
   * 'target', que `guard_target_community_writes` recusa DELETAR fora de um comando
   * semantico -- quebra latente pre-existente em reset_product_data que esta remediacao nao
   * possui nem toca. O insert direto mantem o teste sobre o que ele realmente prova.
   */
  async function legacyCommunity(ownerId: string, name: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'insert into public.communities (owner_id, name) values ($1, $2) returning id',
      [ownerId, name],
    );
    const communityId = rows[0].id;
    // check_community_has_active_owner exige exatamente um owner ativo o tempo todo. Em linha
    // legada o espelho de community_members ja gravou esse owner pelo trigger de dono.
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'owner', 'active')
       on conflict (community_id, user_id) do nothing`,
      [communityId, ownerId],
    );
    return communityId;
  }

  /** current_user_has_community_role le community_members, nao community_memberships. */
  async function legacyMember(communityId: string, userId: string, role: string): Promise<void> {
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, $3, 'active')
       on conflict (community_id, user_id) do update set role = excluded.role, status = 'active'`,
      [communityId, userId, role],
    );
  }

  async function newPlayer(ownerId: string, name: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      'insert into public.players (owner_id, name) values ($1, $2) returning id',
      [ownerId, name],
    );
    return rows[0].id;
  }

  async function newSession(ownerId: string, communityId: string, name: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.sessions (owner_id, community_id, name, date, status, type)
       values ($1, $2, $3, current_date, 'draft', 'free_play') returning id`,
      [ownerId, communityId, name],
    );
    return rows[0].id;
  }

  async function makeMaster(userId: string): Promise<void> {
    // guard_profile_role bloqueia UPDATE de role fora do RPC sem a flag transacional
    // app.allow_role_change (20260624141708_role_management_rpc.sql).
    await client.query('begin');
    await client.query(`select set_config('app.allow_role_change', 'on', true)`);
    await client.query(`update public.profiles set role = 'master' where id = $1`, [userId]);
    await client.query('commit');
  }

  async function asMasterWithAal2<T extends QueryResultRow = QueryResultRow>(
    masterId: string,
    sql: string,
    params: unknown[] = [],
  ) {
    const db = await pool.connect();
    try {
      await db.query('begin');
      await db.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', masterId]);
      await db.query('select set_config($1, $2, true)', [
        'request.jwt.claim.role',
        'authenticated',
      ]);
      await db.query('select set_config($1, $2, true)', [
        'request.jwt.claims',
        JSON.stringify({ sub: masterId, role: 'authenticated', aal: 'aal2' }),
      ]);
      await db.query('set local role authenticated');
      const result = await db.query<T>(sql, params);
      await db.query('commit');
      return result;
    } catch (error) {
      await db.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      db.release();
    }
  }

  const denied = async (userId: string, sql: string, params: unknown[] = []): Promise<Error> => {
    const outcome = await asIdentity(client, userId, () =>
      client.query(sql, params).catch((error: Error) => error),
    );
    assert.ok(outcome instanceof Error, `expected a refusal from: ${sql}`);
    return outcome as Error;
  };

  // ── A1/A2/A3 — RPCs de carreira ──────────────────────────────────────────
  test('A1-A3: nenhuma das tres RPCs de carreira e alcancavel por um authenticated comum', async () => {
    // Eram security definer concedidas a `authenticated` sem nenhuma verificacao de
    // autorizacao: o alvo vinha inteiro do parametro. career_events so concede SELECT ao
    // cliente, entao estas funcoes eram a unica escrita possivel -- e a unica destrutiva.
    const attackerId = await newUser('sec-a1-attacker@example.com');
    const victimId = await newUser('sec-a1-victim@example.com');
    const victimPlayer = await newPlayer(victimId, 'Vitima');

    for (const [sql, params] of [
      ['select public.regenerate_career_events_for_sessions($1::uuid[])', [[victimPlayer]]],
      ['select public.regenerate_player_milestones($1)', [victimPlayer]],
      ['select public.recalculate_player_career($1)', [victimPlayer]],
    ] as [string, unknown[]][]) {
      const error = await denied(attackerId, sql, params);
      assert.match(
        error.message,
        /permission denied|does not exist/i,
        `${sql} deve ser recusada por grant, nao por retorno vazio`,
      );
    }
  });

  // O nome diz mais do que o teste prova: a ultima definicao de handle_new_user
  // (20260723230000) nao chama recalculate_player_career, entao o que este caso exercita e
  // o fluxo de claim continuar intacto apos o revoke. A conclusao do achado nao depende
  // disso -- as tres RPCs nao tem chamador algum fora de funcoes ja security definer.
  test('A1-A3: o claim de jogador no cadastro segue funcionando apos o revoke', async () => {
    // A guarda que o laudo sugeriu no corpo de recalculate_player_career quebraria ISTO:
    // handle_new_user() roda no trigger de signup, onde ainda nao ha sessao e auth.uid() e
    // NULL. Por isso a correcao foi revogar o grant, e este teste e o que prova que a
    // escolha esta certa -- a chamada interna resolve com os privilegios da dona.
    const legacyOwner = await newUser('sec-a1-claim-owner@example.com');
    const playerId = await newPlayer(legacyOwner, 'Historico');
    // O codigo nasce por trigger junto do jogador; forjar um segundo viola a PK.
    const { rows: codes } = await client.query<{ code: string }>(
      'select code from public.player_claim_codes where player_id = $1',
      [playerId],
    );
    assert.equal(codes.length, 1, 'o jogador nasce com um claim code gerado por trigger');

    await client.query(
      `insert into auth.users (email, raw_user_meta_data)
       values ($1, jsonb_build_object('name', 'Novo', 'claim_code', $2::text))`,
      ['sec-a1-claimer@example.com', codes[0].code],
    );

    const { rows } = await client.query<{ user_id: string | null; has_history: boolean }>(
      'select user_id, has_account_identity_history as has_history from public.players where id = $1',
      [playerId],
    );
    assert.ok(rows[0].user_id, 'o claim vinculou o jogador a conta recem-criada');
    assert.equal(
      rows[0].has_history,
      true,
      'o jogador reivindicado carrega historico de identidade',
    );
  });

  // ── A4 — reset_product_data ──────────────────────────────────────────────
  test('A4: o reset apaga a conta alvo e nao encosta na conta vizinha', async () => {
    const masterId = await newUser('sec-a4-master@example.com');
    await makeMaster(masterId);

    const alvoId = await newUser('sec-a4-alvo@example.com');
    const alvoCommunity = await legacyCommunity(alvoId, 'A4 Alvo');
    const alvoPlayer = await newPlayer(alvoId, 'Jogador Alvo');
    const alvoSession = await newSession(alvoId, alvoCommunity, 'Sessao Alvo');

    const vizinhoId = await newUser('sec-a4-vizinho@example.com');
    const vizinhoCommunity = await legacyCommunity(vizinhoId, 'A4 Vizinho');
    const vizinhoPlayer = await newPlayer(vizinhoId, 'Jogador Vizinho');
    const vizinhoSession = await newSession(vizinhoId, vizinhoCommunity, 'Sessao Vizinho');
    await client.query(
      `insert into public.self_evaluations (player_id, attributes) values ($1, '{"saque":5}'::jsonb)`,
      [vizinhoPlayer],
    );

    await asMasterWithAal2(masterId, 'select public.reset_product_data($1)', [alvoId]);

    const count = async (sql: string, id: string): Promise<number> => {
      const { rows } = await client.query<{ n: string }>(sql, [id]);
      return Number(rows[0].n);
    };

    assert.equal(
      await count('select count(*)::text as n from public.sessions where id = $1', alvoSession),
      0,
      'a sessao da conta alvo foi apagada',
    );
    assert.equal(
      await count('select count(*)::text as n from public.players where id = $1', alvoPlayer),
      0,
      'o jogador da conta alvo foi apagado',
    );
    assert.equal(
      await count(
        'select count(*)::text as n from public.communities where id = $1',
        alvoCommunity,
      ),
      0,
      'a comunidade da conta alvo foi apagada',
    );

    // O coracao do achado: antes da correcao estes tres eram apagados junto, porque
    // dezesseis DELETE nao tinham WHERE nenhum.
    assert.equal(
      await count('select count(*)::text as n from public.sessions where id = $1', vizinhoSession),
      1,
      'a sessao da conta vizinha sobreviveu ao reset',
    );
    assert.equal(
      await count('select count(*)::text as n from public.players where id = $1', vizinhoPlayer),
      1,
      'o jogador da conta vizinha sobreviveu ao reset',
    );
    assert.equal(
      await count(
        'select count(*)::text as n from public.self_evaluations where player_id = $1',
        vizinhoPlayer,
      ),
      1,
      'a autoavaliacao da conta vizinha sobreviveu ao reset',
    );
    assert.equal(
      await count(
        'select count(*)::text as n from public.communities where id = $1',
        vizinhoCommunity,
      ),
      1,
      'a comunidade da conta vizinha sobreviveu ao reset',
    );
  });

  test('A4: o reset segue exigindo capability e recusa alvo em branco', async () => {
    const semPoderId = await newUser('sec-a4-sempoder@example.com');
    const error = await denied(semPoderId, 'select public.reset_product_data($1)', [semPoderId]);
    assert.match(error.message, /reset_product_data capability/i);

    const masterId = await newUser('sec-a4-master-vazio@example.com');
    await makeMaster(masterId);
    const vazio = await asMasterWithAal2(masterId, 'select public.reset_product_data($1)', ['  '])
      .then(() => null)
      .catch((e: Error) => e);
    assert.ok(vazio instanceof Error, 'um alvo em branco deve ser recusado, nao virar reset amplo');
    assert.match((vazio as Error).message, /Target account is required/i);
  });

  // ── A5 — modification_logs ───────────────────────────────────────────────
  // ATENCAO: esta e uma guarda de documentacao, nao de regressao. A concessao de INSERT em
  // modification_logs a `authenticated` vem das default privileges da plataforma Supabase,
  // que o harness nao emula -- entao a assercao ja passaria numa arvore sem a correcao. O
  // teste positivo logo abaixo (o gatilho voltou a ser definer) e o que sustenta A5.
  test('A5: um authenticated nao forja mais linha de auditoria', async () => {
    const attackerId = await newUser('sec-a5-attacker@example.com');
    const victimId = await newUser('sec-a5-victim@example.com');

    const error = await denied(
      attackerId,
      `insert into public.modification_logs (owner_id, table_name, record_id, action_type)
       values ($1, 'communities', 'forjado', 'DELETE')`,
      [victimId],
    );
    assert.match(
      error.message,
      /permission denied/i,
      'a insercao direta na trilha de auditoria deve ser negada por privilegio',
    );
  });

  test('A5: o trigger de auditoria voltou a gravar como security definer', async () => {
    // A policy `with check (true)` existia porque 20260801120000 rebaixou o trigger a
    // security invoker sem querer. Restaurado o definer, a escrita legitima volta a
    // funcionar SEM policy permissiva -- que e o ponto da correcao.
    const ownerId = await newUser('sec-a5-owner@example.com');
    const communityId = await legacyCommunity(ownerId, 'A5 Auditoria');
    await legacyMember(communityId, ownerId, 'owner');

    const before = await client.query<{ n: string }>(
      `select count(*)::text as n from public.modification_logs
        where table_name = 'communities' and record_id = $1`,
      [communityId],
    );

    await asIdentity(client, ownerId, async () => {
      const result = await client.query('update public.communities set name = $2 where id = $1', [
        communityId,
        'A5 Auditoria Renomeada',
      ]);
      assert.equal(result.rowCount, 1, 'o dono continua conseguindo renomear a comunidade');

      // A leitura tem de ser feita como dona, dentro da mesma transacao: `authenticated`
      // nunca teve SELECT em modification_logs (so tinha o INSERT que esta correcao revogou),
      // e contar fora daqui leria o estado ja revertido.
      await client.query('set local role postgres');
      const after = await client.query<{ n: string }>(
        `select count(*)::text as n from public.modification_logs
          where table_name = 'communities' and record_id = $1`,
        [communityId],
      );
      assert.ok(
        Number(after.rows[0].n) > Number(before.rows[0].n),
        'o UPDATE gerou linha de auditoria sem depender de policy de INSERT',
      );
    });

    const { rows } = await client.query<{ secdef: boolean; cfg: string | null }>(
      `select p.prosecdef as secdef, array_to_string(p.proconfig, ',') as cfg
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'log_table_changes'`,
    );
    assert.equal(rows[0].secdef, true, 'log_table_changes voltou a ser SECURITY DEFINER');
    assert.equal(rows[0].cfg, 'search_path=""', 'e foi pinado no search_path alvo do ADR-SEC-003');
  });

  // ── A6 — find_player_by_username ─────────────────────────────────────────
  test('A6: o nome real so aparece para quem tem relacao com o atleta', async () => {
    const ownerId = await newUser('sec-a6-owner@example.com');
    // A comunidade existe para dar a ownerId uma associacao de owner ativa: e ela que
    // habilita o segundo ramo do CASE, o de quem administra alguma comunidade.
    await legacyCommunity(ownerId, 'A6 Busca');
    const playerId = await newPlayer(ownerId, 'Nome Real');
    await client.query('update public.players set username = $2 where id = $1', [
      playerId,
      'atleta-a6',
    ]);

    const estranhoId = await newUser('sec-a6-estranho@example.com');
    const semRelacao = await asIdentity(client, estranhoId, () =>
      client.query<{ id: string; username: string; name: string | null }>(
        'select * from public.find_player_by_username($1)',
        ['atleta-a6'],
      ),
    );
    assert.equal(semRelacao.rows.length, 1, 'a linha continua existindo (checagem de username)');
    assert.equal(
      semRelacao.rows[0].name,
      null,
      'um authenticated sem relacao nenhuma nao recebe mais o nome real',
    );

    // Quem administra alguma comunidade e exatamente quem usa a busca de vinculo, e
    // precisa do nome para confirmar a pessoa.
    const admin = await asIdentity(client, ownerId, () =>
      client.query<{ name: string | null }>('select * from public.find_player_by_username($1)', [
        'atleta-a6',
      ]),
    );
    assert.equal(
      admin.rows[0].name,
      'Nome Real',
      'quem administra comunidade continua vendo o nome',
    );
  });

  test('A6: a checagem de disponibilidade de username segue funcionando', async () => {
    const userId = await newUser('sec-a6-disponibilidade@example.com');
    const livre = await asIdentity(client, userId, () =>
      client.query('select * from public.find_player_by_username($1)', ['nao-existe-a6']),
    );
    assert.equal(livre.rows.length, 0, 'username livre nao devolve linha');
  });

  // ── A7 — community_capabilities ──────────────────────────────────────────
  test('A7: sondar as capabilities de outro usuario deixou de ser possivel', async () => {
    const ownerId = await newUser('sec-a7-owner@example.com');
    const communityId = await legacyCommunity(ownerId, 'A7 Grafo');
    const bisbilhoteiroId = await newUser('sec-a7-bisbilhoteiro@example.com');

    const error = await denied(
      bisbilhoteiroId,
      'select * from public.community_capabilities($1, $2)',
      [communityId, ownerId],
    );
    assert.match(error.message, /permission denied/i);
  });

  test('A7: o wrapper de usuario corrente continua respondendo', async () => {
    // A funcao interna e alcancada por current_user_has_community_capability, que e
    // security definer e resolve a chamada com os privilegios da dona.
    const ownerId = await newUser('sec-a7-wrapper-owner@example.com');
    const communityId = await legacyCommunity(ownerId, 'A7 Wrapper');

    const { rows } = await asIdentity(client, ownerId, () =>
      client.query<{ pode: boolean }>(
        'select public.current_user_has_community_capability($1, $2) as pode',
        [communityId, 'community.profile.update'],
      ),
    );
    assert.equal(rows[0].pode, true, 'o dono mantem a capability pelo wrapper');
  });

  // ── A8 — privilegio residual apos rebaixamento ───────────────────────────
  test('A8: quem foi rebaixado perde a escrita sobre a linha que criou', async () => {
    const ownerId = await newUser('sec-a8-owner@example.com');
    const communityId = await legacyCommunity(ownerId, 'A8 Regras');
    await legacyMember(communityId, ownerId, 'owner');

    const adminId = await newUser('sec-a8-admin@example.com');
    await legacyMember(communityId, adminId, 'admin');

    await asIdentity(client, adminId, async () => {
      const inserted = await client.query(
        'insert into public.community_rules (owner_id, community_id) values ($1, $2)',
        [adminId, communityId],
      );
      assert.equal(inserted.rowCount, 1, 'como admin, criar a regra e permitido');
    });

    // asIdentity sempre reverte, entao a linha precisa existir fora dela para o teste do
    // rebaixamento ter objeto.
    await client.query(
      'insert into public.community_rules (owner_id, community_id) values ($1, $2)',
      [adminId, communityId],
    );

    await legacyMember(communityId, adminId, 'member');

    await asIdentity(client, adminId, async () => {
      const updated = await client.query(
        `update public.community_rules set updated_at = now()
          where community_id = $1 and owner_id = $2`,
        [communityId, adminId],
      );
      assert.equal(
        updated.rowCount,
        0,
        'rebaixado a member, o ramo owner_id nao concede mais UPDATE',
      );

      const deleted = await client.query(
        'delete from public.community_rules where community_id = $1 and owner_id = $2',
        [communityId, adminId],
      );
      assert.equal(deleted.rowCount, 0, 'nem DELETE');
    });

    // E o owner atual continua podendo administrar a mesma linha.
    await legacyMember(communityId, adminId, 'admin');
    await asIdentity(client, adminId, async () => {
      const updated = await client.query(
        `update public.community_rules set updated_at = now()
          where community_id = $1 and owner_id = $2`,
        [communityId, adminId],
      );
      assert.equal(updated.rowCount, 1, 'repromovido a admin, a escrita legitima volta');
    });
  });

  // ── A9 — leitura do bucket de avatares ───────────────────────────────────
  test('A8: presenca e rascunhos de WhatsApp fecham pela mesma razao', async () => {
    // Levantadas pela review independente: mesma forma do achado (INSERT com `and`,
    // UPDATE/DELETE com `or`) e `community_id not null`, entao o ramo de posse nao
    // sustenta nenhuma linha pessoal -- e so o furo.
    const ownerId = await newUser('sec-a8b-owner@example.com');
    const communityId = await legacyCommunity(ownerId, 'A8 Presenca');
    await legacyMember(communityId, ownerId, 'owner');

    const adminId = await newUser('sec-a8b-admin@example.com');
    await legacyMember(communityId, adminId, 'admin');

    await client.query(
      `insert into public.community_presence (owner_id, community_id, date)
       values ($1, $2, current_date)`,
      [adminId, communityId],
    );
    await client.query(
      `insert into public.whatsapp_list_drafts (
         owner_id, community_id, title, date, setters_section_title, reserve_section_title
       ) values ($1, $2, 'Rascunho', current_date, 'Levantadores', 'Reservas')`,
      [adminId, communityId],
    );

    await legacyMember(communityId, adminId, 'member');
    await asIdentity(client, adminId, async () => {
      const presence = await client.query(
        'update public.community_presence set updated_at = now() where owner_id = $1',
        [adminId],
      );
      assert.equal(presence.rowCount, 0, 'rebaixado, o ramo owner_id nao concede mais UPDATE');

      const draft = await client.query(
        'delete from public.whatsapp_list_drafts where owner_id = $1',
        [adminId],
      );
      assert.equal(draft.rowCount, 0, 'nem DELETE do rascunho que ele mesmo criou');
    });

    await legacyMember(communityId, adminId, 'admin');
    await asIdentity(client, adminId, async () => {
      const presence = await client.query(
        'update public.community_presence set updated_at = now() where owner_id = $1',
        [adminId],
      );
      assert.equal(presence.rowCount, 1, 'repromovido, a escrita legitima volta');
    });
  });

  test('A9: proposta de avatar deixa de ser legivel por anonimo; aprovado segue publico', async () => {
    // O stand-in de storage do harness nao liga RLS (ele existe para as migrations rodarem),
    // entao a suite liga aqui dentro de uma transacao revertida -- sem isso as policies
    // existiriam sem nunca serem avaliadas, e o teste provaria nada.
    const ownerId = await newUser('sec-a9-owner@example.com');
    const playerId = await newPlayer(ownerId, 'Dono do Avatar');
    const estranhoId = await newUser('sec-a9-estranho@example.com');

    await client.query('begin');
    try {
      await client.query(
        `insert into storage.buckets (id, name) values ('avatars', 'avatars')
         on conflict (id) do nothing`,
      );
      await client.query('alter table storage.objects enable row level security');
      await client.query('grant select on storage.objects to anon, authenticated');
      await client.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [
        `approved/${playerId}/foto.png`,
      ]);
      await client.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [
        `proposals/${playerId}/pendente.png`,
      ]);

      const visiveis = async (userId: string | null): Promise<string[]> => {
        await client.query('select set_config($1, $2, true)', [
          'request.jwt.claim.sub',
          userId ?? '',
        ]);
        await client.query('select set_config($1, $2, true)', [
          'request.jwt.claim.role',
          userId ? 'authenticated' : 'anon',
        ]);
        await client.query(`set local role ${userId ? 'authenticated' : 'anon'}`);
        const { rows } = await client.query<{ name: string }>(
          `select name from storage.objects where bucket_id = 'avatars' order by name`,
        );
        await client.query('set local role postgres');
        return rows.map((r) => r.name);
      };

      const anonimo = await visiveis(null);
      assert.deepEqual(
        anonimo,
        [`approved/${playerId}/foto.png`],
        'anonimo enxerga o avatar aprovado e nao a proposta pendente',
      );

      const semRelacao = await visiveis(estranhoId);
      assert.deepEqual(
        semRelacao,
        [`approved/${playerId}/foto.png`],
        'authenticated sem relacao com o atleta tambem nao enxerga a proposta',
      );

      const admin = await visiveis(ownerId);
      assert.deepEqual(
        admin,
        [`approved/${playerId}/foto.png`, `proposals/${playerId}/pendente.png`],
        'o admin do jogador continua enxergando a proposta na caixa de aprovacao',
      );
    } finally {
      await client.query('rollback').catch(() => undefined);
    }
  });
}
