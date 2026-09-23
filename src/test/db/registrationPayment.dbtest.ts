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

const MIGRATION = '20260923120000_registration_payment.sql';

if (!isTestDatabaseConfigured()) {
  test(`registration payment requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function newAthlete(
    ownerId: string,
    communityId: string,
    userId: string,
    name: string,
  ): Promise<string> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')
       on conflict (community_id, user_id) do update set status = 'active'`,
      [communityId, userId],
    );
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
    await client.query('update public.players set name = $2 where id = $1', [playerId, name]);
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')
       on conflict (community_id, player_id) do nothing`,
      [communityId, playerId, ownerId],
    );
    return playerId;
  }

  async function fixture(capacity: number) {
    const ownerId = await newUser('owner');
    const { rows } = await asIdentityCommitting(client, ownerId, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [
        `Pagamento ${randomUUID()}`,
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
        capacity,
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

  async function inscrever(
    f: { ownerId: string; communityId: string; windowId: string },
    label: string,
  ): Promise<{ userId: string; playerId: string }> {
    const userId = await newUser(label);
    const playerId = await newAthlete(f.ownerId, f.communityId, userId, `Atleta ${label}`);
    await asIdentityCommitting(client, userId, () =>
      client.query('select * from public.join_registration($1,$2,$3)', [
        randomUUID(),
        randomUUID(),
        f.windowId,
      ]),
    );
    return { userId, playerId };
  }

  async function marcarPagoDireto(windowId: string, playerId: string): Promise<void> {
    await client.query(
      `update public.registration_entries
          set paid_at = now(), payment_lapsed_at = null
        where registration_window_id = $1 and player_id = $2`,
      [windowId, playerId],
    );
  }

  async function reserva(windowId: string): Promise<string[]> {
    const { rows } = await client.query<{ player_id: string }>(
      `select player_id from app_private.registration_reserve_order($1) order by posicao`,
      [windowId],
    );
    return rows.map((row) => row.player_id);
  }

  async function statusDe(windowId: string, playerId: string): Promise<string> {
    const { rows } = await client.query<{ status: string }>(
      `select status from public.registration_entries
        where registration_window_id = $1 and player_id = $2`,
      [windowId, playerId],
    );
    return rows[0].status;
  }

  test('quem pagou vem antes na reserva, e o organizador pode fixar alguém no topo', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');
    const d = await inscrever(f, 'd');

    assert.equal(await statusDe(f.windowId, a.playerId), 'CONFIRMED');
    assert.deepEqual(await reserva(f.windowId), [b.playerId, c.playerId, d.playerId]);

    await marcarPagoDireto(f.windowId, d.playerId);
    await marcarPagoDireto(f.windowId, c.playerId);
    assert.deepEqual(
      await reserva(f.windowId),
      [d.playerId, c.playerId, b.playerId],
      'pagos primeiro, na ordem em que pagaram',
    );

    await client.query(
      `update public.registration_entries set reserve_rank = 0
        where registration_window_id = $1 and player_id = $2`,
      [f.windowId, b.playerId],
    );
    assert.deepEqual(
      await reserva(f.windowId),
      [b.playerId, d.playerId, c.playerId],
      'quem o organizador fixa vem antes de todo mundo',
    );
  });

  test('quem perdeu o prazo fica no fim da reserva', async () => {
    const f = await fixture(1);
    await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');

    await client.query(
      `update public.registration_entries set payment_lapsed_at = now()
        where registration_window_id = $1 and player_id = $2`,
      [f.windowId, b.playerId],
    );
    assert.deepEqual(await reserva(f.windowId), [c.playerId, b.playerId]);
  });

  test('passado o prazo, a promoção só sobe quem pagou', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');
    const c = await inscrever(f, 'c');

    await client.query(
      `update public.registration_windows set payment_due_at = now() - interval '1 hour'
        where id = $1`,
      [f.windowId],
    );
    await marcarPagoDireto(f.windowId, c.playerId);

    await asIdentityCommitting(client, a.userId, () =>
      client.query('select * from public.leave_registration($1,$2)', [randomUUID(), f.windowId]),
    );

    assert.equal(await statusDe(f.windowId, c.playerId), 'CONFIRMED', 'o pago sobe');
    assert.equal(await statusDe(f.windowId, b.playerId), 'WAITLISTED', 'o não pago não sobe');
  });

  test('antes do prazo, a promoção segue a ordem da reserva sem exigir pagamento', async () => {
    const f = await fixture(1);
    const a = await inscrever(f, 'a');
    const b = await inscrever(f, 'b');

    await asIdentityCommitting(client, a.userId, () =>
      client.query('select * from public.leave_registration($1,$2)', [randomUUID(), f.windowId]),
    );

    assert.equal(await statusDe(f.windowId, b.playerId), 'CONFIRMED');
  });
}
