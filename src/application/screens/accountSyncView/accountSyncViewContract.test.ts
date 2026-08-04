import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAccountSyncViewContract } from './accountSyncViewContract';
import type { AccountSyncViewContractInput } from './accountSyncViewContract';
import type { RecoverableSyncActions, SyncIssueSummary } from '@logic/syncIssueLedger';

function spy() {
  const calls: unknown[][] = [];
  const fn = (...a: unknown[]) => {
    calls.push(a);
  };
  return { fn, calls };
}

type Spy = ReturnType<typeof spy>;

function asyncSpy() {
  const calls: unknown[][] = [];
  const fn = (...a: unknown[]) => {
    calls.push(a);
    return Promise.resolve();
  };
  return { fn, calls };
}

type AsyncSpy = ReturnType<typeof asyncSpy>;

function recoverableActions(
  overrides: Partial<RecoverableSyncActions> = {},
): RecoverableSyncActions {
  return {
    openIssueCount: 0,
    canRetryUpload: false,
    canRetrySync: false,
    canRetryDownload: false,
    primaryAction: null,
    primaryActionLabel: null,
    ...overrides,
  };
}

function issueSummary(overrides: Partial<SyncIssueSummary> = {}): SyncIssueSummary {
  return {
    openCount: 0,
    resolvedCount: 0,
    totalOpenOccurrences: 0,
    openByOperation: {},
    latestOpen: [],
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<AccountSyncViewContractInput> = {},
): AccountSyncViewContractInput {
  return {
    user: { id: 'u1', email: 'a@b.com' },
    profile: null,
    loading: false,
    isSupabaseConfigured: true,
    lastSyncedAt: null,
    syncLoading: false,
    players: [],
    onSync: () => Promise.resolve(),
    onRepairDuplicates: () => Promise.resolve(),
    onSignOut: () => Promise.resolve(),
    onLinkGoogleIdentity: () => Promise.resolve(),
    ...overrides,
  };
}

test('buildModel projeta os 10 campos de dados', () => {
  const c = buildAccountSyncViewContract(
    makeInput({
      user: { id: 'u2', email: 'c@d.com' },
      loading: true,
      isSupabaseConfigured: false,
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
      syncLoading: true,
      recoverableSyncActions: recoverableActions({ openIssueCount: 3 }),
      syncIssueSummary: issueSummary({ openCount: 3 }),
    }),
  );
  assert.deepEqual(c.model.user, { id: 'u2', email: 'c@d.com' });
  assert.equal(c.model.loading, true);
  assert.equal(c.model.isSupabaseConfigured, false);
  assert.equal(c.model.lastSyncedAt, '2026-01-01T00:00:00.000Z');
  assert.equal(c.model.syncLoading, true);
  assert.equal(c.model.recoverableSyncActions?.openIssueCount, 3);
  assert.equal(c.model.syncIssueSummary?.openCount, 3);
});

test('buildModel deixa campos opcionais undefined quando omitidos', () => {
  const c = buildAccountSyncViewContract(makeInput());
  assert.equal(c.model.recoverableSyncActions, undefined);
  assert.equal(c.model.syncIssueSummary, undefined);
  assert.equal(c.model.syncConflicts, undefined);
});

test('sync chama onSync', async () => {
  const onSync = asyncSpy() as unknown as AsyncSpy;
  const c = buildAccountSyncViewContract(makeInput({ onSync: onSync.fn as never }));
  await c.dispatch({ kind: 'sync' });
  assert.equal(onSync.calls.length, 1);
});

test('repairDuplicates chama onRepairDuplicates', async () => {
  const onRepairDuplicates = asyncSpy() as unknown as AsyncSpy;
  const c = buildAccountSyncViewContract(
    makeInput({ onRepairDuplicates: onRepairDuplicates.fn as never }),
  );
  await c.dispatch({ kind: 'repairDuplicates' });
  assert.equal(onRepairDuplicates.calls.length, 1);
});

test('signOut chama onSignOut', async () => {
  const onSignOut = asyncSpy() as unknown as AsyncSpy;
  const c = buildAccountSyncViewContract(makeInput({ onSignOut: onSignOut.fn as never }));
  await c.dispatch({ kind: 'signOut' });
  assert.equal(onSignOut.calls.length, 1);
});

test('linkGoogleIdentity chama onLinkGoogleIdentity', async () => {
  const onLinkGoogleIdentity = asyncSpy() as unknown as AsyncSpy;
  const c = buildAccountSyncViewContract(
    makeInput({ onLinkGoogleIdentity: onLinkGoogleIdentity.fn as never }),
  );
  await c.dispatch({ kind: 'linkGoogleIdentity' });
  assert.equal(onLinkGoogleIdentity.calls.length, 1);
});

test('retryPrimarySyncAction chama onRetryPrimarySyncAction quando fornecido', async () => {
  const onRetryPrimarySyncAction = asyncSpy() as unknown as AsyncSpy;
  const c = buildAccountSyncViewContract(
    makeInput({ onRetryPrimarySyncAction: onRetryPrimarySyncAction.fn as never }),
  );
  await c.dispatch({ kind: 'retryPrimarySyncAction' });
  assert.equal(onRetryPrimarySyncAction.calls.length, 1);
});

test('retryPrimarySyncAction nao lanca quando callback ausente', async () => {
  const c = buildAccountSyncViewContract(makeInput({ onRetryPrimarySyncAction: undefined }));
  await c.dispatch({ kind: 'retryPrimarySyncAction' });
});

test('clearResolvedSyncIssues chama onClearResolvedSyncIssues quando fornecido', async () => {
  const onClearResolvedSyncIssues = asyncSpy() as unknown as AsyncSpy;
  const c = buildAccountSyncViewContract(
    makeInput({ onClearResolvedSyncIssues: onClearResolvedSyncIssues.fn as never }),
  );
  await c.dispatch({ kind: 'clearResolvedSyncIssues' });
  assert.equal(onClearResolvedSyncIssues.calls.length, 1);
});

test('clearResolvedSyncIssues nao lanca quando callback ausente', async () => {
  const c = buildAccountSyncViewContract(makeInput({ onClearResolvedSyncIssues: undefined }));
  await c.dispatch({ kind: 'clearResolvedSyncIssues' });
});

test('keepMineConflict chama onKeepMineConflict com sessionId', async () => {
  const onKeepMineConflict = spy() as unknown as Spy;
  const c = buildAccountSyncViewContract(
    makeInput({ onKeepMineConflict: onKeepMineConflict.fn as never }),
  );
  await c.dispatch({ kind: 'keepMineConflict', sessionId: 's1' });
  assert.equal(onKeepMineConflict.calls.length, 1);
  assert.deepEqual(onKeepMineConflict.calls[0], ['s1']);
});

test('keepMineConflict nao lanca quando callback ausente', async () => {
  const c = buildAccountSyncViewContract(makeInput({ onKeepMineConflict: undefined }));
  await c.dispatch({ kind: 'keepMineConflict', sessionId: 's1' });
});

test('keepTheirsConflict chama onKeepTheirsConflict com sessionId', async () => {
  const onKeepTheirsConflict = spy() as unknown as Spy;
  const c = buildAccountSyncViewContract(
    makeInput({ onKeepTheirsConflict: onKeepTheirsConflict.fn as never }),
  );
  await c.dispatch({ kind: 'keepTheirsConflict', sessionId: 's2' });
  assert.equal(onKeepTheirsConflict.calls.length, 1);
  assert.deepEqual(onKeepTheirsConflict.calls[0], ['s2']);
});

test('keepTheirsConflict nao lanca quando callback ausente', async () => {
  const c = buildAccountSyncViewContract(makeInput({ onKeepTheirsConflict: undefined }));
  await c.dispatch({ kind: 'keepTheirsConflict', sessionId: 's2' });
});

test('cada intent chama apenas o seu callback (mutual exclusion)', async () => {
  const onSync = asyncSpy() as unknown as AsyncSpy;
  const onSignOut = asyncSpy() as unknown as AsyncSpy;
  const c = buildAccountSyncViewContract(
    makeInput({
      onSync: onSync.fn as never,
      onSignOut: onSignOut.fn as never,
    }),
  );
  await c.dispatch({ kind: 'sync' });
  assert.equal(onSync.calls.length, 1);
  assert.equal(onSignOut.calls.length, 0);

  await c.dispatch({ kind: 'signOut' });
  assert.equal(onSync.calls.length, 1);
  assert.equal(onSignOut.calls.length, 1);
});
