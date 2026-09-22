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

const MIGRATION = '20260922120000_registration_board.sql';

interface BoardEntry {
  entry_id: string;
  player_id: string;
  status: string;
  queue_position: number | null;
  source: string;
  joined_at: string;
}

interface Board {
  window_id: string;
  session_id: string;
  status: string;
  revision: number;
  capacity: number;
  confirmed_count: number;
  waitlisted_count: number;
  viewer_can_manage: boolean;
  viewer_player_id: string | null;
  viewer_entry_status: string | null;
  viewer_queue_position: number | null;
  entries: BoardEntry[];
}

if (!isTestDatabaseConfigured()) {
  test(`registration board requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run npm run test:db.`);
  });
} else {
  let client: Client;

  test.before(async () => {
    client = await connect();
    const result = await rebuildFromMigrations(client);
    assert.deepEqual(
      result.failures.filter(({ migration }) => migration === MIGRATION),
      [],
    );
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

  async function newPlayer(
    ownerId: string,
    communityId: string,
    name: string,
    userId: string | null = null,
  ): Promise<string> {
    const existente = userId
      ? await asIdentityCommitting(client, userId, () =>
          client.query<{ player_id: string }>('select * from public.ensure_account_ready()'),
        ).then(async (result) => {
          const playerId = result.rows[0].player_id;
          await client.query(
            `insert into public.player_account_links (player_id, user_id, status, provenance, activated_at)
             select $1, $2, 'ACTIVE', 'SELF_CLAIM', now()
              where not exists (
                select 1
                  from public.player_account_links
                 where user_id = $2 and status = 'ACTIVE'
              )`,
            [playerId, userId],
          );
          return { rows: [{ id: playerId }] };
        })
      : { rows: [] as { id: string }[] };
    const id = existente.rows[0]?.id ?? randomUUID();
    if (!existente.rows[0]) {
      await client.query(
        `insert into public.players (id, owner_id, user_id, name, has_account_identity_history)
         values ($1, $2, $3, $4, $5)`,
        [id, ownerId, userId, name, userId !== null],
      );
    }
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')
       on conflict (community_id, player_id) do nothing`,
      [communityId, id, ownerId],
    );
    return id;
  }

  async function membership(communityId: string, userId: string): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [communityId, userId],
    );
  }

  async function fixture() {
    const ownerId = await newUser('owner');
    const { rows } = await asIdentityCommitting(client, ownerId, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Inscricao ${randomUUID()}`,
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
        [sessionId, communityId, 'Pelada de quinta'],
      ),
    );
    const windowId = randomUUID();
    await asIdentityCommitting(client, ownerId, () =>
      client.query('select * from public.create_registration_window($1,$2,$3,$4,null)', [
        randomUUID(),
        windowId,
        sessionId,
        2,
      ]),
    );
    const revision = (
      await asIdentityCommitting(client, ownerId, () =>
        client.query<{ window_revision: number }>(
          'select * from public.open_registration($1,$2,$3)',
          [randomUUID(), windowId, 1],
        ),
      )
    ).rows[0].window_revision;
    return { ownerId, communityId, sessionId, windowId, revision };
  }

  async function board(actorId: string | null, windowId: string): Promise<Board> {
    const { rows } = await asIdentityCommitting(client, actorId, () =>
      client.query<{ board: Board }>('select public.read_registration_board($1) as board', [
        windowId,
      ]),
    );
    return rows[0].board;
  }

  test('o quadro traz janela, confirmados, reserva em ordem e o que o leitor pode fazer', async () => {
    const f = await fixture();
    const primeiro = await newUser('atleta1');
    const segundo = await newUser('atleta2');
    const terceiro = await newUser('atleta3');
    for (const userId of [primeiro, segundo, terceiro]) {
      await membership(f.communityId, userId);
      await newPlayer(f.ownerId, f.communityId, `Atleta ${userId.slice(0, 4)}`, userId);
    }

    for (const userId of [primeiro, segundo, terceiro]) {
      await asIdentityCommitting(client, userId, () =>
        client.query('select * from public.join_registration($1,$2,$3)', [
          randomUUID(),
          randomUUID(),
          f.windowId,
        ]),
      );
    }

    const doOrganizador = await board(f.ownerId, f.windowId);
    assert.equal(doOrganizador.capacity, 2);
    assert.equal(doOrganizador.confirmed_count, 2);
    assert.equal(doOrganizador.waitlisted_count, 1);
    assert.equal(doOrganizador.viewer_can_manage, true);
    assert.equal(doOrganizador.entries.length, 3);
    assert.deepEqual(
      doOrganizador.entries.map((entry) => entry.status),
      ['CONFIRMED', 'CONFIRMED', 'WAITLISTED'],
    );
    assert.equal(doOrganizador.entries[2].queue_position, 1);
    assert.equal(doOrganizador.entries[0].source, 'SELF_JOIN');

    const doTerceiro = await board(terceiro, f.windowId);
    assert.equal(doTerceiro.viewer_can_manage, false);
    assert.equal(doTerceiro.viewer_entry_status, 'WAITLISTED');
    assert.equal(doTerceiro.viewer_queue_position, 1);

    const doPrimeiro = await board(primeiro, f.windowId);
    assert.equal(doPrimeiro.viewer_entry_status, 'CONFIRMED');
    assert.equal(doPrimeiro.viewer_queue_position, null);
  });

  test('quem saiu ou foi tirado não aparece na lista', async () => {
    const f = await fixture();
    const atleta = await newUser('sai');
    await membership(f.communityId, atleta);
    await newPlayer(f.ownerId, f.communityId, 'Quem sai', atleta);
    await asIdentityCommitting(client, atleta, () =>
      client.query('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        f.windowId,
      ]),
    );
    await asIdentityCommitting(client, atleta, () =>
      client.query('select * from public.leave_registration($1,$2)', [randomUUID(), f.windowId]),
    );

    const quadro = await board(f.ownerId, f.windowId);
    assert.deepEqual(quadro.entries, []);
    assert.equal(quadro.confirmed_count, 0);

    const doAtleta = await board(atleta, f.windowId);
    assert.equal(doAtleta.viewer_entry_status, null);
  });

  test('membro lê; estranho e anônimo recebem 42501', async () => {
    const f = await fixture();
    const estranho = await newUser('estranho');
    for (const actor of [estranho, null]) {
      const erro = await asIdentity(client, actor, () =>
        client.query('select public.read_registration_board($1)', [f.windowId]),
      ).catch((thrown: Error) => thrown);
      assert.equal((erro as { code?: string }).code, '42501', `ator ${actor ?? 'anonimo'}`);
    }
  });

  test('a leitura por sessão devolve o mesmo quadro, e nada antes da janela existir', async () => {
    const f = await fixture();
    const { rows } = await asIdentityCommitting(client, f.ownerId, () =>
      client.query<{ board: Board | null }>(
        'select public.read_session_registration($1) as board',
        [f.sessionId],
      ),
    );
    assert.equal(rows[0].board?.window_id, f.windowId);

    const outraSessao = randomUUID();
    await asIdentityCommitting(client, f.ownerId, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [outraSessao, f.communityId, 'Sem inscricao'],
      ),
    );
    const vazio = await asIdentityCommitting(client, f.ownerId, () =>
      client.query<{ board: Board | null }>(
        'select public.read_session_registration($1) as board',
        [outraSessao],
      ),
    );
    assert.equal(vazio.rows[0].board, null);
  });

  test('janela inexistente é P0002', async () => {
    const f = await fixture();
    const erro = await asIdentity(client, f.ownerId, () =>
      client.query('select public.read_registration_board($1)', [randomUUID()]),
    ).catch((thrown: Error) => thrown);
    assert.equal((erro as { code?: string }).code, 'P0002');
  });
}
