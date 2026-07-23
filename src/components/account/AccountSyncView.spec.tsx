import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { AccountSyncView } from './AccountSyncView';
import type {
  RecoverableSyncActions,
  SyncIssueEntry,
  SyncIssueSummary,
} from '../../logic/syncIssueLedger';

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

function openIssue(overrides: Partial<SyncIssueEntry> = {}): SyncIssueEntry {
  return {
    id: 'sincronizacao-atleta-rls',
    operation: 'Sincronizacao completa',
    context: 'atleta Ana',
    message: 'new row violates row-level security policy',
    status: 'open',
    count: 3,
    firstSeenAt: '2026-07-08T18:00:00.000Z',
    lastSeenAt: '2026-07-08T18:10:00.000Z',
    ...overrides,
  };
}

function renderAccount(overrides: Partial<Parameters<typeof AccountSyncView>[0]> = {}) {
  return render(
    <MemoryRouter>
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
        onSignOut={vi.fn()}
        onLinkGoogleIdentity={vi.fn()}
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
        onClearResolvedSyncIssues={vi.fn()}
        {...overrides}
      />
    </MemoryRouter>,
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

  it('shows the latest open sync issues as an operational history', () => {
    renderAccount({
      syncIssueSummary: issueSummary({
        openCount: 1,
        totalOpenOccurrences: 3,
        latestOpen: [openIssue()],
      }),
    });

    expect(screen.getByText('Historico recente de falhas')).toBeTruthy();
    expect(screen.getByText('Sincronizacao completa')).toBeTruthy();
    expect(screen.getByText('atleta Ana')).toBeTruthy();
    expect(screen.getByText('new row violates row-level security policy')).toBeTruthy();
    expect(screen.getByText('3 tentativa(s)')).toBeTruthy();
  });

  it('offers an action to clear resolved sync issues', () => {
    const onClearResolvedSyncIssues = vi.fn();

    renderAccount({
      syncIssueSummary: issueSummary({
        resolvedCount: 2,
      }),
      onClearResolvedSyncIssues,
    });

    fireEvent.click(screen.getByRole('button', { name: /Limpar resolvidas/i }));

    expect(onClearResolvedSyncIssues).toHaveBeenCalledTimes(1);
  });

  it('shows cloud health attention when open sync issues exist', () => {
    renderAccount({
      syncIssueSummary: issueSummary({
        openCount: 1,
        totalOpenOccurrences: 3,
      }),
    });

    expect(screen.getByText('Diagnostico da nuvem')).toBeTruthy();
    expect(screen.getByText('Requer atencao')).toBeTruthy();
    expect(screen.getByText('1 falha(s) aberta(s), 3 ocorrencia(s)')).toBeTruthy();
  });

  it('links to the MFA setup page', () => {
    renderAccount();

    const link = screen.getByRole('link', {
      name: 'Configurar autenticacao em duas etapas',
    }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/configurar-mfa');
  });
});
