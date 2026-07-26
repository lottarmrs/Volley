import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSyncIssueLedger, recordStoredSyncIssue } from '../logic/syncIssueLedger';
import { syncService, type LocalSyncPayload } from '@infra/supabase/syncService';
import type { CloudSyncDeps } from './useCloudSync';
import { useCloudSync } from './useCloudSync';

function emptyPayload(): LocalSyncPayload {
  return {
    communities: [],
    players: [],
    rules: [],
    templates: [],
    sessions: [],
    teams: [],
    games: [],
    pointEvents: [],
    gameReports: [],
    sessionReports: [],
    presenceRecords: [],
    drafts: [],
    championships: [],
    championshipTeams: [],
    championshipRounds: [],
  };
}

function deps(overrides: Partial<CloudSyncDeps> = {}): CloudSyncDeps {
  return {
    userId: 'user-1',
    communities: [],
    setCommunities: vi.fn(),
    players: [],
    setPlayers: vi.fn(),
    rules: [],
    setRules: vi.fn(),
    templates: [],
    setTemplates: vi.fn(),
    drafts: [],
    setDrafts: vi.fn(),
    sessions: [],
    setSessions: vi.fn(),
    teams: [],
    setTeams: vi.fn(),
    games: [],
    setGames: vi.fn(),
    pointEvents: [],
    setPointEvents: vi.fn(),
    gameReports: [],
    setGameReports: vi.fn(),
    sessionReports: [],
    setSessionReports: vi.fn(),
    presenceRecords: [],
    setPresenceRecords: vi.fn(),
    ...overrides,
  };
}

describe('useCloudSync issue ledger', () => {
  const originalUpload = syncService.uploadLocalDataToCloud;
  const originalSyncNow = syncService.syncNow;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T12:00:00.000Z'));
    syncService.uploadLocalDataToCloud = originalUpload;
    syncService.syncNow = originalSyncNow;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    syncService.uploadLocalDataToCloud = originalUpload;
    syncService.syncNow = originalSyncNow;
  });

  it('records partial upload issues in the local sync issue ledger', async () => {
    syncService.uploadLocalDataToCloud = async (_payload, _userId, options) => {
      options?.onIssue?.('atleta "Ana"', new Error('network down'));
      return emptyPayload();
    };

    const { result } = renderHook(() => useCloudSync(deps()));

    await act(async () => {
      await result.current.uploadToCloud();
    });

    expect(loadSyncIssueLedger()[0]).toMatchObject({
      operation: 'Envio para a nuvem',
      context: 'atleta "Ana"',
      message: 'network down',
      status: 'open',
      count: 1,
      firstSeenAt: '2026-07-07T12:00:00.000Z',
    });
    expect(result.current.syncIssueSummary).toMatchObject({
      openCount: 1,
      totalOpenOccurrences: 1,
    });
    expect(result.current.syncIssues[0]).toMatchObject({
      context: 'atleta "Ana"',
      status: 'open',
    });
    expect(result.current.recoverableSyncActions).toMatchObject({
      canRetryUpload: true,
      primaryAction: 'upload',
      primaryActionLabel: 'Tentar envio novamente',
    });
  });

  it('resolves stored upload issues after a clean upload', async () => {
    recordStoredSyncIssue({
      operation: 'Envio para a nuvem',
      context: 'atleta "Ana"',
      error: 'network down',
      occurredAt: '2026-07-07T11:00:00.000Z',
    });
    syncService.uploadLocalDataToCloud = async () => emptyPayload();

    const { result } = renderHook(() => useCloudSync(deps()));

    await act(async () => {
      await result.current.uploadToCloud();
    });

    expect(loadSyncIssueLedger()[0]).toMatchObject({
      status: 'resolved',
      resolvedAt: '2026-07-07T12:00:00.000Z',
    });
    expect(result.current.syncIssueSummary.openCount).toBe(0);
    expect(result.current.syncIssues[0]).toMatchObject({
      status: 'resolved',
      resolvedAt: '2026-07-07T12:00:00.000Z',
    });
    expect(result.current.recoverableSyncActions.openIssueCount).toBe(0);
  });

  it('retries the primary recoverable sync action', async () => {
    recordStoredSyncIssue({
      operation: 'Sincronização',
      context: 'proposta de vinculo',
      error: 'timeout',
      occurredAt: '2026-07-07T11:00:00.000Z',
    });
    const calls: string[] = [];
    syncService.syncNow = async () => {
      calls.push('sync');
      return emptyPayload();
    };
    syncService.uploadLocalDataToCloud = async () => {
      calls.push('upload');
      return emptyPayload();
    };

    const { result } = renderHook(() => useCloudSync(deps()));

    expect(result.current.recoverableSyncActions.primaryAction).toBe('sync');

    await act(async () => {
      await result.current.retryPrimarySyncAction();
    });

    expect(calls).toEqual(['sync']);
    expect(result.current.recoverableSyncActions.openIssueCount).toBe(0);
  });
});
