import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { interfaceKeys, objectLiteralKeys } from './legacyExpansionPolicy';
import { currentStateLedger } from './currentStateLedger';
import { renderCurrentStateLedgerMarkdown } from './currentStateLedgerDoc';
import { getArchitectureFitness } from './fitnessManifest';

/**
 * XS-W0-02 exit gate:
 *
 *   No W13 removal may begin for an entity whose current readers/writers are not
 *   inventoried.
 *
 * These assertions read the LIVE source, so the ledger cannot silently fall behind the
 * code it inventories. Adding an entity to a sync payload or a key to STORAGE_KEYS fails
 * here until it is inventoried.
 */

const LEDGER_HINT =
  'Add an entry to currentStateLedger.ts recording its legacy writers/readers, ' +
  'authority, merge behaviour, lifecycle fields, FK/delete, target owner, wave and migration class.';

function inventoried(predicate: (entry: (typeof currentStateLedger)[number]) => boolean): boolean {
  return currentStateLedger.some(predicate);
}

test('AF-LEDGER-001: every LocalSyncPayload entity is inventoried', () => {
  const keys = interfaceKeys('src/infra/supabase/syncService.ts', 'LocalSyncPayload');

  assert.ok(keys.length > 0, 'LocalSyncPayload keys could not be read');
  for (const key of keys) {
    assert.ok(
      inventoried((entry) => entry.payloadKey === key),
      `LocalSyncPayload.${key} is not inventoried. ${LEDGER_HINT}`,
    );
  }
});

test('AF-LEDGER-001: every OperationalSyncPayload entity is inventoried', () => {
  const keys = interfaceKeys(
    'src/infra/supabase/operationalCloudService.ts',
    'OperationalSyncPayload',
  );

  assert.ok(keys.length > 0, 'OperationalSyncPayload keys could not be read');
  for (const key of keys) {
    assert.ok(
      inventoried((entry) => entry.payloadKey === key),
      `OperationalSyncPayload.${key} is not inventoried. ${LEDGER_HINT}`,
    );
  }
});

test('AF-LEDGER-001: every STORAGE_KEYS key is inventoried', () => {
  const keys = objectLiteralKeys('src/storage/localStorageRepository.ts', 'STORAGE_KEYS');

  assert.ok(keys.length > 0, 'STORAGE_KEYS could not be read');
  for (const key of keys) {
    assert.ok(
      inventoried((entry) => entry.storageKey === key),
      `STORAGE_KEYS.${key} is not inventoried. ${LEDGER_HINT}`,
    );
  }
});

test('AF-LEDGER-001: the C6.01 minimum inventory is covered', () => {
  // Verbatim from C6.01 XS-W0-02 "Minimum inventory includes".
  const required = [
    'communities',
    'players',
    'community players',
    'community membership and join state',
    'community rules',
    'whatsapp list templates',
    'sessions',
    'teams',
    'games',
    'point events',
    'game reports',
    'session reports',
    'community presence',
    'whatsapp list drafts',
    'player evaluations',
    'self evaluations',
    'championships',
    'championship teams',
    'championship rounds',
    'career events and totals',
    'player avatars and proposals',
  ];

  for (const entity of required) {
    assert.ok(
      inventoried((entry) => entry.entity === entity),
      `C6.01 minimum inventory entity "${entity}" is missing from the ledger`,
    );
  }
});

test('AF-LEDGER-001: ledger entries do not go stale', () => {
  for (const entry of currentStateLedger) {
    for (const surface of [
      ...entry.legacyWriters,
      ...entry.legacyReaders,
      ...entry.remainingSurfaces,
    ]) {
      // Database triggers and other non-file surfaces are recorded prose-style.
      if (!surface.endsWith('.ts') && !surface.endsWith('.tsx')) continue;
      assert.ok(
        existsSync(`src/${surface}`),
        `${entry.entity}: recorded surface src/${surface} no longer exists. ` +
          'Update the ledger when the surface is retired so removal evidence stays true.',
      );
    }
  }
});

test('AF-LEDGER-001: entities with no reader and no writer are explicit removal candidates', () => {
  // The exit gate is about knowing readers/writers, so an empty set must be a deliberate
  // RETIRE classification rather than an unfilled entry.
  for (const entry of currentStateLedger) {
    if (entry.legacyWriters.length > 0 || entry.legacyReaders.length > 0) continue;
    assert.equal(
      entry.migrationClass,
      'RETIRE',
      `${entry.entity} has no recorded reader or writer, so it must be classified RETIRE`,
    );
    assert.ok(entry.notes, `${entry.entity} must explain why it has no reader or writer`);
  }
});

test('AF-LEDGER-001: every entry names a target owner and wave', () => {
  for (const entry of currentStateLedger) {
    assert.match(
      entry.targetOwner,
      /^N2\.\d{2}-/,
      `${entry.entity} must name an owning N2 document`,
    );
    assert.match(entry.targetWave, /^W\d{1,2}$/, `${entry.entity} must name a C6 wave`);
  }
});

test('AF-LEDGER-001: the published document matches the ledger', () => {
  const path = 'docs/architecture/execution/C6-W0-02-CURRENT-STATE-LEDGER.md';

  assert.ok(existsSync(path), `${path} is missing`);
  assert.equal(
    readFileSync(path, 'utf8'),
    renderCurrentStateLedgerMarkdown(),
    `${path} is generated from currentStateLedger.ts and is out of date. ` +
      'Re-render it rather than editing the Markdown by hand.',
  );
});

test('AF-LEDGER-001: the ledger is registered in the fitness manifest', () => {
  const fitness = getArchitectureFitness('AF-LEDGER-001');

  assert.equal(fitness.slice, 'XS-W0-02');
  assert.equal(fitness.lifecycle, 'TRANSITIONAL');
  assert.ok(fitness.removalOrReplacementTrigger.length > 0);
});
