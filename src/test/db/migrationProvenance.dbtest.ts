import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client } from 'pg';
import {
  asIdentity,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';
import type { Pool } from 'pg';

/**
 * XS-W0-06 exit gate, against a REAL PostgreSQL:
 *
 *   "A representative split/ambiguous migration can record both successful mapping and
 *    quarantined anomaly without guessing."
 *
 * The representative case is the one the W0-02 ledger already identified: legacy
 * `community_players` conflates a GOVERNANCE relation with a SPORTS relation, which
 * GINV-ID-003 says are independent. Splitting it produces a CommunityPlayer mapping that is
 * exact, and a CommunityMembership decision that may be undecidable for rows whose
 * deprecated role column is empty or unrecognised.
 *
 * The point is not that the substrate can store rows. It is that a migration can say
 * "this part I know, that part I refuse to guess" in the same run.
 */

if (!isTestDatabaseConfigured()) {
  test(`migration provenance requires ${TEST_DATABASE_URL_VAR}`, () => {
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

  async function startRun(name: string): Promise<string> {
    const { rows } = await client.query<{ run_id: string }>(
      'insert into app_private.migration_runs (name, source_release) values ($1, $2) returning run_id',
      [name, 'test'],
    );
    return rows[0].run_id;
  }

  test('the substrate exists and is internal-only', async () => {
    // Scoped to this substrate's own tables (the `migration_*` prefix), not to every table
    // that may ever live in `app_private` -- later slices (e.g. C6 XS-W3-06's
    // `command_receipts`) legitimately add unrelated internal tables to that schema.
    const { rows } = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'app_private' and table_name like 'migration_%'
       order by table_name`,
    );

    assert.deepEqual(
      rows.map((r) => r.table_name),
      ['migration_anomalies', 'migration_checkpoints', 'migration_entity_map', 'migration_runs'],
    );
  });

  test('browser roles cannot reach migration metadata', async () => {
    // "Keep internal migration metadata outside normal public browser CRUD surface."
    for (const role of ['anon', 'authenticated'] as const) {
      const { rows } = await client.query<{ ok: boolean }>(
        'select has_schema_privilege($1, $2, $3) as ok',
        [role, 'app_private', 'USAGE'],
      );
      assert.equal(rows[0].ok, false, `${role} must not have USAGE on app_private`);
    }

    const db = await pool.connect();
    try {
      const denied = await asIdentity(db, null, () =>
        db.query('select 1 from app_private.migration_entity_map'),
      ).catch((error: Error) => error);
      assert.ok(denied instanceof Error, 'anonymous must not read migration metadata');
      assert.match((denied as Error).message, /permission denied/i);
    } finally {
      db.release();
    }
  });

  test('EXIT GATE: a split records the known mapping and quarantines the ambiguity', async () => {
    const runId = await startRun('community_players_split');
    const sourceId = 'legacy-community-player-1';

    // Part the migration KNOWS: the sports relation is unambiguous.
    await client.query(
      `insert into app_private.migration_entity_map
         (run_id, source_type, source_id, target_type, target_id, mapping_kind, confidence, source_hash, reason)
       values ($1, 'community_players', $2, 'CommunityPlayer', 'target-cp-1', 'SPLIT', 'EXACT', 'sha256:abc', $3)`,
      [runId, sourceId, 'sports relation is directly represented in the legacy row'],
    );

    // Part it REFUSES to guess: the deprecated role column is empty, so the governance
    // membership cannot be derived. ADR-MIG-004 forbids inventing it.
    await client.query(
      `insert into app_private.migration_anomalies
         (run_id, source_type, source_id, reason, details)
       values ($1, 'community_players', $2, $3, $4::jsonb)`,
      [
        runId,
        sourceId,
        'membership role is undecidable: deprecated role column is empty',
        JSON.stringify({
          rejected_candidates: ['member', 'organizador'],
          why: 'legacy row conflates governance and sports relation (GINV-ID-003)',
        }),
      ],
    );

    // Both facts coexist for ONE source, in ONE run. That is the gate.
    const mapped = await client.query(
      'select target_type, mapping_kind, confidence from app_private.migration_entity_map where run_id = $1 and source_id = $2',
      [runId, sourceId],
    );
    const quarantined = await client.query<{ status: string; details: Record<string, unknown> }>(
      'select status, details from app_private.migration_anomalies where run_id = $1 and source_id = $2',
      [runId, sourceId],
    );

    assert.equal(mapped.rowCount, 1, 'the decidable part must be recorded as a mapping');
    assert.equal(mapped.rows[0].mapping_kind, 'SPLIT');
    assert.equal(mapped.rows[0].confidence, 'EXACT');

    assert.equal(quarantined.rowCount, 1, 'the undecidable part must be quarantined');
    assert.equal(quarantined.rows[0].status, 'QUARANTINED');
    assert.ok(
      Array.isArray(quarantined.rows[0].details.rejected_candidates),
      'the anomaly must carry the evidence a reviewer needs, not just a message',
    );

    // And crucially: no CommunityMembership was invented for the ambiguous half.
    const invented = await client.query(
      "select 1 from app_private.migration_entity_map where run_id = $1 and target_type = 'CommunityMembership'",
      [runId],
    );
    assert.equal(invented.rowCount, 0, 'the ambiguous target must NOT have been guessed');
  });

  test('re-running the same job does not duplicate a mapping', async () => {
    const runId = await startRun('idempotent_rerun');
    const insert = () =>
      client.query(
        `insert into app_private.migration_entity_map
           (run_id, source_type, source_id, target_type, target_id, mapping_kind)
         values ($1, 'players', 'p-1', 'Player', 't-1', 'ONE_TO_ONE')
         on conflict (run_id, source_type, source_id, target_type, target_id) do nothing`,
        [runId],
      );

    await insert();
    await insert();
    await insert();

    const { rows } = await client.query<{ n: string }>(
      "select count(*)::text as n from app_private.migration_entity_map where run_id = $1 and source_id = 'p-1'",
      [runId],
    );
    assert.equal(rows[0].n, '1', 'a repeated mapping must not duplicate provenance');
  });

  test('a split may record several targets for one source', async () => {
    const runId = await startRun('multi_target_split');
    for (const [type, id] of [
      ['CommunityPlayer', 'cp-9'],
      ['CommunityMembership', 'cm-9'],
    ]) {
      await client.query(
        `insert into app_private.migration_entity_map
           (run_id, source_type, source_id, target_type, target_id, mapping_kind, confidence)
         values ($1, 'community_players', 'legacy-9', $2, $3, 'SPLIT', 'EXACT')`,
        [runId, type, id],
      );
    }

    const { rows } = await client.query<{ n: string }>(
      "select count(*)::text as n from app_private.migration_entity_map where run_id = $1 and source_id = 'legacy-9'",
      [runId],
    );
    assert.equal(
      rows[0].n,
      '2',
      'the uniqueness key must allow one source to split into many targets',
    );
  });

  test('an anomaly cannot be closed without saying how', async () => {
    const runId = await startRun('resolution_discipline');
    await client.query(
      `insert into app_private.migration_anomalies (run_id, source_type, source_id, reason)
       values ($1, 'players', 'p-x', 'ambiguous identity')`,
      [runId],
    );

    // "RESOLVED" with no resolution and no reviewer timestamp is how a quarantine quietly
    // becomes a guess. The constraint refuses it.
    const sloppy = await client
      .query("update app_private.migration_anomalies set status = 'RESOLVED' where run_id = $1", [
        runId,
      ])
      .catch((error: Error) => error);
    assert.ok(sloppy instanceof Error, 'closing an anomaly with no resolution must be rejected');
    assert.match((sloppy as Error).message, /check constraint/i);

    const proper = await client.query(
      `update app_private.migration_anomalies
          set status = 'RESOLVED', resolution = 'operator confirmed member', reviewed_at = now()
        where run_id = $1`,
      [runId],
    );
    assert.equal(proper.rowCount, 1, 'a documented resolution must be accepted');
  });

  test('checkpoints make an interrupted run resumable', async () => {
    const runId = await startRun('resumable');
    await client.query(
      `insert into app_private.migration_checkpoints (run_id, checkpoint_key, position, processed_count)
       values ($1, 'community_players', 'cursor-100', 100)
       on conflict (run_id, checkpoint_key)
       do update set position = excluded.position,
                     processed_count = excluded.processed_count,
                     updated_at = now()`,
      [runId],
    );
    await client.query(
      `insert into app_private.migration_checkpoints (run_id, checkpoint_key, position, processed_count)
       values ($1, 'community_players', 'cursor-250', 250)
       on conflict (run_id, checkpoint_key)
       do update set position = excluded.position,
                     processed_count = excluded.processed_count,
                     updated_at = now()`,
      [runId],
    );

    const { rows } = await client.query<{ position: string; processed_count: string }>(
      'select position, processed_count::text from app_private.migration_checkpoints where run_id = $1',
      [runId],
    );
    assert.equal(rows.length, 1, 'a checkpoint key must advance, not accumulate rows');
    assert.equal(rows[0].position, 'cursor-250');
    assert.equal(rows[0].processed_count, '250');
  });

  test('OPEN-MIG-017: no retention policy is asserted on provenance', async () => {
    // The retention period is an open decision, so this slice must not invent a TTL or a
    // prune job. If one appears, OPEN-MIG-017 was closed somewhere and this test should be
    // replaced by an assertion of the agreed policy. Scoped to this substrate's own
    // `migration_*` tables: other `app_private` tables (e.g. C6 XS-W3-06's
    // `command_receipts`) may carry triggers unrelated to provenance retention, such as its
    // own immutability guard, without bearing on OPEN-MIG-017.
    const { rows } = await client.query<{ n: string }>(`
      select count(*)::text as n
      from pg_trigger t join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'app_private' and c.relname like 'migration_%' and not t.tgisinternal
    `);

    assert.equal(rows[0].n, '0', 'no automatic pruning/retention trigger may exist yet');
  });
}
