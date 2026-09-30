import { useEffect, useRef, useState } from 'react';
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
  dueSyncIssues,
  loadSyncIssueLedger,
  recordStoredSyncIssue,
  resolveStoredSyncIssuesForOperation,
  type SyncIssueEntry,
} from '../logic/syncIssueLedger';
import {
  clearLocalDomainCache,
  getLocalCacheOwnerId,
  loadFromStorage,
  markLocalCacheOwner,
  saveToStorage,
  validateCacheOwner,
} from '../storage/localStorageRepository';
import {
  Community,
  CommunityPresence,
  CommunityRules,
  Championship,
  ChampionshipRound,
  ChampionshipTeam,
  Game,
  GameReport,
  Player,
  PointEvent,
  Session,
  SessionReport,
  Team,
  WhatsAppListDraft,
  WhatsAppListTemplate,
} from '../types';
import { useConnectivity } from './useConnectivity';
import { classifySyncError } from '../logic/syncBackoff';

/**
 * Everything {@link useCloudSync} needs to build the upload payload and apply a
 * result back into the domain hooks. The list-valued fields must be the *raw*
 * collections (including soft-deleted tombstones) so the sync algorithm can
 * reconcile deletions.
 */
export interface CloudSyncDeps {
  userId: string | null;
  communities: Community[];
  players: Player[];
  rules: CommunityRules[];
  templates: WhatsAppListTemplate[];
  setTemplates: (value: WhatsAppListTemplate[]) => void;
  drafts: WhatsAppListDraft[];
  setDrafts: (value: WhatsAppListDraft[]) => void;
  sessions: Session[];
  teams: Team[];
  games: Game[];
  pointEvents: PointEvent[];
  gameReports: GameReport[];
  sessionReports: SessionReport[];
  presenceRecords: CommunityPresence[];
  setPresenceRecords: (value: CommunityPresence[]) => void;
  championships?: Championship[];
  setChampionships?: (value: Championship[]) => void;
  championshipTeams?: ChampionshipTeam[];
  setChampionshipTeams?: (value: ChampionshipTeam[]) => void;
  championshipRounds?: ChampionshipRound[];
  setChampionshipRounds?: (value: ChampionshipRound[]) => void;
  /** Quantos registros locais ainda nao chegaram na nuvem; dispara o envio automatico. */
  pendingChanges?: number;
  /** Optional sink for user-facing feedback (e.g. toasts). */
  onToast?: (message: string, variant: 'success' | 'error') => void;
}

export type CloudSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

const LAST_SYNCED_AT_KEY = 'vpg_last_synced_at';

// Espera a pessoa parar de editar antes de enviar, para uma rajada virar um envio so.
const AUTO_SYNC_DEBOUNCE_MS = 4000;
// Sem alteracao local, ainda e preciso trazer o que outros aparelhos gravaram.
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

const SYNC_TTL_MS = 5 * 60 * 1000;
function inflightKey(userId: string): string {
  return `vpg_sync_inflight_${userId}`;
}
function isInflight(userId: string | null): boolean {
  if (!userId) return false;
  const raw = localStorage.getItem(inflightKey(userId));
  if (!raw) return false;
  try {
    const guard = JSON.parse(raw) as { startedAt: string; ttlMs: number };
    return Date.now() - new Date(guard.startedAt).getTime() < guard.ttlMs;
  } catch {
    return false;
  }
}
function setInflight(userId: string): void {
  localStorage.setItem(
    inflightKey(userId),
    JSON.stringify({ startedAt: new Date().toISOString(), ttlMs: SYNC_TTL_MS }),
  );
}
function clearInflight(userId: string): void {
  localStorage.removeItem(inflightKey(userId));
}

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

  const connectivity = useConnectivity();

  const buildPayload = (): LocalSyncPayload =>
    buildLocalSyncPayload({
      ...deps,
      championships: deps.championships || [],
      championshipTeams: deps.championshipTeams || [],
      championshipRounds: deps.championshipRounds || [],
    });

  const applyResult = (result: LocalSyncPayload) => {
    // Cache de outra conta: a nuvem e autoritativa (o result foi buscado com a
    // sessao DESTE usuario), entao apagamos o local e aplicamos. Descartar o
    // result aqui — como se fazia antes — deixava os dados da conta anterior na
    // tela e no localStorage, e o proximo upload os enviava para esta conta.
    if (!validateCacheOwner(deps.userId ?? '', getLocalCacheOwnerId())) {
      clearLocalDomainCache();
    }
    const normalized = normalizeCloudSyncResultPayload(result);

    deps.setTemplates(normalized.templates);
    deps.setPresenceRecords(normalized.presenceRecords);
    deps.setDrafts(normalized.drafts);
    deps.setChampionships?.(normalized.championships);
    deps.setChampionshipTeams?.(normalized.championshipTeams);
    deps.setChampionshipRounds?.(normalized.championshipRounds);

    const nowStr = new Date().toISOString();
    setLastSyncedAt(nowStr);
    saveToStorage(LAST_SYNCED_AT_KEY, nowStr);
    markLocalCacheOwner(deps.userId);
  };

  // Trava de reentrância: o auto-sync no login e um clique manual podem disparar
  // operações concorrentes. Sem isso, dois uploads em paralelo reconciliam sobre
  // estados intermediários (corrida que pode apagar vínculos / duplicar escrita).
  // Persistida em localStorage com TTL para sobreviver remounts e recuperação
  // após crash do navegador.

  const run = async (
    label: string,
    operation: (
      payload: LocalSyncPayload,
      userId: string,
      onIssue: (context: string, error: unknown) => void,
    ) => Promise<LocalSyncPayload>,
    options: { writes: boolean; silent?: boolean } = { writes: true },
  ) => {
    if (!deps.userId) throw new Error('Usuário não autenticado.');
    // A execucao automatica nao fala com a pessoa: falhas ficam no ledger e o aviso
    // persistente do shell ja mostra o que nao chegou na nuvem.
    const toast = options.silent ? undefined : deps.onToast;
    // Enquanto o cache local for de outra conta, qualquer operacao que ESCREVE
    // enviaria os dados da conta anterior para esta. So o download passa — e e
    // ele que limpa o local e desfaz a divergencia.
    if (options.writes && !validateCacheOwner(deps.userId, getLocalCacheOwnerId())) {
      toast?.('O acervo local ainda é de outra conta. Baixe da nuvem antes de enviar.', 'error');
      return;
    }
    if (isInflight(deps.userId)) {
      toast?.('Uma sincronização já está em andamento.', 'error');
      return;
    }
    setInflight(deps.userId);
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
      connectivity.reportOutcome('success');
      if (issues.length > 0) {
        // O que deu certo foi aplicado; sinalizamos as falhas parciais.
        setStatus('error');
        setError(issues.join('\n'));
        toast?.(
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
        toast?.(`${label} concluído.`, 'success');
      }
    } catch (e) {
      // A requisicao real manda mais que o navigator.onLine.
      connectivity.reportOutcome(
        classifySyncError(e) === 'offline_unavailable' ? 'network_failure' : 'success',
      );
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
      toast?.(`${label} falhou: ${message}`, 'error');
      throw e;
    } finally {
      clearInflight(deps.userId);
      setSyncLoading(false);
    }
  };

  const uploadToCloud = () =>
    run('Envio para a nuvem', (payload, userId, onIssue) =>
      uploadCloudDataCommand({ payload, userId, onIssue }),
    );

  const downloadFromCloud = () =>
    run(
      'Download da nuvem',
      () =>
        downloadCloudDataQuery({
          userId: deps.userId ?? undefined,
          catalog: {
            communities: deps.communities,
            players: deps.players,
            rules: deps.rules,
            sessions: deps.sessions,
            teams: deps.teams,
            games: deps.games,
            pointEvents: deps.pointEvents,
            gameReports: deps.gameReports,
            sessionReports: deps.sessionReports,
          },
        }),
      {
        writes: false,
      },
    );

  const syncOperation: Parameters<typeof run>[1] = (payload, userId, onIssue) =>
    syncCloudDataCommand({ payload, userId, onIssue });

  const sync = () => run('Sincronização', syncOperation);

  const autoSync = () => run('Sincronização', syncOperation, { writes: true, silent: true });

  // O evento `online` do browser chega ANTES da rede estar utilizavel de verdade.
  // Sem esta espera, a primeira tentativa quase sempre falha de novo.
  const DEBOUNCE_RECONEXAO_MS = 2000;
  const syncRef = useRef(sync);
  const autoSyncRef = useRef(autoSync);
  useEffect(() => {
    syncRef.current = sync;
    autoSyncRef.current = autoSync;
  });

  useEffect(() => {
    if (connectivity.state !== 'online') return;
    if (!deps.userId) return;

    const timer = setTimeout(() => {
      // So reenvia se houver falha aberta E vencida. `dueSyncIssues` ja ignora
      // resolvidas e erros estruturais, que nao tem nextAttemptAt.
      if (dueSyncIssues(loadSyncIssueLedger(), new Date().toISOString()).length === 0) return;
      void syncRef.current().catch(() => {
        // O erro ja foi registrado no ledger dentro do `run`; aqui so evitamos
        // uma promise rejeitada sem tratamento.
      });
    }, DEBOUNCE_RECONEXAO_MS);

    return () => clearTimeout(timer);
  }, [connectivity.state, connectivity.onlineAt, deps.userId]);

  // Alteracao local pendente sobe sozinha. A contagem so muda quando algo novo fica
  // pendente ou quando o sync termina, entao uma falha que mantem os mesmos itens
  // pendentes nao vira laco: ela espera o ciclo periodico ou uma nova alteracao.
  useEffect(() => {
    if (connectivity.state !== 'online') return;
    if (!deps.userId) return;
    if (!deps.pendingChanges || deps.pendingChanges <= 0) return;

    const timer = setTimeout(() => {
      void autoSyncRef.current().catch(() => {});
    }, AUTO_SYNC_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [connectivity.state, deps.userId, deps.pendingChanges]);

  useEffect(() => {
    if (connectivity.state !== 'online') return;
    if (!deps.userId) return;

    const tick = () => {
      void autoSyncRef.current().catch(() => {});
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') tick();
    };

    const interval = setInterval(tick, AUTO_SYNC_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [connectivity.state, deps.userId]);

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
    resolveConflictKeepingMine: (_sessionId: string) => undefined,
    resolveConflictKeepingTheirs: (_sessionId: string) => undefined,
    connectivity: connectivity.state,
  };
}
