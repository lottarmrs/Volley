import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { renderSecurityBacklogMarkdown } from './schemaSecurityDoc';
import { LEGACY_SEARCH_PATH_PUBLIC, W2_HARDENING_PRIORITY } from './schemaSecurityBaseline';

/**
 * XS-W0-04 backlog integrity. Needs no database, so it runs in the normal unit suite and
 * keeps the published backlog honest even when nobody runs `test:db`.
 */

const BACKLOG_PATH = 'docs/architecture/execution/C6-W0-04-SECURITY-HARDENING-BACKLOG.md';

test('XS-W0-04: the published backlog matches the enforced baseline', () => {
  assert.ok(existsSync(BACKLOG_PATH), `${BACKLOG_PATH} is missing`);
  assert.equal(
    readFileSync(BACKLOG_PATH, 'utf8'),
    renderSecurityBacklogMarkdown(),
    `${BACKLOG_PATH} is generated from schemaSecurityBaseline.ts and is out of date. ` +
      'Re-render it rather than editing the Markdown by hand.',
  );
});

test('XS-W0-04: the W2 priority list is a subset of the pending backlog', () => {
  const stale = W2_HARDENING_PRIORITY.filter((name) => !LEGACY_SEARCH_PATH_PUBLIC.includes(name));

  assert.deepEqual(stale, [], `W2 priority entries no longer pending: ${stale.join(', ')}`);
});

test('XS-W0-04: the backlog has no duplicate entries', () => {
  assert.equal(
    new Set(LEGACY_SEARCH_PATH_PUBLIC).size,
    LEGACY_SEARCH_PATH_PUBLIC.length,
    'LEGACY_SEARCH_PATH_PUBLIC contains duplicates',
  );
  assert.equal(
    new Set(W2_HARDENING_PRIORITY).size,
    W2_HARDENING_PRIORITY.length,
    'W2_HARDENING_PRIORITY contains duplicates',
  );
});
