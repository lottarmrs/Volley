import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Client, Pool, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

if (!isTestDatabaseConfigured()) {
  test(`pelada target no app requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function call<T extends QueryResultRow = QueryResultRow>(
    userId: string,
    sql: string,
    params: unknown[] = [],
  ) {
    const db = await pool.connect();
    try {
      return await asIdentityCommitting(db, userId, () => db.query<T>(sql, params));
    } finally {
      db.release();
    }
  }

  async function erro(fn: () => Promise<unknown>): Promise<{ code?: string; message: string }> {
    try {
      await fn();
    } catch (error) {
      return error as { code?: string; message: string };
    }
    assert.fail('era esperado um erro');
  }

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

  async function comunidadeComoApp(ownerId: string): Promise<string> {
    const id = randomUUID();
    await call(
      ownerId,
      'insert into public.communities (id, owner_id, name, local_id) values ($1::uuid, $2, $3, $4)',
      [id, ownerId, `Pelada ${id.slice(0, 6)}`, id],
    );
    return id;
  }

  async function atletaNoElenco(communityId: string, ownerId: string, nome: string) {
    const id = randomUUID();
    await client.query(
      `insert into public.players (id, owner_id, name, active, has_account_identity_history)
       values ($1, $2, $3, true, false)`,
      [id, ownerId, nome],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, id, ownerId],
    );
    return id;
  }

  async function membroElegivel(communityId: string, ownerId: string) {
    const userId = await newUser(`membro-${randomUUID()}@test.local`);
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [communityId, userId],
    );
    const playerId = await atletaNoElenco(communityId, ownerId, 'Membro');
    await client.query(
      `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
       values ($1, $2, 'ACTIVE', 'SELF_CLAIM', now())`,
      [playerId, userId],
    );
    return { userId, playerId };
  }

  async function revisao(sessionId: string): Promise<number> {
    const { rows } = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [sessionId],
    );
    return rows[0].revision;
  }

  async function estado(sessionId: string): Promise<string> {
    const { rows } = await client.query<{ lifecycle_status: string }>(
      'select lifecycle_status from public.sessions where id = $1',
      [sessionId],
    );
    return rows[0].lifecycle_status;
  }

  async function criarPelada(ownerId: string, communityId: string): Promise<string> {
    const sessionId = randomUUID();
    await call(
      ownerId,
      `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', 'Pelada',
         now() + interval '1 day', null)`,
      [sessionId, communityId],
    );
    return sessionId;
  }

  async function janelaAberta(ownerId: string, sessionId: string, vagas: number) {
    const windowId = randomUUID();
    const criada = await call<{ window_revision: number }>(
      ownerId,
      'select * from public.create_registration_window($1, $2, $3, $4, null)',
      [randomUUID(), windowId, sessionId, vagas],
    );
    const aberta = await call<{ window_revision: number }>(
      ownerId,
      'select * from public.open_registration($1, $2, $3)',
      [randomUUID(), windowId, criada.rows[0].window_revision],
    );
    return { windowId, revision: aberta.rows[0].window_revision };
  }

  async function elencoFechado(ownerId: string, communityId: string, sessionId: string) {
    const { windowId, revision: aberta } = await janelaAberta(ownerId, sessionId, 4);
    let revision = aberta;
    for (const nome of ['Ana', 'Bia', 'Caio', 'Duda']) {
      const playerId = await atletaNoElenco(communityId, ownerId, nome);
      const r = await call<{ window_revision: number }>(
        ownerId,
        'select * from public.add_registration_entry($1, $2, $3, $4)',
        [randomUUID(), randomUUID(), windowId, playerId],
      );
      revision = r.rows[0].window_revision;
    }
    for (const comando of ['close_registration', 'lock_registration']) {
      const r = await call<{ window_revision: number }>(
        ownerId,
        `select * from public.${comando}($1, $2, $3)`,
        [randomUUID(), windowId, revision],
      );
      revision = r.rows[0].window_revision;
    }
    await call(ownerId, 'select * from public.finalize_session_roster($1, $2, $3)', [
      randomUUID(),
      windowId,
      revision,
    ]);
  }

  const REGRAS = JSON.stringify({ type: 'free_play', config: { type: 'free_play', teamCount: 2 } });

  async function congelar(ownerId: string, sessionId: string) {
    await call(
      ownerId,
      `select * from public.freeze_target_session_rules_snapshot($1, $2, $3, 1, 'SESSION_EXPLICIT', $4::jsonb)`,
      [randomUUID(), sessionId, await revisao(sessionId), REGRAS],
    );
  }

  async function comando(ownerId: string, nome: string, sessionId: string) {
    await call(ownerId, `select * from public.${nome}($1, $2, $3)`, [
      randomUUID(),
      sessionId,
      await revisao(sessionId),
    ]);
  }

  async function montarDono() {
    const owner = await newUser(`dono-${randomUUID()}@test.local`);
    const communityId = await comunidadeComoApp(owner);
    return { owner, communityId };
  }

  test('o fluxo do app vai de marcar a encerrar, e encerrar exige os jogos terminados', async () => {
    const { owner, communityId } = await montarDono();
    const sessionId = await criarPelada(owner, communityId);
    await elencoFechado(owner, communityId, sessionId);
    await congelar(owner, sessionId);
    await comando(owner, 'schedule_target_session', sessionId);
    await comando(owner, 'start_target_session', sessionId);
    assert.equal(await estado(sessionId), 'IN_PROGRESS');

    const teamId = randomUUID();
    const gameId = randomUUID();
    await call(
      owner,
      `insert into public.teams (id, owner_id, community_id, session_id, name, player_ids, local_id)
       values ($1::uuid, $2, $3, $4, 'A', '{}'::text[], $5)`,
      [teamId, owner, communityId, sessionId, teamId],
    );
    await call(
      owner,
      `insert into public.games (id, owner_id, community_id, session_id, type, sequence_number,
         team_a_id, team_b_id, status, local_id)
       values ($1::uuid, $2, $3, $4, 'free_play', 1, $5, $5, 'active', $6)`,
      [gameId, owner, communityId, sessionId, teamId, gameId],
    );
    await call(
      owner,
      `insert into public.point_events (owner_id, community_id, session_id, game_id, sequence_number,
         scoring_team_id, conceding_team_id, occurred_at)
       values ($1, $2, $3, $4, 1, $5, $5, now())`,
      [owner, communityId, sessionId, gameId, teamId],
    );

    const ativo = await erro(() => comando(owner, 'finish_target_session', sessionId));
    assert.equal(ativo.code, '23514');
    await call(owner, "update public.games set status = 'cancelled' where id = $1", [gameId]);
    await comando(owner, 'finish_target_session', sessionId);
    assert.equal(await estado(sessionId), 'COMPLETED');
  });

  test('iniciar sem congelar as regras recusa por RULES_INVALID', async () => {
    const { owner, communityId } = await montarDono();
    const sessionId = await criarPelada(owner, communityId);
    await elencoFechado(owner, communityId, sessionId);
    await comando(owner, 'schedule_target_session', sessionId);
    const recusa = await erro(() => comando(owner, 'start_target_session', sessionId));
    assert.equal(recusa.code, '23514');
    assert.match(recusa.message, /RULES_INVALID/);
  });

  test('a raiz target nao aceita gravacao direta', async () => {
    const { owner, communityId } = await montarDono();
    const sessionId = await criarPelada(owner, communityId);
    const { rowCount } = await call(
      owner,
      "update public.sessions set status = 'finished' where id = $1",
      [sessionId],
    );
    assert.equal(rowCount, 0);
  });

  test('membro comum le as regras congeladas mas nao inicia a pelada', async () => {
    const { owner, communityId } = await montarDono();
    const membro = await membroElegivel(communityId, owner);
    const sessionId = await criarPelada(owner, communityId);
    await elencoFechado(owner, communityId, sessionId);
    await congelar(owner, sessionId);
    await comando(owner, 'schedule_target_session', sessionId);
    const { rows } = await call<{ rules_payload: { config: { teamCount: number } } }>(
      membro.userId,
      'select rules_payload from public.session_rules_snapshots where session_id = $1',
      [sessionId],
    );
    assert.equal(rows[0].rules_payload.config.teamCount, 2);
    const recusa = await erro(() => comando(membro.userId, 'start_target_session', sessionId));
    assert.equal(recusa.code, '42501');
  });

  test('cancelar uma pelada agendada', async () => {
    const { owner, communityId } = await montarDono();
    const sessionId = await criarPelada(owner, communityId);
    await elencoFechado(owner, communityId, sessionId);
    await congelar(owner, sessionId);
    await comando(owner, 'schedule_target_session', sessionId);
    await call(owner, "select * from public.cancel_target_session($1, $2, $3, 'Choveu')", [
      randomUUID(),
      sessionId,
      await revisao(sessionId),
    ]);
    assert.equal(await estado(sessionId), 'CANCELLED');
  });

  test('marcar e abrir a lista numa vez deixa o membro entrar', async () => {
    const { owner, communityId } = await montarDono();
    const membro = await membroElegivel(communityId, owner);
    const sessionId = await criarPelada(owner, communityId);
    const { windowId } = await janelaAberta(owner, sessionId, 12);
    const lida = await call<{ status: string }>(
      owner,
      'select * from public.read_registration_window($1)',
      [windowId],
    );
    assert.equal(lida.rows[0].status, 'OPEN');
    const entrou = await call<{ entry_status: string }>(
      membro.userId,
      'select * from public.join_registration($1, $2, $3)',
      [randomUUID(), randomUUID(), windowId],
    );
    assert.equal(entrou.rows[0].entry_status, 'CONFIRMED');
  });

  test('pelada rapida: lista preenchida e fechada na hora, e ja inicia', async () => {
    const { owner, communityId } = await montarDono();
    const sessionId = await criarPelada(owner, communityId);
    await elencoFechado(owner, communityId, sessionId);
    await congelar(owner, sessionId);
    await comando(owner, 'schedule_target_session', sessionId);
    await comando(owner, 'start_target_session', sessionId);
    assert.equal(await estado(sessionId), 'IN_PROGRESS');
  });

  test('reabrir a lista fechada, incluir alguem e fechar de novo gera elenco novo', async () => {
    const { owner, communityId } = await montarDono();
    const sessionId = await criarPelada(owner, communityId);
    await elencoFechado(owner, communityId, sessionId);
    const { rows: janelas } = await client.query<{ id: string; revision: number }>(
      'select id, revision from public.registration_windows where session_id = $1',
      [sessionId],
    );
    const windowId = janelas[0].id;
    const reaberta = await call<{ window_revision: number }>(
      owner,
      'select * from public.reopen_registration($1, $2, $3)',
      [randomUUID(), windowId, janelas[0].revision],
    );
    let revision = reaberta.rows[0].window_revision;
    await client.query(
      'update public.registration_windows set capacity = capacity + 1 where id = $1',
      [windowId],
    );
    revision = (
      await client.query<{ revision: number }>(
        'select revision from public.registration_windows where id = $1',
        [windowId],
      )
    ).rows[0].revision;
    const novo = await atletaNoElenco(communityId, owner, 'Chegou tarde');
    const entrou = await call<{ window_revision: number }>(
      owner,
      'select * from public.add_registration_entry($1, $2, $3, $4)',
      [randomUUID(), randomUUID(), windowId, novo],
    );
    revision = entrou.rows[0].window_revision;
    for (const cmd of ['close_registration', 'lock_registration']) {
      const r = await call<{ window_revision: number }>(
        owner,
        `select * from public.${cmd}($1, $2, $3)`,
        [randomUUID(), windowId, revision],
      );
      revision = r.rows[0].window_revision;
    }
    const final = await call<{ roster_revision_number: number }>(
      owner,
      'select * from public.finalize_session_roster($1, $2, $3)',
      [randomUUID(), windowId, revision],
    );
    assert.equal(final.rows[0].roster_revision_number, 2);
    const { rows: entradas } = await client.query(
      `select e.player_id from public.roster_revision_entries e
         join public.roster_revisions r on r.id = e.roster_revision_id
        where r.session_id = $1 and r.revision_number = 2`,
      [sessionId],
    );
    assert.equal(entradas.length, 5);
  });
}
