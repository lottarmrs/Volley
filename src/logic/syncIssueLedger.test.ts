import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSyncIssueSummary,
  buildRecoverableSyncActions,
  clearResolvedSyncIssues,
  formatSyncIssueError,
  recordSyncIssue,
  resolveSyncIssuesForOperation,
  type SyncIssueEntry,
} from './syncIssueLedger';

test('recordSyncIssue groups repeated sync failures by operation context and message', () => {
  const first = recordSyncIssue([], {
    operation: 'sync',
    context: 'proposta de vinculo',
    error: new Error('network down'),
    occurredAt: '2026-07-07T12:00:00.000Z',
  });

  const second = recordSyncIssue(first, {
    operation: 'sync',
    context: 'proposta de vinculo',
    error: new Error('network down'),
    occurredAt: '2026-07-07T12:05:00.000Z',
  });

  assert.equal(second.length, 1);
  assert.equal(second[0].operation, 'sync');
  assert.equal(second[0].context, 'proposta de vinculo');
  assert.equal(second[0].message, 'network down');
  assert.equal(second[0].status, 'open');
  assert.equal(second[0].count, 2);
  assert.equal(second[0].firstSeenAt, '2026-07-07T12:00:00.000Z');
  assert.equal(second[0].lastSeenAt, '2026-07-07T12:05:00.000Z');
});

test('resolveSyncIssuesForOperation closes only open issues for the completed operation', () => {
  const ledger: SyncIssueEntry[] = [
    {
      id: 'sync:players:network',
      operation: 'sync',
      context: 'atleta "Ana"',
      message: 'network down',
      status: 'open',
      count: 1,
      firstSeenAt: '2026-07-07T12:00:00.000Z',
      lastSeenAt: '2026-07-07T12:00:00.000Z',
    },
    {
      id: 'upload:drafts:timeout',
      operation: 'upload',
      context: 'rascunho',
      message: 'timeout',
      status: 'open',
      count: 1,
      firstSeenAt: '2026-07-07T12:01:00.000Z',
      lastSeenAt: '2026-07-07T12:01:00.000Z',
    },
  ];

  const resolved = resolveSyncIssuesForOperation(ledger, {
    operation: 'sync',
    resolvedAt: '2026-07-07T12:10:00.000Z',
  });

  assert.equal(resolved[0].status, 'resolved');
  assert.equal(resolved[0].resolvedAt, '2026-07-07T12:10:00.000Z');
  assert.equal(resolved[1].status, 'open');
  assert.equal(resolved[1].resolvedAt, undefined);
});

test('clearResolvedSyncIssues removes resolved items and keeps open issues', () => {
  const ledger: SyncIssueEntry[] = [
    {
      id: 'sync:players:network',
      operation: 'Sincronizacao',
      context: 'atleta "Ana"',
      message: 'network down',
      status: 'open',
      count: 1,
      firstSeenAt: '2026-07-07T12:00:00.000Z',
      lastSeenAt: '2026-07-07T12:00:00.000Z',
    },
    {
      id: 'sync:old:resolved',
      operation: 'Sincronizacao',
      context: 'antigo',
      message: 'ok after retry',
      status: 'resolved',
      count: 2,
      firstSeenAt: '2026-07-07T11:00:00.000Z',
      lastSeenAt: '2026-07-07T11:05:00.000Z',
      resolvedAt: '2026-07-07T11:10:00.000Z',
    },
  ];

  const cleaned = clearResolvedSyncIssues(ledger);

  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].id, 'sync:players:network');
});

test('recordSyncIssue keeps the ledger bounded to the newest entries', () => {
  let ledger: SyncIssueEntry[] = [];

  for (let index = 0; index < 55; index += 1) {
    ledger = recordSyncIssue(ledger, {
      operation: 'sync',
      context: `context-${index}`,
      error: `error-${index}`,
      occurredAt: `2026-07-07T12:${String(index).padStart(2, '0')}:00.000Z`,
    });
  }

  assert.equal(ledger.length, 50);
  assert.equal(ledger[0].context, 'context-54');
  assert.equal(ledger.at(-1)?.context, 'context-5');
});

test('buildSyncIssueSummary exposes open issue counts and the latest open entries', () => {
  const ledger: SyncIssueEntry[] = [
    {
      id: 'sync:players:network',
      operation: 'Sincronizacao',
      context: 'atleta "Ana"',
      message: 'network down',
      status: 'open',
      count: 3,
      firstSeenAt: '2026-07-07T12:00:00.000Z',
      lastSeenAt: '2026-07-07T12:10:00.000Z',
    },
    {
      id: 'upload:drafts:timeout',
      operation: 'Envio para a nuvem',
      context: 'rascunho',
      message: 'timeout',
      status: 'open',
      count: 1,
      firstSeenAt: '2026-07-07T12:01:00.000Z',
      lastSeenAt: '2026-07-07T12:15:00.000Z',
    },
    {
      id: 'sync:old:resolved',
      operation: 'Sincronizacao',
      context: 'antigo',
      message: 'ok after retry',
      status: 'resolved',
      count: 2,
      firstSeenAt: '2026-07-07T11:00:00.000Z',
      lastSeenAt: '2026-07-07T11:05:00.000Z',
      resolvedAt: '2026-07-07T11:10:00.000Z',
    },
  ];

  const summary = buildSyncIssueSummary(ledger);

  assert.equal(summary.openCount, 2);
  assert.equal(summary.resolvedCount, 1);
  assert.equal(summary.totalOpenOccurrences, 4);
  assert.deepEqual(summary.openByOperation, {
    'Envio para a nuvem': 1,
    Sincronizacao: 1,
  });
  assert.equal(summary.latestOpen[0].context, 'rascunho');
  assert.equal(summary.latestOpen[1].context, 'atleta "Ana"');
});

test('buildRecoverableSyncActions classifies open ledger issues into retry actions', () => {
  const ledger: SyncIssueEntry[] = [
    {
      id: 'upload:players:network',
      operation: 'Envio para a nuvem',
      context: 'atleta "Ana"',
      message: 'network down',
      status: 'open',
      count: 2,
      firstSeenAt: '2026-07-07T12:00:00.000Z',
      lastSeenAt: '2026-07-07T12:10:00.000Z',
    },
    {
      id: 'sync:proposal:timeout',
      operation: 'Sincronizacao',
      context: 'proposta de vinculo',
      message: 'timeout',
      status: 'open',
      count: 1,
      firstSeenAt: '2026-07-07T12:02:00.000Z',
      lastSeenAt: '2026-07-07T12:12:00.000Z',
    },
    {
      id: 'download:old:resolved',
      operation: 'Download da nuvem',
      context: 'download',
      message: 'already fixed',
      status: 'resolved',
      count: 1,
      firstSeenAt: '2026-07-07T11:00:00.000Z',
      lastSeenAt: '2026-07-07T11:00:00.000Z',
      resolvedAt: '2026-07-07T11:10:00.000Z',
    },
  ];

  const actions = buildRecoverableSyncActions(ledger);

  assert.equal(actions.openIssueCount, 2);
  assert.equal(actions.canRetryUpload, true);
  assert.equal(actions.canRetrySync, true);
  assert.equal(actions.canRetryDownload, false);
  assert.equal(actions.primaryAction, 'sync');
  assert.equal(actions.primaryActionLabel, 'Tentar sincronizar novamente');
});

test('buildRecoverableSyncActions returns no primary action for a clean ledger', () => {
  const actions = buildRecoverableSyncActions([]);

  assert.equal(actions.openIssueCount, 0);
  assert.equal(actions.canRetryUpload, false);
  assert.equal(actions.canRetrySync, false);
  assert.equal(actions.canRetryDownload, false);
  assert.equal(actions.primaryAction, null);
  assert.equal(actions.primaryActionLabel, null);
});

test('formatSyncIssueError handles Error instances, strings, and Supabase Postgrest error objects', () => {
  assert.equal(formatSyncIssueError(new Error('connection timeout')), 'connection timeout');
  assert.equal(formatSyncIssueError('network failed'), 'network failed');
  assert.equal(
    formatSyncIssueError({ code: 'PGRST116', message: 'The result contains 0 rows' }),
    '[PGRST116] The result contains 0 rows',
  );
  assert.equal(
    formatSyncIssueError({ details: 'Foreign key constraint violated' }),
    'Foreign key constraint violated',
  );
  assert.equal(formatSyncIssueError({ unknown: 123 }), '{"unknown":123}');
  assert.equal(formatSyncIssueError(null), 'Falha desconhecida');
});
