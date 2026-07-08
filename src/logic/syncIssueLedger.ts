import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';

const MAX_SYNC_ISSUE_ENTRIES = 50;

export type SyncIssueStatus = 'open' | 'resolved';

export interface SyncIssueEntry {
  id: string;
  operation: string;
  context: string;
  message: string;
  status: SyncIssueStatus;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string;
}

export interface SyncIssueInput {
  operation: string;
  context: string;
  error: unknown;
  occurredAt: string;
}

export interface SyncIssueResolution {
  operation: string;
  resolvedAt: string;
}

export interface SyncIssueSummary {
  openCount: number;
  resolvedCount: number;
  totalOpenOccurrences: number;
  openByOperation: Record<string, number>;
  latestOpen: SyncIssueEntry[];
}

export function recordSyncIssue(
  ledger: SyncIssueEntry[],
  input: SyncIssueInput,
): SyncIssueEntry[] {
  const message = formatSyncIssueError(input.error);
  const id = buildSyncIssueId(input.operation, input.context, message);
  const existing = ledger.find((issue) => issue.id === id);

  if (!existing) {
    return limitSyncIssueLedger([
      {
        id,
        operation: input.operation,
        context: input.context,
        message,
        status: 'open',
        count: 1,
        firstSeenAt: input.occurredAt,
        lastSeenAt: input.occurredAt,
      },
      ...ledger,
    ]);
  }

  return limitSyncIssueLedger(
    ledger.map((issue) =>
      issue.id === id
        ? {
            ...issue,
            status: 'open',
            count: issue.count + 1,
            lastSeenAt: input.occurredAt,
            resolvedAt: undefined,
          }
        : issue,
    ),
  );
}

export function resolveSyncIssuesForOperation(
  ledger: SyncIssueEntry[],
  resolution: SyncIssueResolution,
): SyncIssueEntry[] {
  return ledger.map((issue) =>
    issue.operation === resolution.operation && issue.status === 'open'
      ? {
          ...issue,
          status: 'resolved',
          resolvedAt: resolution.resolvedAt,
        }
      : issue,
  );
}

export function buildSyncIssueSummary(ledger: SyncIssueEntry[]): SyncIssueSummary {
  const open = ledger.filter((issue) => issue.status === 'open');
  const resolved = ledger.filter((issue) => issue.status === 'resolved');
  const openByOperation: Record<string, number> = {};

  for (const issue of open) {
    openByOperation[issue.operation] = (openByOperation[issue.operation] || 0) + 1;
  }

  return {
    openCount: open.length,
    resolvedCount: resolved.length,
    totalOpenOccurrences: open.reduce((total, issue) => total + issue.count, 0),
    openByOperation,
    latestOpen: [...open].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0, 5),
  };
}

export function loadSyncIssueLedger(): SyncIssueEntry[] {
  return loadFromStorage<SyncIssueEntry[]>(STORAGE_KEYS.syncIssueLedger, []);
}

export function saveSyncIssueLedger(ledger: SyncIssueEntry[]) {
  saveToStorage(STORAGE_KEYS.syncIssueLedger, ledger);
}

export function recordStoredSyncIssue(input: SyncIssueInput): SyncIssueEntry[] {
  const next = recordSyncIssue(loadSyncIssueLedger(), input);
  saveSyncIssueLedger(next);
  return next;
}

export function resolveStoredSyncIssuesForOperation(
  resolution: SyncIssueResolution,
): SyncIssueEntry[] {
  const next = resolveSyncIssuesForOperation(loadSyncIssueLedger(), resolution);
  saveSyncIssueLedger(next);
  return next;
}

export function formatSyncIssueError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'Falha desconhecida';
}

function buildSyncIssueId(operation: string, context: string, message: string): string {
  return [operation, context, message].map(normalizeIssueKeyPart).join(':');
}

function normalizeIssueKeyPart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function limitSyncIssueLedger(ledger: SyncIssueEntry[]): SyncIssueEntry[] {
  return ledger.slice(0, MAX_SYNC_ISSUE_ENTRIES);
}
