import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AccountSyncView } from './AccountSyncView';
import type { RecoverableSyncActions, SyncIssueSummary } from '../../logic/syncIssueLedger';

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

function renderAccount(overrides: Partial<Parameters<typeof AccountSyncView>[0]> = {}) {
  return render(
    <AccountSyncView
      user={{ id: 'user-1', email: 'ana@example.com' }}
      profile={{
        id: 'user-1',
        name: 'Ana',
        email: 'ana@example.com',
        role: 'user',
        createdAt: '2026-07-07T12:00:00.000Z',
        updatedAt: '2026-07-07T12:00:00.000Z',
      }}
      loading={false}
      isSupabaseConfigured={true}
      onSignIn={vi.fn()}
      onSignUp={vi.fn()}
      onSignOut={vi.fn()}
      onSync={vi.fn()}
      onRepairDuplicates={vi.fn()}
      lastSyncedAt={null}
      syncLoading={false}
      players={[]}
      linkProposals={[]}
      onProposeLink={vi.fn()}
      onCancelLink={vi.fn()}
      recoverableSyncActions={recoverableActions()}
      syncIssueSummary={issueSummary()}
      onRetryPrimarySyncAction={vi.fn()}
      {...overrides}
    />,
  );
}

describe('AccountSyncView sync recovery', () => {
  it('shows a primary retry action for recoverable sync issues', () => {
    const onRetryPrimarySyncAction = vi.fn();

    renderAccount({
      recoverableSyncActions: recoverableActions({
        openIssueCount: 2,
        canRetrySync: true,
        primaryAction: 'sync',
        primaryActionLabel: 'Tentar sincronizar novamente',
      }),
      syncIssueSummary: issueSummary({
        openCount: 2,
        totalOpenOccurrences: 4,
      }),
      onRetryPrimarySyncAction,
    });

    expect(screen.getByText('Falhas de nuvem pendentes')).toBeTruthy();
    expect(screen.getByText('2 item(ns), 4 ocorrencia(s)')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Tentar sincronizar novamente/i }));

    expect(onRetryPrimarySyncAction).toHaveBeenCalledTimes(1);
  });
});
