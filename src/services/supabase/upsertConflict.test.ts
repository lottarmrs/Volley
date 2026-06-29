import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const conflictMigration = readFileSync(
  new URL(
    '../../../supabase/migrations/20260610161236_upsert_conflict_targets.sql',
    import.meta.url,
  ),
  'utf8',
);

const ownerLocalIndexedTables = [
  'communities',
  'players',
  'whatsapp_list_templates',
  'sessions',
  'teams',
  'games',
  'point_events',
  'game_reports',
  'session_reports',
  'community_presence',
  'whatsapp_list_drafts',
];

test('conflict-target migration recreates owner/local id indexes as non-partial', () => {
  // Partial unique indexes cannot be inferred as ON CONFLICT arbiters by PostgREST,
  // so the recreated indexes must not carry the `where local_id is not null` predicate.
  const recreated = conflictMigration
    .split('\n')
    .filter((line) => line.trim().startsWith('create unique index'));

  assert.equal(recreated.length, ownerLocalIndexedTables.length);
  for (const line of recreated) {
    assert.doesNotMatch(line, /where/i, `index must be non-partial: ${line}`);
  }
});

test('client cloud services upsert against the owner/local id conflict target', () => {
  const services = [
    'playerCloudService.ts',
    'communityCloudService.ts',
    'whatsappTemplateCloudService.ts',
    'operationalCloudService.ts',
  ];

  for (const service of services) {
    const source = readFileSync(new URL(`./${service}`, import.meta.url), 'utf8');
    assert.match(
      source,
      /onConflict:\s*'owner_id,local_id'/,
      `${service} must upsert with the owner_id,local_id conflict target`,
    );
  }
});

test('operational fallback upserts surface individual failures', () => {
  const source = readFileSync(new URL('./operationalCloudService.ts', import.meta.url), 'utf8');

  assert.match(source, /fallbackErrors:\s*unknown\[\]/);
  assert.match(source, /throw new AggregateError\(fallbackErrors/);
  assert.doesNotMatch(
    source,
    /catch \(individualError\) \{[\s\S]*?console\.error\(`\[Bulk\] Failed individual upsert in \$\{table\}:`, individualError\);[\s\S]*?\}[\s\S]*?return results;/,
  );
});

test('player cloud service can fetch the player linked to the current user', () => {
  const source = readFileSync(new URL('./playerCloudService.ts', import.meta.url), 'utf8');

  assert.match(source, /fetchLinkedToUser\(userId: string\)/);
  assert.match(source, /\.eq\('user_id', userId\)/);
  assert.match(source, /\.is\('deleted_at', null\)/);
  assert.match(source, /\.maybeSingle\(\)/);
});

test('player link proposal service can fetch the current pending proposal', () => {
  const source = readFileSync(
    new URL('./playerLinkProposalCloudService.ts', import.meta.url),
    'utf8',
  );

  assert.match(source, /fetchPendingForUser\(userId: string\)/);
  assert.match(source, /\.eq\('user_id', userId\)/);
  assert.match(source, /\.eq\('status', 'pending'\)/);
  assert.match(source, /\.maybeSingle\(\)/);
});
