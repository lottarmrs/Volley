import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import {
  loadSyncIssueLedger,
  recordStoredSyncIssue,
  recordSyncIssue,
  resolveStoredSyncIssuesForOperation,
} from './syncIssueLedger';
import type { SyncIssueEntry } from './syncIssueLedger';

describe('syncIssueLedger storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists recorded sync issues in local storage', () => {
    recordStoredSyncIssue({
      operation: 'sync',
      context: 'atleta "Ana"',
      error: new Error('network down'),
      occurredAt: '2026-07-07T12:00:00.000Z',
    });

    const stored = loadSyncIssueLedger();

    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      operation: 'sync',
      context: 'atleta "Ana"',
      message: 'network down',
      status: 'open',
      count: 1,
    });
    expect(localStorage.getItem(STORAGE_KEYS.syncIssueLedger)).toContain('network down');
  });

  it('persists resolved issues for a completed operation', () => {
    recordStoredSyncIssue({
      operation: 'sync',
      context: 'proposta de vinculo',
      error: 'timeout',
      occurredAt: '2026-07-07T12:00:00.000Z',
    });

    resolveStoredSyncIssuesForOperation({
      operation: 'sync',
      resolvedAt: '2026-07-07T12:10:00.000Z',
    });

    expect(loadSyncIssueLedger()[0]).toMatchObject({
      status: 'resolved',
      resolvedAt: '2026-07-07T12:10:00.000Z',
    });
  });
});

import { dueSyncIssues } from './syncIssueLedger';

describe('proxima tentativa', () => {
  it('grava nextAttemptAt para erro de rede e omite para estrutural', () => {
    const rede = recordSyncIssue([], {
      operation: 'Sincronização',
      context: 'upload',
      error: new TypeError('Failed to fetch'),
      occurredAt: '2026-07-31T12:00:00.000Z',
    });
    expect(rede[0].kind).toBe('offline_unavailable');
    expect(rede[0].nextAttemptAt).toBe('2026-07-31T12:00:30.000Z');

    const estrutural = recordSyncIssue([], {
      operation: 'Sincronização',
      context: 'upload',
      error: { code: '42501', message: 'permission denied' },
      occurredAt: '2026-07-31T12:00:00.000Z',
    });
    expect(estrutural[0].kind).toBe('authorization');
    expect(estrutural[0].nextAttemptAt).toBeUndefined();
  });

  it('dueSyncIssues devolve so o que ja venceu', () => {
    const ledger: SyncIssueEntry[] = [
      {
        id: 'a', operation: 'op', context: 'ctx', message: 'm', status: 'open', count: 1,
        firstSeenAt: '2026-07-31T12:00:00.000Z', lastSeenAt: '2026-07-31T12:00:00.000Z',
        kind: 'offline_unavailable', nextAttemptAt: '2026-07-31T12:00:30.000Z',
      },
      {
        id: 'b', operation: 'op', context: 'ctx', message: 'm2', status: 'open', count: 1,
        firstSeenAt: '2026-07-31T12:00:00.000Z', lastSeenAt: '2026-07-31T12:00:00.000Z',
        kind: 'offline_unavailable', nextAttemptAt: '2026-07-31T13:00:00.000Z',
      },
    ];
    const vencidos = dueSyncIssues(ledger, '2026-07-31T12:00:31.000Z');
    expect(vencidos.map((i) => i.id)).toEqual(['a']);
  });

  it('issue resolvida nunca vence, mesmo com horario passado', () => {
    const ledger: SyncIssueEntry[] = [
      {
        id: 'a', operation: 'op', context: 'ctx', message: 'm', status: 'resolved', count: 1,
        firstSeenAt: '2026-07-31T12:00:00.000Z', lastSeenAt: '2026-07-31T12:00:00.000Z',
        kind: 'offline_unavailable', nextAttemptAt: '2026-07-31T12:00:30.000Z',
      },
    ];
    expect(dueSyncIssues(ledger, '2026-07-31T23:00:00.000Z')).toEqual([]);
  });
});
