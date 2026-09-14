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

interface TargetSessionRow {
  id: string;
  current_roster_revision_id: string | null;
}

const MIGRATION = '20260909090000_target_session_current_roster_revision.sql';

interface RosterEntry {
  playerId?: string;
  displayName: string;
}

if (!isTestDatabaseConfigured()) {
  test(`target Session current roster revision requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function newCommunity(ownerId: string, name: string): Promise<string> {
    const { rows } = await asIdentityCommitting(client, ownerId, () =>
      client.query<{ id: string }>('select public.create_community_with_owner($1) as id', [name]),
    );
    return rows[0].id;
  }

  async function grantResponsibility(
    communityId: string,
    userId: string,
    responsibility: string,
  ): Promise<void> {
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, $3)
       on conflict (community_id, user_id, responsibility) do update set revoked_at = null`,
      [communityId, userId, responsibility],
    );
  }

  async function activateEvaluationModel(ownerId: string, communityId: string): Promise<void> {
    await asIdentityCommitting(client, ownerId, () =>
      client.query('select public.activate_community_evaluation_model($1)', [communityId]),
    );
  }

  async function newPlayer(
    ownerId: string,
    communityId: string,
    input: { name?: string } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.players (
         id, owner_id, name, has_account_identity_history
       ) values ($1, $2, $3, false)`,
      [id, ownerId, input.name ?? 'Atleta'],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, id, ownerId],
    );
    return id;
  }

  async function newSession(organizerId: string, communityId: string): Promise<string> {
    await grantResponsibility(communityId, organizerId, 'ORGANIZER');
    const sessionId = randomUUID();
    await asIdentityCommitting(client, organizerId, () =>
      client.query(
        `select public.create_target_session($1, $2, 'COMMUNITY', 'FREE_PLAY', $3, null, null)`,
        [sessionId, communityId, 'Sessao de formacao'],
      ),
    );
    return sessionId;
  }

  let rosterSourceRevision = 0;
  // session_participants tem indice unico por (session_id, player_id): uma revisao nova do
  // mesmo elenco reaproveita o participante, nao cria outro.
  const participantsBySession = new Map<string, string>();

  async function newRosterRevision(
    sessionId: string,
    createdBy: string,
    entries: RosterEntry[],
  ): Promise<string> {
    const rosterRevisionId = randomUUID();
    rosterSourceRevision += 1;
    const payload = entries.map((entry, index) => {
      const key = `${sessionId}:${entry.playerId ?? `guest-${index}`}`;
      const participantId = participantsBySession.get(key) ?? randomUUID();
      participantsBySession.set(key, participantId);
      return {
        entry_order: index,
        participant_id: participantId,
        identity_kind: entry.playerId ? 'PLAYER' : 'GUEST',
        player_id: entry.playerId ?? null,
        display_name: entry.displayName,
      };
    });
    await client.query(
      `select app_private.materialize_target_session_roster(
         $1, $2, 'REGISTRATION', null, $3::bigint, null, $4, $5::jsonb
       )`,
      [rosterRevisionId, sessionId, rosterSourceRevision, createdBy, JSON.stringify(payload)],
    );
    return rosterRevisionId;
  }

  async function readSession(actorId: string, sessionId: string): Promise<TargetSessionRow> {
    const { rows } = await asIdentity(client, actorId, () =>
      client.query<TargetSessionRow>('select * from public.read_target_session($1)', [sessionId]),
    );
    return rows[0];
  }

  async function capture(
    actorId: string,
    sessionId: string,
    rosterRevisionId: string,
  ): Promise<{ code?: string } | { roster_revision_id: string }> {
    return asIdentityCommitting(client, actorId, () =>
      client.query<{ snapshot: { roster_revision_id: string } }>(
        'select public.capture_balance_input_snapshot($1, $2, $3) as snapshot',
        [randomUUID(), sessionId, rosterRevisionId],
      ),
    )
      .then(({ rows }) => rows[0].snapshot)
      .catch((thrown: Error) => thrown as { code?: string });
  }

  test('read_target_session devolve a revisao corrente de elenco, e ela e a que capture aceita', async () => {
    const ownerId = await newUser('owner');
    const communityId = await newCommunity(ownerId, `Revisao corrente ${randomUUID()}`);
    await activateEvaluationModel(ownerId, communityId);
    const playerId = await newPlayer(ownerId, communityId, { name: 'Titular' });
    const sessionId = await newSession(ownerId, communityId);

    const noRevision = await readSession(ownerId, sessionId);
    assert.equal(noRevision.current_roster_revision_id, null);

    const firstRevisionId = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);
    const oneRevision = await readSession(ownerId, sessionId);
    assert.equal(oneRevision.current_roster_revision_id, firstRevisionId);

    const secondRevisionId = await newRosterRevision(sessionId, ownerId, [
      { playerId, displayName: 'Titular' },
    ]);
    const twoRevisions = await readSession(ownerId, sessionId);
    assert.equal(twoRevisions.current_roster_revision_id, secondRevisionId);

    // O ponto do teste: a revisao que a leitura devolve precisa ser a mesma que
    // capture_balance_input_snapshot aceita, verificado chamando os dois em vez de
    // assumir que a assercao 3 ja garante isso.
    const acceptedByCapture = await capture(
      ownerId,
      sessionId,
      twoRevisions.current_roster_revision_id as string,
    );
    assert.equal(
      (acceptedByCapture as { roster_revision_id: string }).roster_revision_id,
      secondRevisionId,
    );

    const rejectedByCapture = await capture(ownerId, sessionId, firstRevisionId);
    assert.equal((rejectedByCapture as { code?: string }).code, '40001');
  });
}
