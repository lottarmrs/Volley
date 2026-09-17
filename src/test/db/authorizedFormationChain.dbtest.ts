import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import type { Client, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
} from './harness';

if (!isTestDatabaseConfigured()) {
  test('authorized formation chain requires VOLLEY_TEST_DATABASE_URL', () =>
    assert.fail('database is not configured'));
} else {
  let client: Client;
  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
  });
  test.after(async () => client.end());

  async function user(name: string) {
    const email = `${name}-${randomUUID()}@test.local`.toLowerCase();
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email) values ($1) returning id',
      [email],
    );
    await client.query(
      'insert into public.profiles (id,email,name) values ($1,$2,$3) on conflict (id) do nothing',
      [rows[0].id, email, name],
    );
    return rows[0].id;
  }

  async function rpc<T extends QueryResultRow = QueryResultRow>(
    actor: string,
    sql: string,
    args: unknown[] = [],
  ) {
    return asIdentityCommitting(client, actor, () => client.query<T>(sql, args));
  }

  async function player(communityId: string, ownerId: string, name: string) {
    const id = randomUUID();
    await client.query(
      'insert into public.players (id, owner_id, name, active, has_account_identity_history) values ($1,$2,$3,true,false)',
      [id, ownerId, name],
    );
    await client.query(
      "insert into public.community_players (community_id, player_id, owner_id, active, status) values ($1,$2,$3,true,'active')",
      [communityId, id, ownerId],
    );
    return id;
  }

  const lifecycle = async (actor: string, name: string, windowId: string, revision: number) =>
    (
      await rpc<{ window_revision: number }>(actor, `select * from public.${name}($1,$2,$3)`, [
        randomUUID(),
        windowId,
        revision,
      ])
    ).rows[0].window_revision;

  test('the wizard chain runs end to end for a legacy owner, then a reopen round', async () => {
    const owner = await user('ChainOwner');
    const { rows: community } = await client.query<{ id: string }>(
      'insert into public.communities (name, owner_id) values ($1, $2) returning id',
      [`Chain ${randomUUID()}`, owner],
    );
    const communityId = community[0].id;
    const players = [
      await player(communityId, owner, 'Ana'),
      await player(communityId, owner, 'Bia'),
      await player(communityId, owner, 'Caio'),
    ];

    const sessionId = randomUUID();
    await rpc(
      owner,
      "select public.create_target_session($1,$2,'COMMUNITY','FREE_PLAY',$3,null,null)",
      [sessionId, communityId, 'Pelada autorizada'],
    );

    const windowId = randomUUID();
    const created = await rpc<{ window_revision: number }>(
      owner,
      'select * from public.create_registration_window($1,$2,$3,$4,null)',
      [randomUUID(), windowId, sessionId, players.length],
    );
    let revision = await lifecycle(
      owner,
      'open_registration',
      windowId,
      created.rows[0].window_revision,
    );
    for (const playerId of players) {
      revision = (
        await rpc<{ window_revision: number }>(
          owner,
          'select * from public.add_registration_entry($1,$2,$3,$4)',
          [randomUUID(), randomUUID(), windowId, playerId],
        )
      ).rows[0].window_revision;
    }
    revision = await lifecycle(owner, 'close_registration', windowId, revision);
    revision = await lifecycle(owner, 'lock_registration', windowId, revision);
    const finalized = await rpc<{ roster_revision_id: string }>(
      owner,
      'select * from public.finalize_session_roster($1,$2,$3)',
      [randomUUID(), windowId, revision],
    );
    const firstRoster = finalized.rows[0].roster_revision_id;

    const window = await rpc<{ status: string; confirmed_player_ids: string[] }>(
      owner,
      'select * from public.read_registration_window($1)',
      [windowId],
    );
    assert.equal(window.rows[0].status, 'LOCKED');
    assert.deepEqual(window.rows[0].confirmed_player_ids, players);

    const roster = await rpc<{ entries: { participant_id: string; player_id: string }[] }>(
      owner,
      'select * from public.read_target_roster_revision($1)',
      [firstRoster],
    );
    assert.deepEqual(
      roster.rows[0].entries.map((entry) => entry.player_id),
      players,
    );

    const captured = await rpc<{
      snapshot: { participants: { participant_id: string; is_estimated: boolean }[] };
    }>(owner, 'select public.capture_balance_input_snapshot($1,$2,$3) as snapshot', [
      randomUUID(),
      sessionId,
      firstRoster,
    ]);
    const snapshotParticipants = captured.rows[0].snapshot.participants;
    assert.deepEqual(
      snapshotParticipants.map((p) => p.participant_id).sort(),
      roster.rows[0].entries.map((entry) => entry.participant_id).sort(),
    );
    assert.equal(
      snapshotParticipants.every((p) => p.is_estimated),
      true,
    );

    const latecomer = await player(communityId, owner, 'Duda');
    await lifecycle(owner, 'reopen_registration', windowId, revision);
    await rpc(owner, 'select * from public.remove_registration_entry($1,$2,$3,$4)', [
      randomUUID(),
      windowId,
      players[2],
      'ORGANIZER_DESELECTED',
    ]);
    revision = (
      await rpc<{ window_revision: number }>(
        owner,
        'select * from public.add_registration_entry($1,$2,$3,$4)',
        [randomUUID(), randomUUID(), windowId, latecomer],
      )
    ).rows[0].window_revision;
    revision = await lifecycle(owner, 'close_registration', windowId, revision);
    revision = await lifecycle(owner, 'lock_registration', windowId, revision);
    const second = await rpc<{ roster_revision_id: string }>(
      owner,
      'select * from public.finalize_session_roster($1,$2,$3)',
      [randomUUID(), windowId, revision],
    );
    const secondRoster = second.rows[0].roster_revision_id;

    const read = await rpc<{ current_roster_revision_id: string }>(
      owner,
      'select * from public.read_target_session($1)',
      [sessionId],
    );
    assert.equal(read.rows[0].current_roster_revision_id, secondRoster);

    const recaptured = await rpc<{ snapshot: { participants: unknown[] } }>(
      owner,
      'select public.capture_balance_input_snapshot($1,$2,$3) as snapshot',
      [randomUUID(), sessionId, secondRoster],
    );
    assert.equal(recaptured.rows[0].snapshot.participants.length, 3);
  });
}
