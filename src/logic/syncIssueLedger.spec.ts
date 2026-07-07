import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../storage/localStorageRepository';
import {
  loadSyncIssueLedger,
  recordStoredSyncIssue,
  resolveStoredSyncIssuesForOperation,
} from './syncIssueLedger';

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
