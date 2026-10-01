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
  test(`peladas servidor requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function membroOrganizador(communityId: string) {
    const userId = await newUser(`org-${randomUUID()}@test.local`);
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [communityId, userId],
    );
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')`,
      [communityId, userId],
    );
    return userId;
  }

  async function membroComum(communityId: string) {
    const userId = await newUser(`comum-${randomUUID()}@test.local`);
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [communityId, userId],
    );
    return userId;
  }

  async function gravarTime(
    ator: string,
    communityId: string,
    sessionId: string,
    jogadores: string[],
  ) {
    const id = randomUUID();
    await call(
      ator,
      `insert into public.teams (id, owner_id, community_id, session_id, name, player_ids, local_id)
       values ($1::uuid, $2, $3, $4, 'Time', $5::text[], $6)`,
      [id, ator, communityId, sessionId, jogadores, id],
    );
    return id;
  }

  async function gravarJogo(
    ator: string,
    communityId: string,
    sessionId: string,
    a: string,
    b: string,
    status: string,
  ) {
    const id = randomUUID();
    await call(
      ator,
      `insert into public.games (id, owner_id, community_id, session_id, type, sequence_number,
         team_a_id, team_b_id, score_a, score_b, winner_team_id, status, local_id)
       values ($1::uuid, $2, $3, $4, 'free_play', 1, $5, $6, 1, 0, $5, $7, $8)`,
      [id, ator, communityId, sessionId, a, b, status, id],
    );
    return id;
  }

  async function gravarPonto(
    ator: string,
    communityId: string,
    sessionId: string,
    gameId: string,
    time: string,
    outro: string,
  ) {
    await call(
      ator,
      `insert into public.point_events (owner_id, community_id, session_id, game_id, sequence_number,
         scoring_team_id, conceding_team_id, occurred_at)
       values ($1, $2, $3, $4, 1, $5, $6, now())`,
      [ator, communityId, sessionId, gameId, time, outro],
    );
  }

  test('quem organiza pela responsabilidade grava times, jogos, pontos e relatorios', async () => {
    const { owner, communityId } = await montarDono();
    const org = await membroOrganizador(communityId);
    const sessionId = await criarPelada(owner, communityId);
    const a = await gravarTime(org, communityId, sessionId, []);
    const b = await gravarTime(org, communityId, sessionId, []);
    const jogo = await gravarJogo(org, communityId, sessionId, a, b, 'active');
    await gravarPonto(org, communityId, sessionId, jogo, a, b);
    await call(org, 'update public.games set score_a = 2 where id = $1', [jogo]);
    await call(
      org,
      `insert into public.game_reports (owner_id, community_id, session_id, game_id, sequence_number, generated_at, report)
       values ($1, $2, $3, $4, 1, now(), '{}'::jsonb)`,
      [org, communityId, sessionId, jogo],
    );
    await call(
      org,
      `insert into public.session_reports (owner_id, community_id, session_id, generated_at, report)
       values ($1, $2, $3, now(), '{}'::jsonb)`,
      [org, communityId, sessionId],
    );
    const { rows } = await client.query<{ score_a: number }>(
      'select score_a from public.games where id = $1',
      [jogo],
    );
    assert.equal(rows[0].score_a, 2);
  });

  test('membro comum e quem e de fora continuam sem gravar a pelada', async () => {
    const { owner, communityId } = await montarDono();
    const comum = await membroComum(communityId);
    const deFora = await newUser(`fora-${randomUUID()}@test.local`);
    const sessionId = await criarPelada(owner, communityId);
    for (const ator of [comum, deFora]) {
      const recusa = await erro(() => gravarTime(ator, communityId, sessionId, []));
      assert.equal(recusa.code, '42501');
    }
  });

  test('local e observacoes da pelada target, so para quem organiza e antes de encerrar', async () => {
    const { owner, communityId } = await montarDono();
    const comum = await membroComum(communityId);
    const sessionId = await criarPelada(owner, communityId);
    await call(owner, 'select public.set_target_session_details($1, $2, $3, $4)', [
      sessionId,
      await revisao(sessionId),
      'Bolão da Breves',
      'Levar bola',
    ]);
    const { rows } = await client.query<{ location: string; notes: string }>(
      'select location, notes from public.sessions where id = $1',
      [sessionId],
    );
    assert.deepEqual(rows[0], { location: 'Bolão da Breves', notes: 'Levar bola' });
    const recusa = await erro(async () =>
      call(comum, 'select public.set_target_session_details($1, $2, $3, $4)', [
        sessionId,
        await revisao(sessionId),
        'X',
        null,
      ]),
    );
    assert.equal(recusa.code, '42501');

    const encerrada = await criarPelada(owner, communityId);
    await elencoFechado(owner, communityId, encerrada);
    await congelar(owner, encerrada);
    await comando(owner, 'schedule_target_session', encerrada);
    await comando(owner, 'start_target_session', encerrada);
    await comando(owner, 'finish_target_session', encerrada);
    const fechada = await erro(async () =>
      call(owner, 'select public.set_target_session_details($1, $2, $3, $4)', [
        encerrada,
        await revisao(encerrada),
        'Y',
        null,
      ]),
    );
    assert.equal(fechada.code, '23514');
  });

  test('encerrar a pelada leva quem jogou para a carreira sem gravar nada depois', async () => {
    const { owner, communityId } = await montarDono();
    const sessionId = await criarPelada(owner, communityId);
    await elencoFechado(owner, communityId, sessionId);
    await congelar(owner, sessionId);
    await comando(owner, 'schedule_target_session', sessionId);
    await comando(owner, 'start_target_session', sessionId);
    const jogadores: string[] = [];
    for (const nome of ['A1', 'A2', 'B1', 'B2']) {
      jogadores.push(await atletaNoElenco(communityId, owner, nome));
    }
    const a = await gravarTime(owner, communityId, sessionId, jogadores.slice(0, 2));
    const b = await gravarTime(owner, communityId, sessionId, jogadores.slice(2));
    const jogo = await gravarJogo(owner, communityId, sessionId, a, b, 'finished');
    await gravarPonto(owner, communityId, sessionId, jogo, a, b);
    const antes = await client.query(
      `select 1 from public.career_events where session_id = $1 and type = 'session_played'`,
      [sessionId],
    );
    assert.equal(antes.rowCount, 0);
    await comando(owner, 'finish_target_session', sessionId);
    const depois = await client.query(
      `select player_id from public.career_events where session_id = $1 and type = 'session_played'`,
      [sessionId],
    );
    assert.equal(depois.rowCount, 4);
  });
}
