#!/usr/bin/env node
/**
 * XS-W0-03 database harness runner.
 *
 * Orchestration is NOT decided here. OPEN-QA-002 is still open, so this script only
 * resolves a connection string and hands it to the suites. It tries, in order:
 *
 *   1. VOLLEY_TEST_DATABASE_URL, if the caller already set one (CI service container,
 *      docker-compose, a remote scratch database);
 *   2. a running `supabase start` stack, read from `supabase status`.
 *
 * It never starts anything implicitly and never invents a provider. If neither is present
 * it explains what to run and exits non-zero, because a harness that passes without a
 * database would falsely satisfy the slice exit gate.
 */

import { execFileSync, spawnSync } from 'node:child_process';

const VAR = 'VOLLEY_TEST_DATABASE_URL';

function fromSupabaseStatus() {
  try {
    const output = execFileSync('supabase', ['status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const match = output.match(/^DB_URL="?([^"\n]+)"?$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function resolveDatabaseUrl() {
  if (process.env[VAR]) return { url: process.env[VAR], source: `${VAR} environment variable` };

  const supabaseUrl = fromSupabaseStatus();
  if (supabaseUrl) return { url: supabaseUrl, source: 'running `supabase start` stack' };

  return null;
}

const resolved = resolveDatabaseUrl();

if (!resolved) {
  console.error(
    [
      'No PostgreSQL available, so no database invariant can be proven.',
      '',
      'The harness needs a real database (QA-INV-003, QA-INV-004). It will not fall back',
      'to a mock, and OPEN-QA-002 records an in-memory double as insufficient.',
      '',
      'Provide one of:',
      `  - export ${VAR}=postgresql://user:pass@localhost:5432/volley_test`,
      '  - npm run db:start        (local Supabase stack; needs Docker)',
      '',
      'OPEN-QA-002 leaves the CI orchestration undecided on purpose; this runner accepts',
      'whatever database you point it at.',
    ].join('\n'),
  );
  process.exit(1);
}

console.log(`Using PostgreSQL from ${resolved.source}`);

const filter = process.argv[2];
const testArgs = [
  '--import',
  'tsx',
  '--test',
  // MUST be serial. Each suite drops and rebuilds `public`, so running suite files in
  // parallel -- node --test's default -- makes them race and fail with
  // `schema "public" already exists`. The database is shared global state, not per-file.
  '--test-concurrency=1',
  filter ? `src/test/db/${filter}` : 'src/test/db/*.dbtest.ts',
];

const result = spawnSync(process.execPath, testArgs, {
  stdio: 'inherit',
  env: { ...process.env, [VAR]: resolved.url },
});

process.exit(result.status ?? 1);
