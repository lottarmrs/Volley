import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, Pool, type PoolClient } from 'pg';

/**
 * XS-W0-03 — Real PostgreSQL/Supabase integration harness.
 *
 * Connects to a REAL PostgreSQL. It never mocks the layer that owns the invariant
 * (QA-INV-003) and never substitutes an in-memory double, which OPEN-QA-002 records as
 * insufficient.
 *
 * Orchestration is deliberately NOT decided here. OPEN-QA-002 is still open, so the
 * harness takes whatever database `VOLLEY_TEST_DATABASE_URL` points at: a local
 * `supabase start`, a docker-compose Postgres, or a CI service container. The
 * architecture requirement is the capability, not one runner.
 *
 * Safety: the harness refuses to run against anything that does not look like a local or
 * explicitly-marked test database, because its first act is to drop and rebuild the schema.
 */

export const TEST_DATABASE_URL_VAR = 'VOLLEY_TEST_DATABASE_URL';
const MIGRATIONS_DIR = 'supabase/migrations';

export class MissingTestDatabase extends Error {
  constructor() {
    super(
      `${TEST_DATABASE_URL_VAR} is not set. The PostgreSQL harness requires a real database; ` +
        'it will not fall back to a mock (QA-INV-003, OPEN-QA-002). ' +
        'Start one with `npm run db:start` and re-run, or export the variable yourself.',
    );
    this.name = 'MissingTestDatabase';
  }
}

export function testDatabaseUrl(): string {
  const url = process.env[TEST_DATABASE_URL_VAR];
  if (!url) throw new MissingTestDatabase();
  return url;
}

export function isTestDatabaseConfigured(): boolean {
  return Boolean(process.env[TEST_DATABASE_URL_VAR]);
}

/**
 * Refuses to touch a database that is not clearly disposable.
 *
 * The harness rebuilds the schema from zero, so pointing it at a shared or production
 * database would be destructive. Local hosts and an explicit `test` marker are the only
 * accepted shapes.
 */
export function assertDisposableDatabase(url: string): void {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const database = parsed.pathname.replace(/^\//, '');

  const localHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === 'db';
  const markedTest = /test/i.test(database) || /test/i.test(host);

  if (!localHost && !markedTest) {
    throw new Error(
      `Refusing to run the destructive harness against ${host}/${database}. ` +
        'The database must be on localhost or carry "test" in its host or name.',
    );
  }
}

export interface MigrationFile {
  readonly name: string;
  readonly sql: string;
}

/**
 * Versioned migrations are the authoritative schema history (GINV-SCHEMA-001).
 *
 * ORDERING FINDING (XS-W0-03): `schema.sql` is the base schema and creates `public.profiles`,
 * which the very first timestamped migration already depends on. It lives inside
 * `supabase/migrations/`, so plain lexicographic order -- what this harness used initially,
 * and what `supabase db reset` uses -- sorts it LAST and the chain fails immediately with
 * `relation "public.profiles" does not exist`.
 *
 * The real deployment order is base schema first, then the timestamped chain, so that is
 * what this reproduces. The file placement itself is a repository finding for W14 rather
 * than something this slice should silently paper over.
 */
export const BASE_SCHEMA_FILE = 'schema.sql';

export function loadMigrations(dir = MIGRATIONS_DIR): MigrationFile[] {
  const all = readdirSync(dir).filter((name) => name.endsWith('.sql'));
  const base = all.filter((name) => name === BASE_SCHEMA_FILE);
  const timestamped = all.filter((name) => name !== BASE_SCHEMA_FILE).sort();

  return [...base, ...timestamped].map((name) => ({
    name,
    sql: readFileSync(join(dir, name), 'utf8'),
  }));
}

export async function connect(): Promise<Client> {
  const url = testDatabaseUrl();
  assertDisposableDatabase(url);
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

export function createPool(max = 8): Pool {
  const url = testDatabaseUrl();
  assertDisposableDatabase(url);
  return new Pool({ connectionString: url, max });
}

/**
 * Rebuilds `public` from zero and replays every migration in filename order.
 *
 * Suite 1 of the slice: proving the chain applies cleanly from nothing is what makes every
 * later assertion trustworthy.
 */
export async function rebuildFromMigrations(client: Client): Promise<FreshBuildResult> {
  const migrations = loadMigrations();
  if (migrations.length === 0)
    throw new Error('No migrations found; refusing to declare a fresh build.');

  // Supabase roles/schemas the migrations assume. Created only when absent so the harness
  // also works against a real `supabase start` stack, where they already exist.
  await client.query(`
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
      if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin nologin noinherit; end if;
    end $$;
  `);

  await client.query('drop schema if exists public cascade');
  await client.query('create schema public');
  await client.query('drop schema if exists auth cascade');
  await client.query('create schema auth');
  await client.query('drop schema if exists app_private cascade');
  await client.query('grant usage on schema public to anon, authenticated, service_role');
  await client.query('create extension if not exists "pgcrypto"');
  await client.query('create extension if not exists "uuid-ossp"');

  // Supabase puts contrib extensions in their own schema; a migration installs `unaccent`
  // there explicitly.
  await client.query('create schema if not exists extensions');
  await client.query('grant usage on schema extensions to anon, authenticated, service_role');
  await client.query('create extension if not exists "unaccent" with schema extensions');

  // Storage stand-in. The avatar migrations attach policies to storage.objects/buckets,
  // which only exist once the storage-api service has run its own migrations. Stubbing the
  // tables lets the domain chain apply.
  //
  // LIMITATION, stated rather than hidden: storage RLS is therefore NOT covered by this
  // harness. Media/storage authorization is W11 and needs the real storage service.
  await client.query(`
    create schema if not exists storage;
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      created_at timestamptz not null default now()
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text,
      owner uuid,
      created_at timestamptz not null default now()
    );
    create or replace function storage.foldername(name text) returns text[]
      language sql immutable as $$ select string_to_array(name, '/'); $$;
    grant usage on schema storage to anon, authenticated, service_role;
  `);

  // Minimal faithful stand-in for GoTrue: RLS depends on auth.uid()/auth.role()/auth.jwt(),
  // and auth.users is the FK target for profiles. This models the auth CONTRACT that RLS
  // reads, which is what the slice needs; it does not mock the layer under test.
  await client.query(`
    create table if not exists auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      raw_user_meta_data jsonb default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
    $$;
    create or replace function auth.email() returns text language sql stable as $$
      select nullif(current_setting('request.jwt.claim.email', true), '');
    $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
    $$;
    grant usage on schema auth to anon, authenticated, service_role;
  `);

  const failures: StatementFailure[] = [];

  for (const migration of migrations) {
    for (const [index, statement] of splitSqlStatements(migration.sql).entries()) {
      try {
        await client.query(statement);
      } catch (error) {
        // Statements are applied individually so one broken statement does not roll back
        // the entire chain. Failures are COLLECTED, not swallowed: the caller asserts them
        // against a pinned baseline, so a new break fails the suite.
        failures.push({
          migration: migration.name,
          index,
          message: (error as Error).message,
          statement: statement.slice(0, 160).replace(/\s+/g, ' ').trim(),
        });
      }
    }
  }

  return { migrations, failures };
}

export interface StatementFailure {
  readonly migration: string;
  readonly index: number;
  readonly message: string;
  readonly statement: string;
}

export interface FreshBuildResult {
  readonly migrations: MigrationFile[];
  readonly failures: StatementFailure[];
}

/**
 * Splits SQL into statements, respecting dollar-quoted bodies.
 *
 * A naive split on `;` would shred every `create function ... $$ ... $$` body, and the
 * chain is full of them.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;
  let dollarTag: string | null = null;
  let lineComment = false;
  let blockComment = false;
  let singleQuote = false;

  while (index < sql.length) {
    const rest = sql.slice(index);

    if (singleQuote) {
      // '' is an escaped quote inside a string, not a terminator.
      if (rest.startsWith("''")) {
        current += "''";
        index += 2;
        continue;
      }
      if (sql[index] === "'") singleQuote = false;
      current += sql[index];
      index += 1;
      continue;
    }

    if (lineComment) {
      if (sql[index] === '\n') lineComment = false;
      current += sql[index];
      index += 1;
      continue;
    }
    if (blockComment) {
      if (rest.startsWith('*/')) {
        blockComment = false;
        current += '*/';
        index += 2;
        continue;
      }
      current += sql[index];
      index += 1;
      continue;
    }
    if (dollarTag) {
      if (rest.startsWith(dollarTag)) {
        current += dollarTag;
        index += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += sql[index];
      index += 1;
      continue;
    }

    if (rest.startsWith('--')) {
      lineComment = true;
      current += '--';
      index += 2;
      continue;
    }
    if (rest.startsWith('/*')) {
      blockComment = true;
      current += '/*';
      index += 2;
      continue;
    }

    if (sql[index] === "'") {
      singleQuote = true;
      current += "'";
      index += 1;
      continue;
    }

    const openingTag = rest.match(/^\$[A-Za-z_]*\$/);
    if (openingTag) {
      dollarTag = openingTag[0];
      current += dollarTag;
      index += dollarTag.length;
      continue;
    }

    if (sql[index] === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      index += 1;
      continue;
    }

    current += sql[index];
    index += 1;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

/**
 * Runs `work` as a given identity, the way PostgREST presents a request to PostgreSQL.
 *
 * `null` means anonymous. RLS reads auth.uid()/auth.role() from these settings, so this is
 * how the harness exercises allow AND deny identities (QA-INV-005).
 */
export async function asIdentity<T>(
  client: PoolClient | Client,
  userId: string | null,
  work: () => Promise<T>,
): Promise<T> {
  const role = userId ? 'authenticated' : 'anon';

  // MUST run inside a transaction. `set_config(..., true)` and `SET LOCAL ROLE` are both
  // transaction-scoped; issued outside one they are silently no-ops, auth.uid() stays null
  // and the connection keeps the owner role, which BYPASSES RLS. A first version of this
  // harness did exactly that and reported RLS as broken when it was the harness that was.
  // The transaction is always rolled back, so identity blocks cannot leak state either.
  await client.query('begin');
  try {
    await client.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId ?? '']);
    await client.query('select set_config($1, $2, true)', ['request.jwt.claim.role', role]);
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, role }),
    ]);
    await client.query(`set local role ${role}`);
    return await work();
  } finally {
    await client.query('rollback').catch(() => undefined);
  }
}

/**
 * Like `asIdentity`, but COMMITS.
 *
 * `asIdentity` always rolls back, which is right for read and deny assertions and silently
 * useless for testing a command that must persist: the write happens, the assertion reads
 * the pre-state, and the test fails for a reason that has nothing to do with the code under
 * test. Any suite exercising a mutating semantic command needs this variant instead.
 *
 * The identity settings are still transaction-scoped, so they end with the transaction
 * either way; only the durability of the work differs.
 */
export async function asIdentityCommitting<T>(
  client: PoolClient | Client,
  userId: string | null,
  work: () => Promise<T>,
): Promise<T> {
  const role = userId ? 'authenticated' : 'anon';

  await client.query('begin');
  try {
    await client.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId ?? '']);
    await client.query('select set_config($1, $2, true)', ['request.jwt.claim.role', role]);
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      JSON.stringify({ sub: userId, role }),
    ]);
    await client.query(`set local role ${role}`);
    const result = await work();
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}

/** Opens a transaction and always rolls back, so suites cannot leak state into each other. */
export async function inRolledBackTransaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    return await work(client);
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release();
  }
}
