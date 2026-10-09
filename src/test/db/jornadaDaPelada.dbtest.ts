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
  test(`jornada da pelada requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function membro(communityId: string, nome: string) {
    const userId = await newUser(`${nome.toLowerCase()}-${randomUUID()}@test.local`);
    await client.query(
      `insert into public.community_members (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [communityId, userId],
    );
    await client.query('select app_private.enroll_approved_member($1, $2)', [communityId, userId]);
    const { rows } = await client.query<{ id: string }>(
      'select id from public.players where user_id = $1',
      [userId],
    );
    return { nome, userId, playerId: rows[0].id };
  }

  async function revisaoDaJanela(windowId: string): Promise<number> {
    const { rows } = await client.query<{ revision: number }>(
      'select revision from public.registration_windows where id = $1',
      [windowId],
    );
    return rows[0].revision;
  }

  async function revisaoDaPelada(sessionId: string): Promise<number> {
    const { rows } = await client.query<{ revision: number }>(
      'select revision from public.sessions where id = $1',
      [sessionId],
    );
    return rows[0].revision;
  }

  async function situacao(windowId: string) {
    const { rows } = await client.query<{ player_id: string; status: string }>(
      `select player_id, status from public.registration_entries
        where registration_window_id = $1 and status in ('CONFIRMED', 'WAITLISTED')`,
      [windowId],
    );
    const confirmados = rows.filter((r) => r.status === 'CONFIRMED').map((r) => r.player_id);
    const { rows: fila } = await client.query<{ player_id: string }>(
      'select player_id from app_private.registration_reserve_order($1) order by posicao',
      [windowId],
    );
    return { confirmados: new Set(confirmados), reserva: fila.map((r) => r.player_id) };
  }

  async function comandoDaJanela(actor: string, nome: string, windowId: string) {
    await call(actor, `select * from public.${nome}($1, $2, $3)`, [
      randomUUID(),
      windowId,
      await revisaoDaJanela(windowId),
    ]);
  }

  async function comandoDaPelada(actor: string, nome: string, sessionId: string) {
    await call(actor, `select * from public.${nome}($1, $2, $3)`, [
      randomUUID(),
      sessionId,
      await revisaoDaPelada(sessionId),
    ]);
  }

  test('jornada de uma pelada: lista, reserva, pagamento, sorteio, jogo ao vivo e historico', async () => {
    const dono = await newUser(`dono-${randomUUID()}@test.local`);
    const communityId = randomUUID();
    await call(
      dono,
      'insert into public.communities (id, owner_id, name, local_id) values ($1::uuid, $2, $3, $4)',
      [communityId, dono, 'Pelada de quinta', communityId],
    );
    const pessoas: Awaited<ReturnType<typeof membro>>[] = [];
    for (const nome of ['Ana', 'Bia', 'Caio', 'Duda', 'Eva', 'Fabio']) {
      pessoas.push(await membro(communityId, nome));
    }
    const [a, b, c, d, e, f] = pessoas;
    const fora = await newUser(`fora-${randomUUID()}@test.local`);

    const sessionId = randomUUID();
    await call(
      dono,
      `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', 'Pelada de quinta',
         now() + interval '1 day', null)`,
      [sessionId, communityId],
    );
    const windowId = randomUUID();
    await call(dono, 'select * from public.create_registration_window($1, $2, $3, $4, null)', [
      randomUUID(),
      windowId,
      sessionId,
      4,
    ]);
    await comandoDaJanela(dono, 'open_registration', windowId);

    const entradas: Record<string, string> = {};
    for (const p of pessoas) {
      const { rows } = await call<{ entry_status: string }>(
        p.userId,
        'select * from public.join_registration($1, $2, $3)',
        [randomUUID(), randomUUID(), windowId],
      );
      entradas[p.nome] = rows[0].entry_status;
    }
    assert.deepEqual(entradas, {
      Ana: 'CONFIRMED',
      Bia: 'CONFIRMED',
      Caio: 'CONFIRMED',
      Duda: 'CONFIRMED',
      Eva: 'WAITLISTED',
      Fabio: 'WAITLISTED',
    });

    const quemNaoEDoGrupo = await erro(() =>
      call(fora, 'select * from public.join_registration($1, $2, $3)', [
        randomUUID(),
        randomUUID(),
        windowId,
      ]),
    );
    assert.ok(quemNaoEDoGrupo.code, 'quem nao e do grupo nao entra');

    const quadroDaEva = await call<{ board: { viewer_entry_status: string } }>(
      e.userId,
      'select public.read_registration_board($1) as board',
      [windowId],
    );
    assert.equal(quadroDaEva.rows[0].board.viewer_entry_status, 'WAITLISTED');

    await call(b.userId, 'select * from public.leave_registration($1, $2)', [
      randomUUID(),
      windowId,
    ]);
    let agora = await situacao(windowId);
    assert.ok(agora.confirmados.has(e.playerId), 'Bia saiu e a Eva, primeira da reserva, subiu');
    assert.deepEqual(agora.reserva, [f.playerId]);

    for (const p of [a, c, d]) {
      await call(dono, 'select * from public.mark_registration_payment($1, $2, $3, true)', [
        randomUUID(),
        windowId,
        p.playerId,
      ]);
    }
    await call(dono, 'select * from public.mark_registration_payment($1, $2, $3, true)', [
      randomUUID(),
      windowId,
      f.playerId,
    ]);
    await call(dono, 'select * from public.set_registration_payment_due($1, $2, $3)', [
      randomUUID(),
      windowId,
      new Date(Date.now() + 3600000).toISOString(),
    ]);
    await client.query(
      `update public.registration_windows set payment_due_at = now() - interval '1 minute'
        where id = $1`,
      [windowId],
    );
    await call(dono, 'select * from public.apply_registration_payment_deadline($1, $2)', [
      randomUUID(),
      windowId,
    ]);
    agora = await situacao(windowId);
    assert.ok(agora.confirmados.has(f.playerId), 'o Fabio pagou na reserva e subiu');
    assert.ok(!agora.confirmados.has(e.playerId), 'a Eva nao pagou e desceu para a reserva');
    assert.deepEqual(agora.reserva, [e.playerId]);

    const membroNaoFecha = await erro(() =>
      comandoDaJanela(a.userId, 'close_registration', windowId),
    );
    assert.equal(membroNaoFecha.code, '42501');

    await comandoDaJanela(dono, 'close_registration', windowId);
    await comandoDaJanela(dono, 'lock_registration', windowId);
    const finalizado = await call<{ roster_revision_id: string }>(
      dono,
      'select * from public.finalize_session_roster($1, $2, $3)',
      [randomUUID(), windowId, await revisaoDaJanela(windowId)],
    );
    const rosterRevisionId = finalizado.rows[0].roster_revision_id;
    const { rows: elenco } = await client.query<{ player_id: string }>(
      'select player_id from public.roster_revision_entries where roster_revision_id = $1',
      [rosterRevisionId],
    );
    assert.deepEqual(
      new Set(elenco.map((r) => r.player_id)),
      new Set([a.playerId, c.playerId, d.playerId, f.playerId]),
      'joga quem ficou confirmado depois do corte',
    );

    const foto = await call<{ snapshot: { participants: unknown[] } }>(
      dono,
      'select public.capture_balance_input_snapshot($1, $2, $3) as snapshot',
      [randomUUID(), sessionId, rosterRevisionId],
    );
    assert.equal(foto.rows[0].snapshot.participants.length, 4, 'o sorteio enxerga os quatro');

    await call(
      dono,
      `select * from public.freeze_target_session_rules_snapshot($1, $2, $3, 1, 'SESSION_EXPLICIT', $4::jsonb)`,
      [
        randomUUID(),
        sessionId,
        await revisaoDaPelada(sessionId),
        JSON.stringify({ type: 'free_play', config: { type: 'free_play', teamCount: 2 } }),
      ],
    );
    await comandoDaPelada(dono, 'schedule_target_session', sessionId);
    await comandoDaPelada(dono, 'start_target_session', sessionId);

    await call(dono, 'select public.set_community_organizer($1, $2, $3)', [
      communityId,
      c.userId,
      true,
    ]);
    const timeA = randomUUID();
    const timeB = randomUUID();
    for (const [id, nome, jogadores] of [
      [timeA, 'Time 1', [a.playerId, c.playerId]],
      [timeB, 'Time 2', [d.playerId, f.playerId]],
    ] as const) {
      await call(
        dono,
        `insert into public.teams (id, owner_id, community_id, session_id, name, player_ids, local_id)
         values ($1::uuid, $2, $3, $4, $5, $6::text[], $7)`,
        [id, dono, communityId, sessionId, nome, jogadores, id],
      );
    }
    const jogo = randomUUID();
    await call(
      c.userId,
      `insert into public.games (id, owner_id, community_id, session_id, type, sequence_number,
         team_a_id, team_b_id, status, score_a, score_b, local_id)
       values ($1::uuid, $2, $3, $4, 'free_play', 1, $5, $6, 'active', 0, 0, $7)`,
      [jogo, c.userId, communityId, sessionId, timeA, timeB, jogo],
    );
    for (let ponto = 1; ponto <= 3; ponto += 1) {
      await call(
        c.userId,
        `insert into public.point_events (owner_id, community_id, session_id, game_id,
           sequence_number, scoring_team_id, conceding_team_id, player_id, point_type, occurred_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'winner', now())`,
        [c.userId, communityId, sessionId, jogo, ponto, timeA, timeB, a.playerId],
      );
      await call(c.userId, 'update public.games set score_a = $2 where id = $1', [jogo, ponto]);
    }

    const aoVivo = await call<{ score_a: number; status: string }>(
      e.userId,
      'select score_a, status from public.games where id = $1',
      [jogo],
    );
    assert.deepEqual(aoVivo.rows[0], { score_a: 3, status: 'active' }, 'a Eva acompanha o placar');
    const pontosVistos = await call(
      e.userId,
      'select 1 from public.point_events where session_id = $1',
      [sessionId],
    );
    assert.equal(pontosVistos.rowCount, 3);

    const membroMarca = await call(e.userId, 'update public.games set score_a = 99 where id = $1', [
      jogo,
    ]).catch((thrown: { code?: string }) => thrown);
    const naoMexeu = await client.query<{ score_a: number }>(
      'select score_a from public.games where id = $1',
      [jogo],
    );
    assert.equal(naoMexeu.rows[0].score_a, 3, 'membro comum nao muda o placar');
    void membroMarca;
    const membroPonto = await erro(() =>
      call(
        e.userId,
        `insert into public.point_events (owner_id, community_id, session_id, game_id,
           sequence_number, scoring_team_id, conceding_team_id, occurred_at)
         values ($1, $2, $3, $4, 4, $5, $6, now())`,
        [e.userId, communityId, sessionId, jogo, timeA, timeB],
      ),
    );
    assert.equal(membroPonto.code, '42501', 'membro comum nao marca ponto');

    const foraVe = await call(fora, 'select 1 from public.games where id = $1', [jogo]);
    assert.equal(foraVe.rowCount, 0, 'quem nao e do grupo nao ve o jogo');

    await call(
      c.userId,
      `update public.games set status = 'finished', winner_team_id = $2, loser_team_id = $3,
         finished_at = now() where id = $1`,
      [jogo, timeA, timeB],
    );
    await comandoDaPelada(dono, 'finish_target_session', sessionId);

    const historico = await call<{ status: string }>(
      e.userId,
      'select status from public.sessions where id = $1',
      [sessionId],
    );
    assert.equal(historico.rows[0].status, 'finished', 'a Eva ve a pelada no historico');
    const jogosNoHistorico = await call<{ score_a: number; status: string }>(
      b.userId,
      'select score_a, status from public.games where session_id = $1',
      [sessionId],
    );
    assert.deepEqual(jogosNoHistorico.rows, [{ score_a: 3, status: 'finished' }]);
    const { rows: carreira } = await client.query<{ player_id: string }>(
      `select distinct player_id from public.career_events
        where session_id = $1 and type = 'session_played'`,
      [sessionId],
    );
    assert.deepEqual(
      new Set(carreira.map((r) => r.player_id)),
      new Set([a.playerId, c.playerId, d.playerId, f.playerId]),
      'a carreira conta quem jogou, e so quem jogou',
    );
    const { rows: daAna } = await client.query<{ payload: Record<string, number> }>(
      `select payload from public.career_events
        where session_id = $1 and player_id = $2 and type = 'session_played'`,
      [sessionId, a.playerId],
    );
    assert.deepEqual(
      {
        jogos: daAna[0].payload.games_played,
        vitorias: daAna[0].payload.games_won,
        pontos: daAna[0].payload.points,
      },
      { jogos: 1, vitorias: 1, pontos: 3 },
      'a Ana, com a propria conta, ganha o jogo, a vitoria e os pontos marcados por outra pessoa',
    );
  });

  test('ids locais iguais em contas diferentes nao misturam carreiras', async () => {
    async function peladaLocal(label: string) {
      const dono = await newUser(`${label}-${randomUUID()}@test.local`);
      const communityId = randomUUID();
      await call(
        dono,
        'insert into public.communities (id, owner_id, name, local_id) values ($1::uuid, $2, $3, $4)',
        [communityId, dono, label, communityId],
      );
      const playerId = randomUUID();
      await client.query(
        `insert into public.players (id, owner_id, name, active, local_id, has_account_identity_history)
         values ($1, $2, 'Atleta', true, 'loc-p1', false)`,
        [playerId, dono],
      );
      const sessionId = randomUUID();
      await client.query(
        `insert into public.sessions (id, owner_id, community_id, name, date, status, type, local_id)
         values ($1, $2, $3, 'Pelada', current_date, 'active', 'free_play', $4)`,
        [sessionId, dono, communityId, `loc-s-${label}`],
      );
      await client.query(
        `insert into public.teams (id, owner_id, community_id, session_id, name, player_ids, local_id)
         values ($1, $2, $3, $4, 'A', '{loc-p1}', 'loc-t1')`,
        [randomUUID(), dono, communityId, sessionId],
      );
      await client.query(
        `insert into public.games (id, owner_id, community_id, session_id, type, sequence_number,
           team_a_id, team_b_id, status, winner_team_id, local_id)
         values ($1, $2, $3, $4, 'free_play', 1, 'loc-t1', 'loc-t1', 'finished', 'loc-t1', 'loc-g1')`,
        [randomUUID(), dono, communityId, sessionId],
      );
      return { dono, communityId, playerId, sessionId };
    }

    const a = await peladaLocal('conta-a');
    const b = await peladaLocal('conta-b');
    for (let ponto = 1; ponto <= 5; ponto += 1) {
      await client.query(
        `insert into public.point_events (owner_id, community_id, session_id, game_id,
           sequence_number, scoring_team_id, conceding_team_id, player_id, point_type, occurred_at)
         values ($1, $2, $3, 'loc-g1', $4, 'loc-t1', 'loc-t1', 'loc-p1', 'winner', now())`,
        [b.dono, b.communityId, b.sessionId, ponto],
      );
    }
    await client.query(
      "update public.sessions set status = 'finished' where id = any($1::uuid[])",
      [[a.sessionId, b.sessionId]],
    );
    await client.query('select public.regenerate_career_events_for_sessions($1::uuid[])', [
      [a.sessionId, b.sessionId],
    ]);
    const { rows } = await client.query<{ player_id: string; points: number }>(
      `select player_id, (payload->>'points')::int as points from public.career_events
        where session_id = any($1::uuid[]) and type = 'session_played'`,
      [[a.sessionId, b.sessionId]],
    );
    const pontos = Object.fromEntries(rows.map((r) => [r.player_id, r.points]));
    assert.equal(pontos[a.playerId], 0, 'os pontos da conta B nao entram na carreira da conta A');
    assert.equal(pontos[b.playerId], 5);
  });
}
