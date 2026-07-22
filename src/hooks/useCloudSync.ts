import { useRef, useState } from 'react';
import {
  downloadCloudDataQuery,
  repairDuplicateCloudDataCommand,
  syncCloudDataCommand,
  uploadCloudDataCommand,
  type LocalSyncPayload,
} from '../application/cloudSyncUseCases';
import {
  buildLocalSyncPayload,
  normalizeCloudSyncResultPayload,
} from '../application/cloudSyncPayload';
import {
  buildRecoverableSyncActions,
  buildSyncIssueSummary,
  clearStoredResolvedSyncIssues,
  loadSyncIssueLedger,
  recordStoredSyncIssue,
  resolveStoredSyncIssuesForOperation,
  type SyncIssueEntry,
} from '../logic/syncIssueLedger';
import {
  loadFromStorage,
  markLocalCacheOwner,
  saveToStorage,
} from '../storage/localStorageRepository';
import {
  Community,
  CommunityPresence,
  CommunityRules,
  Game,
  GameReport,
  Player,
  PlayerLinkProposal,
  PointEvent,
  Session,
  SessionReport,
  Team,
  WhatsAppListDraft,
  WhatsAppListTemplate,
} from '../types';

/**
 * Everything {@link useCloudSync} needs to build the upload payload and apply a
 * result back into the domain hooks. The list-valued fields must be the *raw*
 * collections (including soft-deleted tombstones) so the sync algorithm can
 * reconcile deletions.
 */
export interface CloudSyncDeps {
  userId: string | null;
  communities: Community[];
  setCommunities: (value: Community[]) => void;
  players: Player[];
  setPlayers: (value: Player[]) => void;
  rules: CommunityRules[];
  setRules: (value: CommunityRules[]) => void;
  templates: WhatsAppListTemplate[];
  setTemplates: (value: WhatsAppListTemplate[]) => void;
  drafts: WhatsAppListDraft[];
  setDrafts: (value: WhatsAppListDraft[]) => void;
  sessions: Session[];
  setSessions: (value: Session[]) => void;
  teams: Team[];
  setTeams: (value: Team[]) => void;
  games: Game[];
  setGames: (value: Game[]) => void;
  pointEvents: PointEvent[];
  setPointEvents: (value: PointEvent[]) => void;
  gameReports: GameReport[];
  setGameReports: (value: GameReport[]) => void;
  sessionReports: SessionReport[];
  setSessionReports: (value: SessionReport[]) => void;
  presenceRecords: CommunityPresence[];
  setPresenceRecords: (value: CommunityPresence[]) => void;
  linkProposals: PlayerLinkProposal[];
  setLinkProposals: (value: PlayerLinkProposal[]) => void;
  /** Optional sink for user-facing feedback (e.g. toasts). */
  onToast?: (message: string, variant: 'success' | 'error') => void;
}

export type CloudSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

const LAST_SYNCED_AT_KEY = 'vpg_last_synced_at';

/**
 * Centralizes the three cloud operations (upload, download, two-way sync) that
 * previously lived as triplicated handlers in App.tsx. Each operation builds the
 * payload from the same source, applies the result through the same setters, and
 * shares the loading / error / lastSyncedAt state.
 */
export function useCloudSync(deps: CloudSyncDeps) {
  const [syncLoading, setSyncLoading] = useState(false);
  const [status, setStatus] = useState<CloudSyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [syncIssues, setSyncIssues] = useState<SyncIssueEntry[]>(() => loadSyncIssueLedger());
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    loadFromStorage<string | null>(LAST_SYNCED_AT_KEY, null),
  );

  const buildPayload = (): LocalSyncPayload => buildLocalSyncPayload(deps);

  const applyResult = (result: LocalSyncPayload) => {
    const normalized = normalizeCloudSyncResultPayload(result);

    deps.setCommunities(normalized.communities);
    deps.setPlayers(normalized.players);
    deps.setRules(normalized.rules);
    deps.setTemplates(normalized.templates);
    deps.setSessions(normalized.sessions);
    deps.setTeams(normalized.teams);
    deps.setGames(normalized.games);
    deps.setPointEvents(normalized.pointEvents);
    deps.setGameReports(normalized.gameReports);
    deps.setSessionReports(normalized.sessionReports);
    deps.setPresenceRecords(normalized.presenceRecords);
    deps.setDrafts(normalized.drafts);
    if (normalized.linkProposals) {
      deps.setLinkProposals(normalized.linkProposals);
    }

    const nowStr = new Date().toISOString();
    setLastSyncedAt(nowStr);
    saveToStorage(LAST_SYNCED_AT_KEY, nowStr);
    markLocalCacheOwner(deps.userId);
  };

  // Trava de reentrância: o auto-sync no login e um clique manual podem disparar
  // operações concorrentes. Sem isso, dois uploads em paralelo reconciliam sobre
  // estados intermediários (corrida que pode apagar vínculos / duplicar escrita).
  const inFlight = useRef(false);

  const run = async (
    label: string,
    operation: (
      payload: LocalSyncPayload,
      userId: string,
      onIssue: (context: string, error: unknown) => void,
    ) => Promise<LocalSyncPayload>,
  ) => {
    if (!deps.userId) throw new Error('Usuário não autenticado.');
    if (inFlight.current) {
      deps.onToast?.('Uma sincronização já está em andamento.', 'error');
      return;
    }
    inFlight.current = true;
    setSyncLoading(true);
    setStatus('syncing');
    setError(null);

    const issues: string[] = [];
    const onIssue = (context: string, e: unknown) => {
      const detail = e instanceof Error ? e.message : String(e);
      issues.push(`${context}: ${detail}`);
      const nextIssues = recordStoredSyncIssue({
        operation: label,
        context,
        error: e,
        occurredAt: new Date().toISOString(),
      });
      setSyncIssues(nextIssues);
      console.error(`[sync] falha em ${context}`, e);
    };

    try {
      const result = await operation(buildPayload(), deps.userId, onIssue);
      applyResult(result);
      if (issues.length > 0) {
        // O que deu certo foi aplicado; sinalizamos as falhas parciais.
        setStatus('error');
        setError(issues.join('\n'));
        deps.onToast?.(
          `${label} concluído com ${issues.length} falha(s). Itens não enviados serão tentados de novo.`,
          'error',
        );
      } else {
        const nextIssues = resolveStoredSyncIssuesForOperation({
          operation: label,
          resolvedAt: new Date().toISOString(),
        });
        setSyncIssues(nextIssues);
        setStatus('success');
        deps.onToast?.(`${label} concluído.`, 'success');
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha na sincronização';
      const nextIssues = recordStoredSyncIssue({
        operation: label,
        context: label,
        error: e,
        occurredAt: new Date().toISOString(),
      });
      setSyncIssues(nextIssues);
      setError(message);
      setStatus('error');
      deps.onToast?.(`${label} falhou: ${message}`, 'error');
      throw e;
    } finally {
      inFlight.current = false;
      setSyncLoading(false);
    }
  };

  const uploadToCloud = () =>
    run('Envio para a nuvem', (payload, userId, onIssue) =>
      uploadCloudDataCommand({ payload, userId, onIssue }),
    );

  const downloadFromCloud = () =>
    run('Download da nuvem', () => downloadCloudDataQuery({ userId: deps.userId ?? undefined }));

  const sync = () =>
    run('Sincronização', (payload, userId, onIssue) =>
      syncCloudDataCommand({ payload, userId, onIssue }),
    );

  const recoverableSyncActions = buildRecoverableSyncActions(syncIssues);

  const retryPrimarySyncAction = async () => {
    if (recoverableSyncActions.primaryAction === 'sync') return sync();
    if (recoverableSyncActions.primaryAction === 'upload') return uploadToCloud();
    if (recoverableSyncActions.primaryAction === 'download') return downloadFromCloud();
  };

  const clearResolvedSyncIssues = () => {
    const nextIssues = clearStoredResolvedSyncIssues();
    setSyncIssues(nextIssues);
  };

  const repairDuplicateCloudData = () =>
    run('Saneamento de duplicatas', (_payload, userId, onIssue) =>
      repairDuplicateCloudDataCommand({ userId, onIssue }),
    );

  return {
    uploadToCloud,
    downloadFromCloud,
    sync,
    repairDuplicateCloudData,
    syncLoading,
    lastSyncedAt,
    status,
    error,
    syncIssues,
    syncIssueSummary: buildSyncIssueSummary(syncIssues),
    recoverableSyncActions,
    retryPrimarySyncAction,
    clearResolvedSyncIssues,
  };
}
