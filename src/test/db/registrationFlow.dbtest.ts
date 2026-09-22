import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client } from 'pg';
import {
  asIdentity,
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';

interface Board {
  status: string;
  capacity: number;
  revision: number;
  confirmed_count: number;
  waitlisted_count: number;
  entries: { player_id: string; status: string; queue_position: number | null }[];
}

if (!isTestDatabaseConfigured()) {
  test(`registration flow requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function newUser(label: string): Promise<string> {
    const email = `${label}-${randomUUID()}@test.local`;
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

  async function cenario(capacidade: number) {
    const ownerId = await newUser('owner');
    const { rows } = await asIdentityCommitting(client, ownerId, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Fluxo ${randomUUID()}`,
      ]),
    );
    const communityId = rows[0].id;
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'ORGANIZER')
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [communityId, ownerId],
    );
    const sessionId = randomUUID();
    await asIdentityCommitting(client, ownerId, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [sessionId, communityId, 'Pelada'],
      ),
    );
    const windowId = randomUUID();
    await asIdentityCommitting(client, ownerId, () =>
      client.query('select * from public.create_registration_window($1,$2,$3,$4,null)', [
        randomUUID(),
        windowId,
        sessionId,
        capacidade,
      ]),
    );
    await asIdentityCommitting(client, ownerId, () =>
      client.query('select * from public.open_registration($1,$2,$3)', [randomUUID(), windowId, 1]),
    );
    return { ownerId, communityId, sessionId, windowId };
  }

  async function atleta(cenarioAtual: { ownerId: string; communityId: string }, nome: string) {
    const userId = await newUser(nome);
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [cenarioAtual.communityId, userId],
    );
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
      [cenarioAtual.communityId, playerId, cenarioAtual.ownerId],
    );
    return { userId, playerId };
  }

  const board = async (actorId: string, windowId: string): Promise<Board> =>
    (
      await asIdentityCommitting(client, actorId, () =>
        client.query<{ board: Board }>('select public.read_registration_board($1) as board', [
          windowId,
        ]),
      )
    ).rows[0].board;

  const entrar = (userId: string, windowId: string) =>
    asIdentityCommitting(client, userId, () =>
      client.query<{ entry_status: string }>('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        windowId,
      ]),
    );

  test('enche a capacidade, manda para a reserva e promove quem fica quando alguém sai', async () => {
    const c = await cenario(2);
    const ana = await atleta(c, 'Ana');
    const bia = await atleta(c, 'Bia');
    const caio = await atleta(c, 'Caio');

    assert.equal((await entrar(ana.userId, c.windowId)).rows[0].entry_status, 'CONFIRMED');
    assert.equal((await entrar(bia.userId, c.windowId)).rows[0].entry_status, 'CONFIRMED');
    assert.equal((await entrar(caio.userId, c.windowId)).rows[0].entry_status, 'WAITLISTED');

    await asIdentityCommitting(client, ana.userId, () =>
      client.query('select * from public.leave_registration($1,$2)', [randomUUID(), c.windowId]),
    );

    const depois = await board(c.ownerId, c.windowId);
    assert.equal(depois.confirmed_count, 2);
    assert.equal(depois.waitlisted_count, 0);
    assert.deepEqual(
      depois.entries.map((entry) => entry.player_id).sort(),
      [bia.playerId, caio.playerId].sort(),
    );
  });

  test('o organizador inclui e tira quem precisar', async () => {
    const c = await cenario(4);
    const duda = await atleta(c, 'Duda');

    await asIdentityCommitting(client, c.ownerId, () =>
      client.query('select * from public.add_registration_entry($1,$2,$3,$4)', [
        randomUUID(),
        randomUUID(),
        c.windowId,
        duda.playerId,
      ]),
    );
    const comDuda = await board(c.ownerId, c.windowId);
    assert.equal(comDuda.confirmed_count, 1);
    assert.equal(comDuda.entries[0].status, 'CONFIRMED');

    await asIdentityCommitting(client, c.ownerId, () =>
      client.query('select * from public.remove_registration_entry($1,$2,$3,$4)', [
        randomUUID(),
        c.windowId,
        duda.playerId,
        'ORGANIZER_DESELECTED',
      ]),
    );
    assert.equal((await board(c.ownerId, c.windowId)).confirmed_count, 0);
  });

  test('capacidade abaixo do confirmado é recusada, e acima libera a reserva', async () => {
    const c = await cenario(1);
    const ana = await atleta(c, 'Ana');
    const bia = await atleta(c, 'Bia');
    await entrar(ana.userId, c.windowId);
    await entrar(bia.userId, c.windowId);

    const recusa = await asIdentity(client, c.ownerId, () =>
      client.query('select * from public.change_registration_capacity($1,$2,$3)', [
        randomUUID(),
        c.windowId,
        0,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.ok((recusa as { code?: string }).code);

    await asIdentityCommitting(client, c.ownerId, () =>
      client.query('select * from public.change_registration_capacity($1,$2,$3)', [
        randomUUID(),
        c.windowId,
        2,
      ]),
    );
    const depois = await board(c.ownerId, c.windowId);
    assert.equal(depois.capacity, 2);
    assert.equal(depois.confirmed_count, 2);
    assert.equal(depois.waitlisted_count, 0);
  });

  test('fechada não aceita inscrição, e reabrir volta a aceitar', async () => {
    const c = await cenario(3);
    const ana = await atleta(c, 'Ana');
    const bia = await atleta(c, 'Bia');
    await entrar(ana.userId, c.windowId);

    const revisao = (await board(c.ownerId, c.windowId)).revision;
    await asIdentityCommitting(client, c.ownerId, () =>
      client.query('select * from public.close_registration($1,$2,$3)', [
        randomUUID(),
        c.windowId,
        revisao,
      ]),
    );

    const recusa = await asIdentity(client, bia.userId, () =>
      client.query('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        c.windowId,
      ]),
    ).catch((thrown: Error) => thrown);
    assert.equal((recusa as { code?: string }).code, '23514');

    const fechada = await board(c.ownerId, c.windowId);
    assert.equal(fechada.status, 'CLOSED');
    await asIdentityCommitting(client, c.ownerId, () =>
      client.query('select * from public.reopen_registration($1,$2,$3)', [
        randomUUID(),
        c.windowId,
        fechada.revision,
      ]),
    );
    assert.equal((await entrar(bia.userId, c.windowId)).rows[0].entry_status, 'CONFIRMED');
  });

  test('o elenco finalizado sai dos confirmados da inscrição', async () => {
    const c = await cenario(2);
    const ana = await atleta(c, 'Ana');
    const bia = await atleta(c, 'Bia');
    await entrar(ana.userId, c.windowId);
    await entrar(bia.userId, c.windowId);

    let revisao = (await board(c.ownerId, c.windowId)).revision;
    for (const comando of ['close_registration', 'lock_registration']) {
      revisao = (
        await asIdentityCommitting(client, c.ownerId, () =>
          client.query<{ window_revision: number }>(`select * from public.${comando}($1,$2,$3)`, [
            randomUUID(),
            c.windowId,
            revisao,
          ]),
        )
      ).rows[0].window_revision;
    }
    const finalizado = await asIdentityCommitting(client, c.ownerId, () =>
      client.query<{ roster_revision_id: string }>(
        'select * from public.finalize_session_roster($1,$2,$3)',
        [randomUUID(), c.windowId, revisao],
      ),
    );

    const elenco = await asIdentityCommitting(client, c.ownerId, () =>
      client.query<{ entries: { player_id: string }[] }>(
        'select * from public.read_target_roster_revision($1)',
        [finalizado.rows[0].roster_revision_id],
      ),
    );
    assert.deepEqual(
      elenco.rows[0].entries.map((entry) => entry.player_id).sort(),
      [ana.playerId, bia.playerId].sort(),
    );
  });
}
