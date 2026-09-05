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

interface EvaluationRow extends QueryResultRow {
  contribution_id: string;
  superseded_contribution_id: string | null;
  dimension_count: number;
}

interface ContributionRow extends QueryResultRow {
  id: string;
  community_id: string;
  player_id: string;
  evaluator_user_id: string;
  rubric_version: string;
  superseded_at: string | null;
  superseded_by_id: string | null;
}

interface ScoreRow extends QueryResultRow {
  dimension_key: string;
  value: string;
}

if (!isTestDatabaseConfigured()) {
  test(`player evaluation contributions require ${TEST_DATABASE_URL_VAR}`, () => {
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
    userId: string | null,
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

  function assertSqlState(error: unknown, expectedCode: string): asserts error is Error {
    assert.ok(error instanceof Error);
    assert.equal((error as { code?: string }).code, expectedCode);
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

  async function targetCommunity(ownerId: string, name: string): Promise<string> {
    const { rows } = await call<{ id: string }>(
      ownerId,
      'select public.create_community_with_owner($1) as id',
      [name],
    );
    return rows[0].id;
  }

  async function activeMembership(
    communityId: string,
    userId: string,
    role = 'member',
  ): Promise<void> {
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, $3, 'active')
       on conflict (community_id, user_id) do update set role = excluded.role, status = 'active'`,
      [communityId, userId, role],
    );
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

  async function createPlayer(
    ownerId: string,
    input: { name?: string; active?: boolean; deletedAt?: string | null } = {},
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into public.players (
         id, owner_id, name, nickname, active, deleted_at, has_account_identity_history
       ) values ($1, $2, $3, null, $4, $5::timestamptz, false)`,
      [id, ownerId, input.name ?? 'Jogadora', input.active ?? true, input.deletedAt ?? null],
    );
    return id;
  }

  async function addCommunityPlayer(
    communityId: string,
    playerId: string,
    ownerId: string,
  ): Promise<void> {
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, playerId, ownerId],
    );
  }

  async function hasCapability(
    actorId: string,
    communityId: string,
    capability: string,
  ): Promise<boolean> {
    const { rows } = await call<{ granted: boolean }>(
      actorId,
      'select public.current_user_has_community_capability($1, $2) as granted',
      [communityId, capability],
    );
    return rows[0].granted;
  }

  test('an EVALUATOR responsibility grants player.evaluate and a governance rank does not', async () => {
    const ownerId = await newUser('w501-cap-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Capability');

    const adminId = await newUser('w501-cap-admin@example.com');
    await activeMembership(communityId, adminId, 'admin');

    const evaluatorId = await newUser('w501-cap-evaluator@example.com');
    await activeMembership(communityId, evaluatorId);
    await grantResponsibility(communityId, evaluatorId, 'EVALUATOR');

    assert.equal(
      await hasCapability(evaluatorId, communityId, 'player.evaluate'),
      true,
      'an explicit EVALUATOR responsibility grants it',
    );
    assert.equal(
      await hasCapability(adminId, communityId, 'player.evaluate'),
      false,
      'GINV-CAP-002: an admin rank never confers it',
    );
    assert.equal(
      await hasCapability(ownerId, communityId, 'player.evaluate'),
      false,
      'GINV-CAP-002: an owner rank never confers it',
    );

    await client.query(
      'update public.community_responsibilities set revoked_at = now() where user_id = $1',
      [evaluatorId],
    );
    assert.equal(
      await hasCapability(evaluatorId, communityId, 'player.evaluate'),
      false,
      'a revoked responsibility grants nothing',
    );
  });

  test('adding player.evaluate leaves every other capability derivation alone', async () => {
    const ownerId = await newUser('w501-cap-intact-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Capability Intact');
    const organizerId = await newUser('w501-cap-intact-organizer@example.com');
    await activeMembership(communityId, organizerId);
    await grantResponsibility(communityId, organizerId, 'ORGANIZER');

    assert.equal(await hasCapability(organizerId, communityId, 'session.manage'), true);
    assert.equal(await hasCapability(organizerId, communityId, 'player.evaluate'), false);
    assert.equal(await hasCapability(ownerId, communityId, 'community.members.manage'), true);
    assert.equal(await hasCapability(ownerId, communityId, 'session.manage'), false);
  });

  test('only one effective contribution exists per Community, Player and evaluator', async () => {
    const ownerId = await newUser('w501-index-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Index');
    const evaluatorId = await newUser('w501-index-evaluator@example.com');
    const playerId = await createPlayer(ownerId, { name: 'Alvo' });

    const first = randomUUID();
    await client.query(
      `insert into public.player_evaluation_contributions (
         id, community_id, player_id, evaluator_user_id, rubric_version, command_id
       ) values ($1, $2, $3, $4, 'v0', $5)`,
      [first, communityId, playerId, evaluatorId, randomUUID()],
    );

    const second = await client
      .query(
        `insert into public.player_evaluation_contributions (
           id, community_id, player_id, evaluator_user_id, rubric_version, command_id
         ) values ($1, $2, $3, $4, 'v0', $5)`,
        [randomUUID(), communityId, playerId, evaluatorId, randomUUID()],
      )
      .catch((error: Error) => error);
    assertSqlState(second, '23505');

    await client.query(
      `update public.player_evaluation_contributions
          set superseded_at = now(), superseded_by_id = $2
        where id = $1`,
      [first, first],
    );
    await client.query(
      `insert into public.player_evaluation_contributions (
         id, community_id, player_id, evaluator_user_id, rubric_version, command_id
       ) values ($1, $2, $3, $4, 'v0', $5)`,
      [randomUUID(), communityId, playerId, evaluatorId, randomUUID()],
    );
  });

  test('a dimension score is bounded and a contribution keys it once', async () => {
    const ownerId = await newUser('w501-score-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Scores');
    const evaluatorId = await newUser('w501-score-evaluator@example.com');
    const playerId = await createPlayer(ownerId, { name: 'Alvo' });
    const contributionId = randomUUID();
    await client.query(
      `insert into public.player_evaluation_contributions (
         id, community_id, player_id, evaluator_user_id, rubric_version, command_id
       ) values ($1, $2, $3, $4, 'v0', $5)`,
      [contributionId, communityId, playerId, evaluatorId, randomUUID()],
    );

    await client.query(
      `insert into public.player_evaluation_dimension_scores (contribution_id, dimension_key, value)
       values ($1, 'saque', 7)`,
      [contributionId],
    );

    const duplicate = await client
      .query(
        `insert into public.player_evaluation_dimension_scores (contribution_id, dimension_key, value)
         values ($1, 'saque', 8)`,
        [contributionId],
      )
      .catch((error: Error) => error);
    assertSqlState(duplicate, '23505');

    const tooHigh = await client
      .query(
        `insert into public.player_evaluation_dimension_scores (contribution_id, dimension_key, value)
         values ($1, 'ataque', 11)`,
        [contributionId],
      )
      .catch((error: Error) => error);
    assertSqlState(tooHigh, '23514');
  });

  test('neither evaluation table is reachable by a browser role', async () => {
    const actorId = await newUser('w501-grants-actor@example.com');

    for (const table of [
      'public.player_evaluation_contributions',
      'public.player_evaluation_dimension_scores',
    ]) {
      const attempt = await call(actorId, `select count(*) from ${table}`).catch(
        (error: Error) => error,
      );
      assertSqlState(attempt, '42501');
    }

    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in (
            'player_evaluation_contributions', 'player_evaluation_dimension_scores'
          )
          and grantee in ('anon', 'authenticated', 'public')`,
    );
    assert.deepEqual(rows, [{ count: '0' }]);
  });
}
