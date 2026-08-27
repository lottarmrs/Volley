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

/** Versioned migrations are the authoritative schema history (GINV-SCHEMA-001). */
export function loadMigrations(dir = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
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
export async function rebuildFromMigrations(client: Client): Promise<MigrationFile[]> {
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

  for (const migration of migrations) {
    try {
      await client.query(migration.sql);
    } catch (error) {
      throw new Error(`Migration ${migration.name} failed: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  return migrations;
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
  await client.query('select set_config($1, $2, true)', ['request.jwt.claim.sub', userId ?? '']);
  await client.query('select set_config($1, $2, true)', ['request.jwt.claim.role', role]);
  await client.query('select set_config($1, $2, true)', [
    'request.jwt.claims',
    JSON.stringify({ sub: userId, role }),
  ]);
  await client.query(`set local role ${role}`);
  try {
    return await work();
  } finally {
    await client.query('reset role');
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
