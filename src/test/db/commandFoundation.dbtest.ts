import test from 'node:test';
import assert from 'node:assert/strict';
import type { Client, PoolClient } from 'pg';
import type { Pool } from 'pg';
import {
  asIdentity,
  connect,
  createPool,
  isTestDatabaseConfigured,
  rebuildFromMigrations,
  TEST_DATABASE_URL_VAR,
} from './harness';
import type { CommandContext } from '../../application/command/commandEnvelope';
import {
  accepted,
  isAccepted,
  rejection,
  type CommandResult,
} from '../../application/command/commandOutcome';
import type { CommandPort } from '../../application/command/commandPort';
import {
  ensureAccountReadyCommand,
  executeEnsureAccountReady,
  type AccountReadyState,
} from '../../application/command/ensureAccountReadyCommand';

/**
 * XS-W0-05 exit gate, proven against a REAL PostgreSQL:
 *
 *   "At least one non-destructive target command can execute end-to-end through
 *    Application→RPC with server-derived actor, stable result and retry semantics."
 *
 * The port is exercised through a direct PostgreSQL adapter rather than the Supabase HTTP
 * client. The invariants under test -- actor derived from the authenticated session, and
 * idempotent retry -- are owned by the database, and this reaches the real database
 * (QA-INV-003). The Supabase gateway's transport-to-outcome mapping is a separate unit
 * test, because HTTP shapes are not what this gate is about.
 */

if (!isTestDatabaseConfigured()) {
  test(`command foundation requires ${TEST_DATABASE_URL_VAR}`, () => {
    assert.fail(`${TEST_DATABASE_URL_VAR} is not set; run \`npm run test:db\`.`);
  });
} else {
  let client: Client;
  let pool: Pool;
  let userId: string;

  /** A CommandPort backed by a real PostgreSQL session, honouring the same contract. */
  function pgCommandPort(db: PoolClient): CommandPort {
    return {
      async execute<TPayload, TValue>(
        operation: string,
        context: CommandContext<TPayload>,
      ): Promise<CommandResult<TValue>> {
        const payload = (context.envelope.payload ?? {}) as Record<string, unknown>;
        const names = Object.keys(payload);
        const args = names.map((name, index) => `${name} => $${index + 1}`).join(', ');
        try {
          const { rows } = await db.query(
            `select * from public.${operation}(${args})`,
            names.map((name) => payload[name]),
          );
          return accepted(rows as TValue, context.envelope.commandId);
        } catch (error) {
          const code = (error as { code?: string }).code;
          const outcome = code === '42501' ? 'AUTHORIZATION_REJECTION' : 'TECHNICAL_FAILURE';
          return rejection(outcome, (error as Error).message, context.envelope.commandId, error);
        }
      },
    };
  }

  test.before(async () => {
    client = await connect();
    await rebuildFromMigrations(client);
    const { rows } = await client.query<{ id: string }>(
      'insert into auth.users (email, raw_user_meta_data) values (\'cmd@test.local\', \'{"name":"Cmd"}\'::jsonb) returning id',
    );
    userId = rows[0].id;
    pool = createPool();
  });

  test.after(async () => {
    await pool?.end();
    await client?.end();
  });

  test('EXIT GATE: the command executes end-to-end and is ACCEPTED', async () => {
    const db = await pool.connect();
    try {
      const envelope = ensureAccountReadyCommand();
      const result = await asIdentity(db, userId, () =>
        executeEnsureAccountReady(pgCommandPort(db), envelope),
      );

      assert.ok(isAccepted(result), `expected ACCEPTED, got ${result.outcome}`);
      // The result echoes the logical intent, so a caller can correlate it with the retry.
      assert.equal(result.commandId, envelope.commandId);

      const state = (result.value as AccountReadyState[])[0];
      assert.ok(state, 'command returned no account state');
      assert.equal(state.profile_id, userId, 'the command acted on the AUTHENTICATED user');
    } finally {
      db.release();
    }
  });

  test('EXIT GATE: the actor is server-derived, not taken from the payload', async () => {
    const db = await pool.connect();
    try {
      // The envelope carries no identity at all, yet the command still resolves a profile,
      // and it resolves a DIFFERENT one per authenticated session. That is the property
      // GINV-AUTH-003 requires: identity comes from the session, never from the request.
      const other = await client.query<{ id: string }>(
        "insert into auth.users (email) values ('cmd-other@test.local') returning id",
      );
      const otherId = other.rows[0].id;

      const first = await asIdentity(db, userId, () =>
        executeEnsureAccountReady(pgCommandPort(db), ensureAccountReadyCommand()),
      );
      const second = await asIdentity(db, otherId, () =>
        executeEnsureAccountReady(pgCommandPort(db), ensureAccountReadyCommand()),
      );

      assert.ok(isAccepted(first) && isAccepted(second));
      assert.equal((first.value as AccountReadyState[])[0].profile_id, userId);
      assert.equal((second.value as AccountReadyState[])[0].profile_id, otherId);
      assert.notEqual(
        (first.value as AccountReadyState[])[0].profile_id,
        (second.value as AccountReadyState[])[0].profile_id,
      );
    } finally {
      db.release();
    }
  });

  test('EXIT GATE: an unauthenticated caller is rejected as AUTHORIZATION_REJECTION', async () => {
    const db = await pool.connect();
    try {
      const result = await asIdentity(db, null, () =>
        executeEnsureAccountReady(pgCommandPort(db), ensureAccountReadyCommand()),
      );

      assert.ok(!isAccepted(result), 'anonymous must not execute the command');
      assert.equal(result.outcome, 'AUTHORIZATION_REJECTION');
      // A stable category, not a generic failure: the caller must not retry this.
      assert.equal(result.retriable, false);
    } finally {
      db.release();
    }
  });

  test('EXIT GATE: retrying the SAME commandId produces the same logical effect', async () => {
    const db = await pool.connect();
    try {
      const envelope = ensureAccountReadyCommand();

      const before = await client.query<{ n: string }>(
        'select count(*)::text as n from public.profiles where id = $1',
        [userId],
      );

      const attempt1 = await asIdentity(db, userId, () =>
        executeEnsureAccountReady(pgCommandPort(db), envelope),
      );
      const attempt2 = await asIdentity(db, userId, () =>
        executeEnsureAccountReady(pgCommandPort(db), envelope),
      );
      const attempt3 = await asIdentity(db, userId, () =>
        executeEnsureAccountReady(pgCommandPort(db), envelope),
      );

      assert.ok(isAccepted(attempt1) && isAccepted(attempt2) && isAccepted(attempt3));

      // Same intent identity across all three attempts.
      assert.equal(attempt1.commandId, envelope.commandId);
      assert.equal(attempt2.commandId, envelope.commandId);
      assert.equal(attempt3.commandId, envelope.commandId);

      // Same logical result.
      const ids = [attempt1, attempt2, attempt3].map(
        (r) => (r.value as AccountReadyState[])[0].profile_id,
      );
      assert.deepEqual(ids, [userId, userId, userId]);

      // And no duplicated effect: QA-INV-010, one logical effect per logical command.
      const after = await client.query<{ n: string }>(
        'select count(*)::text as n from public.profiles where id = $1',
        [userId],
      );
      assert.equal(after.rows[0].n, before.rows[0].n === '0' ? '1' : before.rows[0].n);
      assert.equal(after.rows[0].n, '1', 'retries must not create a second profile row');
    } finally {
      db.release();
    }
  });

  test('KNOWN GAP: idempotency here is the command own, not a durable receipt', async () => {
    // Recorded rather than implied. `ensure_account_ready` is naturally idempotent, so
    // retry safety holds for THIS command without any ledger. It does NOT generalise: a
    // command that is not naturally idempotent needs app_private.command_receipts, which
    // C6.01 gates on a resolved schema/retention choice and OPEN-API-002 leaves open.
    //
    // The absence of the table is therefore deliberate, and this test exists so the gap is
    // visible in the suite output rather than only in a commit message.
    const { rows } = await client.query<{ exists: boolean }>(
      `select exists (
         select 1 from information_schema.tables
         where table_schema = 'app_private' and table_name = 'command_receipts'
       ) as exists`,
    );

    assert.equal(
      rows[0].exists,
      false,
      'command_receipts now exists: OPEN-API-002 must have been resolved. Replace this test ' +
        'with real receipt semantics (same commandId returns the recorded terminal result).',
    );
  });
}
