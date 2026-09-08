import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { Client, Pool, PoolClient, QueryResultRow } from 'pg';
import {
  asIdentityCommitting,
  connect,
  createPool,
  inRolledBackTransaction,
  isTestDatabaseConfigured,
  loadMigrations,
  rebuildFromMigrations,
  splitSqlStatements,
  TEST_DATABASE_URL_VAR,
} from './harness';

interface EvaluationContext {
  ownerId: string;
  communityId: string;
  evaluatorId: string;
  playerId: string;
}

interface EvaluationRow extends QueryResultRow {
  contribution_id: string;
  superseded_contribution_id: string | null;
  dimension_count: number;
}

interface RecordedEvaluation {
  commandId: string;
  contributionId: string;
  rows: EvaluationRow[];
}

interface SqlError extends Error {
  code?: string;
  constraint?: string;
}

const MIGRATION_NAME = '20260906130635_skill_rubric_contract.sql';
const MIGRATION_PATH = `supabase/migrations/${MIGRATION_NAME}`;
const SEEDED_DIMENSIONS = [
  'saque',
  'recepcao',
  'levantamento',
  'ataque',
  'bloqueio',
  'defesa',
  'velocidade',
  'resistencia',
  'leituraDeJogo',
  'regularidade',
  'controleEmocional',
] as const;

if (!isTestDatabaseConfigured()) {
  test(`skill rubric contract requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run \`npm run test:db\`.`);
  });
} else {
  let client: Client;
  let pool: Pool;

  test.before(async () => {
    client = await connect();
    pool = createPool();
  });

  test.after(async () => {
    await pool?.end();
    await client?.end();
  });

  function assertSqlError(
    error: unknown,
    expectedCode: string,
    expectedMessage?: string,
  ): asserts error is SqlError {
    assert.ok(error instanceof Error);
    const sqlError = error as SqlError;
    assert.equal(sqlError.code, expectedCode);
    if (expectedMessage) assert.equal(sqlError.message, expectedMessage);
  }

  async function rebuildFull(): Promise<void> {
    const result = await rebuildFromMigrations(client);
    assert.ok(result.failures.length <= 106);
    assert.deepEqual(
      result.failures.filter(({ migration }) => migration === MIGRATION_NAME),
      [],
    );
  }

  async function call<T extends QueryResultRow = QueryResultRow>(
    actorId: string | null,
    sql: string,
    params: unknown[] = [],
  ) {
    const db = await pool.connect();
    try {
      return await asIdentityCommitting(db, actorId, () => db.query<T>(sql, params));
    } finally {
      db.release();
    }
  }

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

  async function evaluationContext(label: string): Promise<EvaluationContext> {
    const ownerId = await newUser(`${label}-owner`);
    const { rows: communities } = await call<{ id: string }>(
      ownerId,
      'select public.create_community_with_owner($1) as id',
      [`Rubric ${label}`],
    );
    const communityId = communities[0].id;
    const evaluatorId = await newUser(`${label}-evaluator`);
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'member', 'active')`,
      [communityId, evaluatorId],
    );
    await client.query(
      `insert into public.community_responsibilities (community_id, user_id, responsibility)
       values ($1, $2, 'EVALUATOR')`,
      [communityId, evaluatorId],
    );
    const playerId = randomUUID();
    await client.query(
      `insert into public.players (
         id, owner_id, name, nickname, active, deleted_at, has_account_identity_history
       ) values ($1, $2, $3, null, true, null, false)`,
      [playerId, ownerId, `Player ${label}`],
    );
    await client.query(
      `insert into public.community_players (community_id, player_id, owner_id, active, status)
       values ($1, $2, $3, true, 'active')`,
      [communityId, playerId, ownerId],
    );
    return { ownerId, communityId, evaluatorId, playerId };
  }

  async function record(
    context: EvaluationContext,
    input: {
      commandId?: string;
      contributionId?: string;
      rubricVersion?: string;
      dimensions?: Record<string, number | string | null>;
    } = {},
  ): Promise<RecordedEvaluation> {
    const commandId = input.commandId ?? randomUUID();
    const contributionId = input.contributionId ?? randomUUID();
    const result = await call<EvaluationRow>(
      context.evaluatorId,
      'select * from public.record_player_evaluation($1, $2, $3, $4, $5, $6::jsonb)',
      [
        commandId,
        contributionId,
        context.communityId,
        context.playerId,
        input.rubricVersion ?? 'v0-legacy-11',
        JSON.stringify(input.dimensions ?? { saque: 6 }),
      ],
    );
    return { commandId, contributionId, rows: result.rows };
  }

  async function insertRubric(
    db: Client | PoolClient,
    version: string,
    dimensions: Array<{ key: string; required: boolean }>,
  ): Promise<void> {
    await db.query(
      `insert into public.skill_rubric_versions (rubric_version, status, provenance)
       values ($1, 'EXPERIMENTAL', 'Test-only transaction fixture')`,
      [version],
    );
    for (const [index, dimension] of dimensions.entries()) {
      await db.query(
        `insert into public.skill_rubric_dimensions (
           rubric_version, dimension_key, kind, is_required, display_order
         ) values ($1, $2, 'SOURCE', $3, $4)`,
        [version, dimension.key, dimension.required, index + 1],
      );
    }
  }

  async function recordInOpenTransaction(
    context: EvaluationContext,
    input: {
      commandId?: string;
      contributionId?: string;
      rubricVersion: string;
      dimensions: Record<string, number | string | null>;
    },
  ) {
    const commandId = input.commandId ?? randomUUID();
    const contributionId = input.contributionId ?? randomUUID();
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claim.sub',
      context.evaluatorId,
    ]);
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claim.role',
      'authenticated',
    ]);
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: context.evaluatorId, role: 'authenticated' }),
    ]);
    await client.query('set local role authenticated');
    const result = await client.query<EvaluationRow>(
      'select * from public.record_player_evaluation($1, $2, $3, $4, $5, $6::jsonb)',
      [
        commandId,
        contributionId,
        context.communityId,
        context.playerId,
        input.rubricVersion,
        JSON.stringify(input.dimensions),
      ],
    );
    await client.query('reset role');
    return { commandId, contributionId, rows: result.rows };
  }

  async function countRows(table: string, predicate = '', params: unknown[] = []): Promise<number> {
    const { rows } = await client.query<{ count: string }>(
      `select count(*)::text as count from ${table} ${predicate}`,
      params,
    );
    return Number(rows[0].count);
  }

  test('migration refuses prior evaluation source data atomically and preserves it', async () => {
    const migrations = loadMigrations();
    const migrationIndex = migrations.findIndex(({ name }) => name === MIGRATION_NAME);
    assert.ok(migrationIndex > 0);
    const before = await rebuildFromMigrations(client, {
      excludeMigrationNames: migrations.slice(migrationIndex).map(({ name }) => name),
    });
    assert.ok(before.failures.length <= 106);
    const ownerId = await newUser('rubric-migration-owner');
    const { rows: communities } = await client.query<{ id: string }>(
      'insert into public.communities (owner_id, name) values ($1, $2) returning id',
      [ownerId, 'Rubric migration guard'],
    );
    await client.query(
      `insert into public.community_memberships (community_id, user_id, role, status)
       values ($1, $2, 'owner', 'active')`,
      [communities[0].id, ownerId],
    );
    const playerId = randomUUID();
    await client.query(
      `insert into public.players (
         id, owner_id, name, nickname, active, deleted_at, has_account_identity_history
       ) values ($1, $2, 'Migration player', null, true, null, false)`,
      [playerId, ownerId],
    );
    const contributionId = randomUUID();
    await client.query(
      `insert into public.player_evaluation_contributions (
         id, community_id, player_id, evaluator_user_id, rubric_version, command_id
       ) values ($1, $2, $3, $4, 'legacy-before-contract', $5)`,
      [contributionId, communities[0].id, playerId, ownerId, randomUUID()],
    );
    await client.query(
      `insert into public.player_evaluation_dimension_scores (contribution_id, dimension_key, value)
       values ($1, 'legacy-dimension', 4)`,
      [contributionId],
    );

    const sql = readFileSync(MIGRATION_PATH, 'utf8');
    let migrationError: unknown;
    await client.query('begin');
    try {
      for (const statement of splitSqlStatements(sql)) await client.query(statement);
    } catch (error) {
      migrationError = error;
    } finally {
      await client.query('rollback');
    }

    const preserved = {
      contributions: await countRows('public.player_evaluation_contributions', 'where id = $1', [
        contributionId,
      ]),
      scores: await countRows(
        'public.player_evaluation_dimension_scores',
        'where contribution_id = $1',
        [contributionId],
      ),
      registry: await client.query(`select to_regclass('public.skill_rubric_versions') as name`),
    };
    await rebuildFull();

    assertSqlError(
      migrationError,
      '23514',
      'Skill rubric contract migration requires empty evaluation source tables',
    );
    assert.deepEqual(
      {
        contributions: preserved.contributions,
        scores: preserved.scores,
        registry: preserved.registry.rows[0].name,
      },
      { contributions: 1, scores: 1, registry: null },
    );
  });

  test('seed publishes exactly the legacy eleven optional source dimensions in client order', async () => {
    const { rows: versions } = await client.query<{
      rubric_version: string;
      status: string;
      provenance: string;
    }>(
      `select rubric_version, status, provenance
         from public.skill_rubric_versions
        order by rubric_version`,
    );
    assert.equal(versions.length, 1);
    assert.equal(versions[0].rubric_version, 'v0-legacy-11');
    assert.equal(versions[0].status, 'EXPERIMENTAL');
    assert.match(versions[0].provenance, /ATTRIBUTE_KEYS/);
    assert.match(versions[0].provenance, /src\/logic\/playerEvaluations\.ts/);

    const { rows: dimensions } = await client.query<{
      dimension_key: string;
      kind: string;
      is_required: boolean;
      display_order: number;
    }>(
      `select dimension_key, kind, is_required, display_order
         from public.skill_rubric_dimensions
        where rubric_version = 'v0-legacy-11'
        order by display_order`,
    );
    assert.deepEqual(
      dimensions,
      SEEDED_DIMENSIONS.map((dimensionKey, index) => ({
        dimension_key: dimensionKey,
        kind: 'SOURCE',
        is_required: false,
        display_order: index + 1,
      })),
    );
    assert.equal(
      dimensions.some(({ dimension_key }) => /overall|geral/i.test(dimension_key)),
      false,
    );
  });

  test('registry status and dimension kind remain experimental source singletons', async () => {
    const stable = await inRolledBackTransaction(pool, async (db) =>
      db.query(
        `insert into public.skill_rubric_versions (rubric_version, status, provenance)
         values ($1, 'STABLE', 'test')`,
        [`stable-${randomUUID()}`],
      ),
    ).catch((error: Error) => error);
    assertSqlError(stable, '23514');

    const derived = await inRolledBackTransaction(pool, async (db) => {
      const version = `derived-${randomUUID()}`;
      await db.query(
        `insert into public.skill_rubric_versions (rubric_version, status, provenance)
         values ($1, 'EXPERIMENTAL', 'test')`,
        [version],
      );
      return db.query(
        `insert into public.skill_rubric_dimensions (
           rubric_version, dimension_key, kind, is_required, display_order
         ) values ($1, 'overall', 'DERIVED', false, 1)`,
        [version],
      );
    }).catch((error: Error) => error);
    assertSqlError(derived, '23514');
  });

  test('composite foreign keys reject an unknown rubric, a parent-version mismatch, and an unknown dimension', async () => {
    const context = await evaluationContext('foreign-keys');

    const unknownRubric = await inRolledBackTransaction(pool, async (db) =>
      db.query(
        `insert into public.player_evaluation_contributions (
           id, community_id, player_id, evaluator_user_id, rubric_version, command_id
         ) values ($1, $2, $3, $4, 'unknown-rubric', $5)`,
        [randomUUID(), context.communityId, context.playerId, context.evaluatorId, randomUUID()],
      ),
    ).catch((error: Error) => error);
    assertSqlError(unknownRubric, '23503');
    assert.equal(unknownRubric.constraint, 'player_evaluation_contributions_rubric_version_fkey');

    const mismatchedParent = await inRolledBackTransaction(pool, async (db) => {
      const version = `other-${randomUUID()}`;
      await insertRubric(db, version, [{ key: 'saque', required: false }]);
      const contributionId = randomUUID();
      await db.query(
        `insert into public.player_evaluation_contributions (
           id, community_id, player_id, evaluator_user_id, rubric_version, command_id
         ) values ($1, $2, $3, $4, 'v0-legacy-11', $5)`,
        [contributionId, context.communityId, context.playerId, context.evaluatorId, randomUUID()],
      );
      return db.query(
        `insert into public.player_evaluation_dimension_scores (
           contribution_id, rubric_version, dimension_key, value
         ) values ($1, $2, 'saque', 6)`,
        [contributionId, version],
      );
    }).catch((error: Error) => error);
    assertSqlError(mismatchedParent, '23503');
    assert.equal(
      mismatchedParent.constraint,
      'player_evaluation_dimension_scores_contribution_fkey',
    );

    const unknownDimension = await inRolledBackTransaction(pool, async (db) => {
      const contributionId = randomUUID();
      await db.query(
        `insert into public.player_evaluation_contributions (
           id, community_id, player_id, evaluator_user_id, rubric_version, command_id
         ) values ($1, $2, $3, $4, 'v0-legacy-11', $5)`,
        [contributionId, context.communityId, context.playerId, context.evaluatorId, randomUUID()],
      );
      return db.query(
        `insert into public.player_evaluation_dimension_scores (
           contribution_id, rubric_version, dimension_key, value
         ) values ($1, 'v0-legacy-11', 'unknown-dimension', 6)`,
        [contributionId],
      );
    }).catch((error: Error) => error);
    assertSqlError(unknownDimension, '23503');
    assert.equal(unknownDimension.constraint, 'player_evaluation_dimension_scores_dimension_fkey');
  });

  test('command refuses unregistered rubrics and undeclared exact dimension keys', async () => {
    const context = await evaluationContext('semantic-refusals');
    const unknownVersion = await record(context, {
      rubricVersion: 'unknown',
      dimensions: { saque: 6 },
    }).catch((error: Error) => error);
    assertSqlError(unknownVersion, '23514', 'Rubric version is not registered');

    const undeclaredCases: Array<Record<string, number | string | null>> = [
      { overall: 6 },
      { 'saque ': 6 },
    ];
    for (const dimensions of undeclaredCases) {
      const undeclared = await record(context, { dimensions }).catch((error: Error) => error);
      assertSqlError(undeclared, '23514', 'Dimension is not part of this rubric version');
    }
    assert.equal(
      await countRows(
        'public.player_evaluation_contributions',
        'where community_id = $1 and player_id = $2',
        [context.communityId, context.playerId],
      ),
      0,
    );
  });

  test('required dimensions are enforced while omitted optional dimensions create no score', async () => {
    const requiredContext = await evaluationContext('required');
    const requiredVersion = `required-${randomUUID()}`;
    let omittedRequired: unknown;
    await client.query('begin');
    try {
      await insertRubric(client, requiredVersion, [
        { key: 'saque', required: true },
        { key: 'ataque', required: false },
      ]);
      omittedRequired = await recordInOpenTransaction(requiredContext, {
        rubricVersion: requiredVersion,
        dimensions: { ataque: 7 },
      }).catch((error: Error) => error);
    } finally {
      await client.query('rollback');
    }
    assertSqlError(
      omittedRequired,
      '23514',
      'Rubric version requires a score for every required dimension',
    );

    const optionalContext = await evaluationContext('optional');
    const optionalVersion = `optional-${randomUUID()}`;
    await client.query('begin');
    try {
      await insertRubric(client, optionalVersion, [
        { key: 'saque', required: true },
        { key: 'ataque', required: false },
      ]);
      const recorded = await recordInOpenTransaction(optionalContext, {
        rubricVersion: optionalVersion,
        dimensions: { saque: 8 },
      });
      const { rows } = await client.query<{
        rubric_version: string;
        dimension_key: string;
        value: string;
      }>(
        `select rubric_version, dimension_key, value::text as value
           from public.player_evaluation_dimension_scores
          where contribution_id = $1`,
        [recorded.contributionId],
      );
      assert.deepEqual(rows, [
        { rubric_version: optionalVersion, dimension_key: 'saque', value: '8' },
      ]);
    } finally {
      await client.query('rollback');
    }
  });

  test('cross-version supersession preserves each contribution and score binding', async () => {
    const context = await evaluationContext('cross-version');
    const secondVersion = `second-${randomUUID()}`;
    await client.query('begin');
    try {
      await insertRubric(client, secondVersion, [{ key: 'saque', required: true }]);
      const first = await recordInOpenTransaction(context, {
        rubricVersion: 'v0-legacy-11',
        dimensions: { saque: 4 },
      });
      const second = await recordInOpenTransaction(context, {
        rubricVersion: secondVersion,
        dimensions: { saque: 9 },
      });
      assert.deepEqual(second.rows, [
        {
          contribution_id: second.contributionId,
          superseded_contribution_id: first.contributionId,
          dimension_count: 1,
        },
      ]);
      const { rows } = await client.query<{
        contribution_id: string;
        contribution_version: string;
        score_version: string;
        superseded_by_id: string | null;
      }>(
        `select c.id as contribution_id, c.rubric_version as contribution_version,
                s.rubric_version as score_version, c.superseded_by_id
           from public.player_evaluation_contributions c
           join public.player_evaluation_dimension_scores s on s.contribution_id = c.id
          where c.id in ($1, $2)`,
        [first.contributionId, second.contributionId],
      );
      assert.equal(rows.length, 2);
      assert.deepEqual(
        rows.find((row) => row.contribution_id === first.contributionId),
        {
          contribution_id: first.contributionId,
          contribution_version: 'v0-legacy-11',
          score_version: 'v0-legacy-11',
          superseded_by_id: second.contributionId,
        },
      );
      assert.deepEqual(
        rows.find((row) => row.contribution_id === second.contributionId),
        {
          contribution_id: second.contributionId,
          contribution_version: secondVersion,
          score_version: secondVersion,
          superseded_by_id: null,
        },
      );
    } finally {
      await client.query('rollback');
    }
  });

  test('rubric versions are trimmed into both contribution and score rows', async () => {
    const context = await evaluationContext('trim');
    const recorded = await record(context, { rubricVersion: '  v0-legacy-11  ' });
    const { rows } = await client.query<{
      contribution_version: string;
      score_version: string;
    }>(
      `select c.rubric_version as contribution_version, s.rubric_version as score_version
         from public.player_evaluation_contributions c
         join public.player_evaluation_dimension_scores s on s.contribution_id = c.id
        where c.id = $1`,
      [recorded.contributionId],
    );
    assert.deepEqual(rows, [
      { contribution_version: 'v0-legacy-11', score_version: 'v0-legacy-11' },
    ]);
  });

  test('numeric validation precedes registry checks and failed validation changes no source state', async () => {
    const context = await evaluationContext('precedence');
    const first = await record(context, { dimensions: { saque: 5 } });
    const before = {
      contributionCount: await countRows(
        'public.player_evaluation_contributions',
        'where community_id = $1 and player_id = $2',
        [context.communityId, context.playerId],
      ),
      receiptCount: await countRows(
        'app_private.command_receipts',
        "where command_type = 'record_player_evaluation' and actor_id = $1",
        [context.evaluatorId],
      ),
    };

    const nonNumeric = await record(context, {
      rubricVersion: 'unknown',
      dimensions: { saque: 'invalid' },
    }).catch((error: Error) => error);
    assertSqlError(
      nonNumeric,
      '23514',
      'Dimension keys must be non-blank and scores must be numbers',
    );
    const outOfRange = await record(context, {
      rubricVersion: 'unknown',
      dimensions: { saque: 11 },
    }).catch((error: Error) => error);
    assertSqlError(outOfRange, '23514', 'Dimension scores must be between 0 and 10');
    const undeclared = await record(context, { dimensions: { overall: 6 } }).catch(
      (error: Error) => error,
    );
    assertSqlError(undeclared, '23514', 'Dimension is not part of this rubric version');

    const { rows: effective } = await client.query<{ id: string }>(
      `select id from public.player_evaluation_contributions
        where community_id = $1 and player_id = $2 and evaluator_user_id = $3
          and superseded_at is null`,
      [context.communityId, context.playerId, context.evaluatorId],
    );
    const after = {
      contributionCount: await countRows(
        'public.player_evaluation_contributions',
        'where community_id = $1 and player_id = $2',
        [context.communityId, context.playerId],
      ),
      receiptCount: await countRows(
        'app_private.command_receipts',
        "where command_type = 'record_player_evaluation' and actor_id = $1",
        [context.evaluatorId],
      ),
    };
    assert.deepEqual(effective, [{ id: first.contributionId }]);
    assert.deepEqual(after, before);
  });

  test('authorized receipt replay wins over new rubric validation and revoked authorization still blocks it', async () => {
    const context = await evaluationContext('replay');
    const first = await record(context, { dimensions: { saque: 5 } });
    const replay = await record(context, {
      commandId: first.commandId,
      contributionId: first.contributionId,
      rubricVersion: 'unknown',
      dimensions: { overall: 99 },
    });
    assert.deepEqual(replay.rows, first.rows);

    await client.query(
      `update public.community_responsibilities
          set revoked_at = pg_catalog.now()
        where community_id = $1 and user_id = $2 and responsibility = 'EVALUATOR'`,
      [context.communityId, context.evaluatorId],
    );
    const unauthorizedReplay = await record(context, {
      commandId: first.commandId,
      contributionId: first.contributionId,
    }).catch((error: Error) => error);
    assertSqlError(
      unauthorizedReplay,
      '42501',
      'Not authorized to evaluate Players in this Community',
    );
    assert.equal(
      await countRows(
        'public.player_evaluation_contributions',
        'where community_id = $1 and player_id = $2',
        [context.communityId, context.playerId],
      ),
      1,
    );
  });

  test('authenticated callers read the registry and RPC while anonymous callers cannot', async () => {
    const actorId = await newUser('rubric-reader');
    const direct = await call<{ rubric_version: string }>(
      actorId,
      'select rubric_version from public.skill_rubric_versions order by rubric_version',
    );
    assert.deepEqual(direct.rows, [{ rubric_version: 'v0-legacy-11' }]);

    const rpc = await call<{ dimension_key: string; is_required: boolean; display_order: number }>(
      actorId,
      'select * from public.skill_rubric_dimensions_for($1)',
      ['v0-legacy-11'],
    );
    assert.deepEqual(
      rpc.rows,
      SEEDED_DIMENSIONS.map((dimensionKey, index) => ({
        dimension_key: dimensionKey,
        is_required: false,
        display_order: index + 1,
      })),
    );
    const unknown = await call(actorId, 'select * from public.skill_rubric_dimensions_for($1)', [
      'unknown',
    ]);
    assert.deepEqual(unknown.rows, []);

    const anonymousTable = await call(null, 'select * from public.skill_rubric_versions').catch(
      (error: Error) => error,
    );
    assertSqlError(anonymousTable, '42501');
    const anonymousRpc = await call(null, 'select * from public.skill_rubric_dimensions_for($1)', [
      'v0-legacy-11',
    ]).catch((error: Error) => error);
    assertSqlError(anonymousRpc, '42501');
  });

  test('browser roles cannot mutate registries and evaluation source tables expose no grants', async () => {
    const actorId = await newUser('rubric-writer');
    const attempts = [
      `insert into public.skill_rubric_versions (rubric_version, status, provenance)
       values ('browser-write', 'EXPERIMENTAL', 'browser')`,
      `update public.skill_rubric_versions set provenance = 'browser' where false`,
      `delete from public.skill_rubric_versions where false`,
      `truncate table public.skill_rubric_versions`,
      `insert into public.skill_rubric_dimensions (
         rubric_version, dimension_key, kind, is_required, display_order
       ) values ('v0-legacy-11', 'browser-write', 'SOURCE', false, 99)`,
      `update public.skill_rubric_dimensions set is_required = true where false`,
      `delete from public.skill_rubric_dimensions where false`,
      `truncate table public.skill_rubric_dimensions`,
    ];
    for (const actor of [actorId, null]) {
      for (const sql of attempts) {
        const denied = await call(actor, sql).catch((error: Error) => error);
        assertSqlError(denied, '42501');
      }
    }

    const { rows: sourceGrants } = await client.query<{ count: string }>(
      `select count(*)::text as count
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in (
            'player_evaluation_contributions', 'player_evaluation_dimension_scores'
          )
          and grantee in ('PUBLIC', 'anon', 'authenticated')`,
    );
    assert.deepEqual(sourceGrants, [{ count: '0' }]);
  });

  test('registry RLS, grants, policies, and read function attributes match the published contract', async () => {
    const { rows: rls } = await client.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity
         from pg_catalog.pg_class
        where oid in (
          'public.skill_rubric_versions'::regclass,
          'public.skill_rubric_dimensions'::regclass
        )
        order by relname`,
    );
    assert.deepEqual(rls, [
      { relname: 'skill_rubric_dimensions', relrowsecurity: true },
      { relname: 'skill_rubric_versions', relrowsecurity: true },
    ]);

    const { rows: grants } = await client.query<{
      table_name: string;
      grantee: string;
      privilege_type: string;
    }>(
      `select table_name, grantee, privilege_type
         from information_schema.role_table_grants
        where table_schema = 'public'
          and table_name in ('skill_rubric_versions', 'skill_rubric_dimensions')
          and grantee in ('PUBLIC', 'anon', 'authenticated')
        order by table_name, grantee, privilege_type`,
    );
    assert.deepEqual(grants, [
      {
        table_name: 'skill_rubric_dimensions',
        grantee: 'authenticated',
        privilege_type: 'SELECT',
      },
      {
        table_name: 'skill_rubric_versions',
        grantee: 'authenticated',
        privilege_type: 'SELECT',
      },
    ]);

    const { rows: policies } = await client.query<{
      tablename: string;
      cmd: string;
      roles: string[];
    }>(
      `select tablename, cmd, roles::text[] as roles
         from pg_catalog.pg_policies
        where schemaname = 'public'
          and tablename in ('skill_rubric_versions', 'skill_rubric_dimensions')
        order by tablename`,
    );
    assert.deepEqual(policies, [
      { tablename: 'skill_rubric_dimensions', cmd: 'SELECT', roles: ['authenticated'] },
      { tablename: 'skill_rubric_versions', cmd: 'SELECT', roles: ['authenticated'] },
    ]);

    const { rows: fn } = await client.query<{
      volatility: string;
      security_definer: boolean;
      config: string[] | null;
    }>(
      `select p.provolatile as volatility, p.prosecdef as security_definer, p.proconfig as config
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname = 'skill_rubric_dimensions_for'`,
    );
    assert.deepEqual(fn, [
      { volatility: 's', security_definer: false, config: ['search_path=""'] },
    ]);

    const { rows: functionGrants } = await client.query<{
      grantee: string;
      privilege_type: string;
    }>(
      `select grantee, privilege_type
         from information_schema.routine_privileges
        where specific_schema = 'public'
          and routine_name = 'skill_rubric_dimensions_for'
          and grantee in ('PUBLIC', 'anon', 'authenticated')
        order by grantee, privilege_type`,
    );
    assert.deepEqual(functionGrants, [{ grantee: 'authenticated', privilege_type: 'EXECUTE' }]);
  });
}
