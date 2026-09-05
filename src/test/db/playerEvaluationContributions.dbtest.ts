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

  function assertBlockedBy(
    error: unknown,
    expectedCode: string,
    blocker: string,
  ): asserts error is Error {
    assertSqlState(error, expectedCode);
    assert.ok(
      error.message.includes(blocker),
      `expected error message to include "${blocker}", got: ${error.message}`,
    );
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

  async function recordEvaluation(
    actorId: string | null,
    input: {
      commandId?: string;
      contributionId?: string;
      communityId: string;
      playerId: string;
      rubricVersion?: string;
      dimensions: Record<string, number | string | null>;
    },
  ) {
    return call<EvaluationRow>(
      actorId,
      `select * from public.record_player_evaluation($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        input.commandId ?? randomUUID(),
        input.contributionId ?? randomUUID(),
        input.communityId,
        input.playerId,
        input.rubricVersion ?? 'v0-legacy-11',
        JSON.stringify(input.dimensions),
      ],
    );
  }

  async function contributionsOf(communityId: string, playerId: string) {
    const { rows } = await client.query<ContributionRow>(
      `select id, community_id, player_id, evaluator_user_id, rubric_version,
              superseded_at::text as superseded_at, superseded_by_id
         from public.player_evaluation_contributions
        where community_id = $1 and player_id = $2
        order by recorded_at, id`,
      [communityId, playerId],
    );
    return rows;
  }

  async function scoresOf(contributionId: string) {
    const { rows } = await client.query<ScoreRow>(
      `select dimension_key, value::text as value
         from public.player_evaluation_dimension_scores
        where contribution_id = $1
        order by dimension_key`,
      [contributionId],
    );
    return rows;
  }

  async function evaluatorIn(communityId: string, email: string): Promise<string> {
    const userId = await newUser(email);
    await activeMembership(communityId, userId);
    await grantResponsibility(communityId, userId, 'EVALUATOR');
    return userId;
  }

  async function evaluablePlayer(
    communityId: string,
    ownerId: string,
    name: string,
  ): Promise<string> {
    const playerId = await createPlayer(ownerId, { name });
    await addCommunityPlayer(communityId, playerId, ownerId);
    return playerId;
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

  test('an EVALUATOR responsibility without an active membership does not grant player.evaluate', async () => {
    const ownerId = await newUser('w501-cap-suspended-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Capability Suspended');

    const evaluatorId = await newUser('w501-cap-suspended-evaluator@example.com');
    await activeMembership(communityId, evaluatorId);
    await grantResponsibility(communityId, evaluatorId, 'EVALUATOR');
    assert.equal(
      await hasCapability(evaluatorId, communityId, 'player.evaluate'),
      true,
      'sanity: an active member with the responsibility holds it',
    );

    await client.query(
      `update public.community_memberships set status = 'suspended'
        where community_id = $1 and user_id = $2`,
      [communityId, evaluatorId],
    );

    assert.equal(
      await hasCapability(evaluatorId, communityId, 'player.evaluate'),
      false,
      'an unrevoked EVALUATOR responsibility on a non-active membership grants nothing',
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

  test('evaluator_user_id anonymises on account deletion instead of blocking it', async () => {
    const { rows: columnRows } = await client.query<{ is_nullable: string }>(
      `select is_nullable
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'player_evaluation_contributions'
          and column_name = 'evaluator_user_id'`,
    );
    assert.equal(
      columnRows[0]?.is_nullable,
      'YES',
      'evaluator_user_id must be nullable so it can be anonymised, per the account-deletion ' +
        'policy in 20260827200000_auth_cascade_safety.sql',
    );

    const { rows: actionRows } = await client.query<{ action: string }>(
      `select case con.confdeltype
                when 'a' then 'NO ACTION' when 'r' then 'RESTRICT' when 'c' then 'CASCADE'
                when 'n' then 'SET NULL' when 'd' then 'SET DEFAULT' end as action
         from pg_constraint con
         join unnest(con.conkey) k on true
         join pg_attribute att on att.attrelid = con.conrelid and att.attnum = k
        where con.contype = 'f'
          and con.conrelid = 'public.player_evaluation_contributions'::regclass
          and con.confrelid = 'auth.users'::regclass
          and att.attname = 'evaluator_user_id'
        limit 1`,
    );
    assert.equal(
      actionRows[0]?.action,
      'SET NULL',
      'the evaluator_user_id foreign key must anonymise, not block, account deletion',
    );
  });

  test('recording an evaluation stores the contribution and its dimension rows', async () => {
    const ownerId = await newUser('w501-happy-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Happy');
    const evaluatorId = await evaluatorIn(communityId, 'w501-happy-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const contributionId = randomUUID();
    const result = await recordEvaluation(evaluatorId, {
      contributionId,
      communityId,
      playerId,
      dimensions: { saque: 7, ataque: 8.5 },
    });

    assert.deepEqual(result.rows, [
      { contribution_id: contributionId, superseded_contribution_id: null, dimension_count: 2 },
    ]);

    const contributions = await contributionsOf(communityId, playerId);
    assert.equal(contributions.length, 1);
    assert.equal(contributions[0].evaluator_user_id, evaluatorId);
    assert.equal(contributions[0].rubric_version, 'v0-legacy-11');
    assert.equal(contributions[0].superseded_at, null);
    assert.equal(contributions[0].superseded_by_id, null);

    assert.deepEqual(await scoresOf(contributionId), [
      { dimension_key: 'ataque', value: '8.5' },
      { dimension_key: 'saque', value: '7' },
    ]);
  });

  test('re-evaluating supersedes the previous contribution and keeps it readable', async () => {
    const ownerId = await newUser('w501-supersede-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Supersede');
    const evaluatorId = await evaluatorIn(communityId, 'w501-supersede-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const firstId = randomUUID();
    await recordEvaluation(evaluatorId, {
      contributionId: firstId,
      communityId,
      playerId,
      dimensions: { saque: 5 },
    });

    const secondId = randomUUID();
    const second = await recordEvaluation(evaluatorId, {
      contributionId: secondId,
      communityId,
      playerId,
      dimensions: { saque: 9, defesa: 6 },
    });

    assert.deepEqual(second.rows, [
      {
        contribution_id: secondId,
        superseded_contribution_id: firstId,
        dimension_count: 2,
      },
    ]);

    const contributions = await contributionsOf(communityId, playerId);
    assert.equal(contributions.length, 2, 'the superseded contribution is kept');
    const superseded = contributions.find((row) => row.id === firstId);
    const effective = contributions.find((row) => row.id === secondId);
    assert.ok(superseded && effective);
    assert.ok(superseded.superseded_at !== null);
    assert.equal(superseded.superseded_by_id, secondId);
    assert.equal(effective.superseded_at, null);

    assert.deepEqual(
      await scoresOf(firstId),
      [{ dimension_key: 'saque', value: '5' }],
      'the superseded scores survive',
    );
  });

  test('the same evaluator holds one effective contribution per Community', async () => {
    const ownerId = await newUser('w501-isolation-owner@example.com');
    const firstCommunity = await targetCommunity(ownerId, 'W501 Isolation A');
    const secondCommunity = await targetCommunity(ownerId, 'W501 Isolation B');
    const evaluatorId = await newUser('w501-isolation-eval@example.com');
    for (const communityId of [firstCommunity, secondCommunity]) {
      await activeMembership(communityId, evaluatorId);
      await grantResponsibility(communityId, evaluatorId, 'EVALUATOR');
    }
    const playerId = await createPlayer(ownerId, { name: 'Alvo' });
    await addCommunityPlayer(firstCommunity, playerId, ownerId);
    await addCommunityPlayer(secondCommunity, playerId, ownerId);

    await recordEvaluation(evaluatorId, {
      communityId: firstCommunity,
      playerId,
      dimensions: { saque: 4 },
    });
    await recordEvaluation(evaluatorId, {
      communityId: secondCommunity,
      playerId,
      dimensions: { saque: 9 },
    });

    assert.equal((await contributionsOf(firstCommunity, playerId)).length, 1);
    assert.equal((await contributionsOf(secondCommunity, playerId)).length, 1);
  });

  test('evaluating requires the capability, and rank alone never grants it', async () => {
    const ownerId = await newUser('w501-auth-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Auth');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const adminId = await newUser('w501-auth-admin@example.com');
    await activeMembership(communityId, adminId, 'admin');

    for (const actorId of [ownerId, adminId]) {
      const attempt = await recordEvaluation(actorId, {
        communityId,
        playerId,
        dimensions: { saque: 5 },
      }).catch((error: Error) => error);
      assertSqlState(attempt, '42501');
    }

    const anonymous = await recordEvaluation(null, {
      communityId,
      playerId,
      dimensions: { saque: 5 },
    }).catch((error: Error) => error);
    assertSqlState(anonymous, '42501');

    assert.equal((await contributionsOf(communityId, playerId)).length, 0);
  });

  test('a capability granted in another Community authorizes nothing here', async () => {
    const ownerId = await newUser('w501-cross-owner@example.com');
    const homeCommunity = await targetCommunity(ownerId, 'W501 Cross Home');
    const otherCommunity = await targetCommunity(ownerId, 'W501 Cross Other');
    const evaluatorId = await evaluatorIn(otherCommunity, 'w501-cross-eval@example.com');
    await activeMembership(homeCommunity, evaluatorId);
    const playerId = await evaluablePlayer(homeCommunity, ownerId, 'Alvo');

    const attempt = await recordEvaluation(evaluatorId, {
      communityId: homeCommunity,
      playerId,
      dimensions: { saque: 5 },
    }).catch((error: Error) => error);
    assertSqlState(attempt, '42501');
  });

  test('the evaluator is the caller, and the command exposes no way to name another', async () => {
    const { rows } = await client.query<{ args: string }>(
      `select pg_catalog.pg_get_function_arguments(p.oid) as args
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'record_player_evaluation'`,
    );
    assert.equal(rows.length, 1);
    const normalizedArgs = rows[0].args.replace(/\s+/g, ' ').trim();
    assert.equal(
      normalizedArgs,
      'p_command_id uuid, p_contribution_id uuid, p_community_id uuid, p_player_id uuid, p_rubric_version text, p_dimensions jsonb',
    );
  });

  test('an evaluator-shaped key inside dimensions never overrides the caller as evaluator', async () => {
    const ownerId = await newUser('w501-smuggle-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Smuggle');
    const evaluatorId = await evaluatorIn(communityId, 'w501-smuggle-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const contributionId = randomUUID();
    await recordEvaluation(evaluatorId, {
      contributionId,
      communityId,
      playerId,
      dimensions: { saque: 7, evaluator_user_id: 3 },
    });

    const contributions = await contributionsOf(communityId, playerId);
    assert.equal(contributions.length, 1);
    assert.equal(contributions[0].evaluator_user_id, evaluatorId);
  });

  test('a Player with no living standing in the Community is refused', async () => {
    const ownerId = await newUser('w501-standing-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Standing');
    const evaluatorId = await evaluatorIn(communityId, 'w501-standing-eval@example.com');

    const strangerId = await createPlayer(ownerId, { name: 'De fora' });
    const stranger = await recordEvaluation(evaluatorId, {
      communityId,
      playerId: strangerId,
      dimensions: { saque: 5 },
    }).catch((error: Error) => error);
    assertBlockedBy(stranger, '23514', 'Player has no living roster standing in this Community');

    const deletedId = await evaluablePlayer(communityId, ownerId, 'Apagada');
    await client.query('update public.players set deleted_at = now() where id = $1', [deletedId]);
    const deleted = await recordEvaluation(evaluatorId, {
      communityId,
      playerId: deletedId,
      dimensions: { saque: 5 },
    }).catch((error: Error) => error);
    assertBlockedBy(deleted, '23514', 'Player has no living roster standing in this Community');

    const missing = await recordEvaluation(evaluatorId, {
      communityId,
      playerId: randomUUID(),
      dimensions: { saque: 5 },
    }).catch((error: Error) => error);
    assertSqlState(missing, 'P0002');

    const knownPlayerId = await evaluablePlayer(communityId, ownerId, 'Conhecida');
    const missingCommunity = await recordEvaluation(evaluatorId, {
      communityId: randomUUID(),
      playerId: knownPlayerId,
      dimensions: { saque: 5 },
    }).catch((error: Error) => error);
    assertSqlState(missingCommunity, 'P0002');
  });

  test('a dimension omitted is absent, never a zero', async () => {
    const ownerId = await newUser('w501-missing-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Missing');
    const evaluatorId = await evaluatorIn(communityId, 'w501-missing-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const contributionId = randomUUID();
    await recordEvaluation(evaluatorId, {
      contributionId,
      communityId,
      playerId,
      dimensions: { saque: 6 },
    });

    assert.deepEqual(await scoresOf(contributionId), [{ dimension_key: 'saque', value: '6' }]);
  });

  test('malformed input is refused and writes nothing', async () => {
    const ownerId = await newUser('w501-validation-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Validation');
    const evaluatorId = await evaluatorIn(communityId, 'w501-validation-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const cases: Array<{
      label: string;
      rubricVersion?: string;
      dimensions: object;
      blocker: string;
    }> = [
      {
        label: 'blank rubric version',
        rubricVersion: '   ',
        dimensions: { saque: 5 },
        blocker: 'Rubric version is required',
      },
      {
        label: 'no dimensions',
        dimensions: {},
        blocker: 'At least one dimension score is required',
      },
      {
        label: 'non numeric score',
        dimensions: { saque: 'muito bom' },
        blocker: 'Dimension keys must be non-blank and scores must be numbers',
      },
      {
        label: 'score above the scale',
        dimensions: { saque: 11 },
        blocker: 'Dimension scores must be between 0 and 10',
      },
      {
        label: 'score below the scale',
        dimensions: { saque: -1 },
        blocker: 'Dimension scores must be between 0 and 10',
      },
      {
        label: 'blank dimension key',
        dimensions: { '   ': 5 },
        blocker: 'Dimension keys must be non-blank and scores must be numbers',
      },
    ];

    for (const testCase of cases) {
      const attempt = await recordEvaluation(evaluatorId, {
        communityId,
        playerId,
        rubricVersion: testCase.rubricVersion,
        dimensions: testCase.dimensions as Record<string, number>,
      }).catch((error: Error) => error);
      assertBlockedBy(attempt, '23514', testCase.blocker);
    }

    assert.equal((await contributionsOf(communityId, playerId)).length, 0);
  });

  test('the same command id replays instead of writing a second contribution', async () => {
    const ownerId = await newUser('w501-replay-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Replay');
    const evaluatorId = await evaluatorIn(communityId, 'w501-replay-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const commandId = randomUUID();
    const contributionId = randomUUID();
    const first = await recordEvaluation(evaluatorId, {
      commandId,
      contributionId,
      communityId,
      playerId,
      dimensions: { saque: 5 },
    });
    const second = await recordEvaluation(evaluatorId, {
      commandId,
      contributionId,
      communityId,
      playerId,
      dimensions: { saque: 5 },
    });

    assert.deepEqual(second.rows, first.rows);
    assert.equal((await contributionsOf(communityId, playerId)).length, 1);
  });

  test('a command id already spent on another contribution is refused', async () => {
    const ownerId = await newUser('w501-collision-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Collision');
    const evaluatorId = await evaluatorIn(communityId, 'w501-collision-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const commandId = randomUUID();
    await recordEvaluation(evaluatorId, {
      commandId,
      communityId,
      playerId,
      dimensions: { saque: 5 },
    });

    const reused = await recordEvaluation(evaluatorId, {
      commandId,
      contributionId: randomUUID(),
      communityId,
      playerId,
      dimensions: { saque: 6 },
    }).catch((error: Error) => error);
    assertSqlState(reused, '23505');

    assert.equal((await contributionsOf(communityId, playerId)).length, 1);
  });

  test('two concurrent submissions by one evaluator chain instead of colliding', async () => {
    const ownerId = await newUser('w501-race-owner@example.com');
    const communityId = await targetCommunity(ownerId, 'W501 Race');
    const evaluatorId = await evaluatorIn(communityId, 'w501-race-eval@example.com');
    const playerId = await evaluablePlayer(communityId, ownerId, 'Alvo');

    const attempts = await Promise.allSettled([
      recordEvaluation(evaluatorId, { communityId, playerId, dimensions: { saque: 4 } }),
      recordEvaluation(evaluatorId, { communityId, playerId, dimensions: { saque: 9 } }),
    ]);
    assert.deepEqual(
      attempts.map((attempt) => attempt.status),
      ['fulfilled', 'fulfilled'],
      'the Player row lock serializes them; neither may fail',
    );

    const contributions = await contributionsOf(communityId, playerId);
    assert.equal(contributions.length, 2);
    assert.equal(
      contributions.filter((row) => row.superseded_at === null).length,
      1,
      'exactly one effective contribution survives the race',
    );
  });

  test('the legacy evaluation surface is untouched', async () => {
    const { rows: policies } = await client.query<{ count: string }>(
      `select count(*)::text as count from pg_catalog.pg_policies
        where schemaname = 'public' and tablename = 'player_evaluations'`,
    );
    assert.notEqual(policies[0].count, '0', 'the legacy policies still exist');

    const { rows: index } = await client.query<{ indexdef: string }>(
      `select indexdef from pg_catalog.pg_indexes
        where schemaname = 'public' and indexname = 'player_evaluations_owner_player_idx'`,
    );
    assert.equal(index.length, 1);
    assert.match(index[0].indexdef, /\(owner_id, player_id\)/);

    const { rows: self } = await client.query<{ count: string }>(
      `select count(*)::text as count from information_schema.tables
        where table_schema = 'public' and table_name = 'self_evaluations'`,
    );
    assert.deepEqual(self, [{ count: '1' }]);

    const { rows: scoped } = await client.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
        where table_schema = 'public'
          and table_name = 'player_evaluations'
          and column_name = 'community_id'`,
    );
    assert.deepEqual(
      scoped,
      [{ is_nullable: 'NO' }],
      'the proof that LEGACY_UNSCOPED_EVALUATION is empty by construction',
    );
  });
}
