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
import { detectSessionConflicts } from '../logic/syncConflicts';
import type { SessionControlRow } from '@infra/supabase/sessionOwnershipCloudService';
import {
  markConflictedEvents,
  resolveConflictKeepingMine,
  resolveConflictKeepingTheirs,
} from '../application/sessionConflictResolution';

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
  championships?: Championship[];
  setChampionships?: (value: Championship[]) => void;
  championshipTeams?: ChampionshipTeam[];
  setChampionshipTeams?: (value: ChampionshipTeam[]) => void;
  championshipRounds?: ChampionshipRound[];
  setChampionshipRounds?: (value: ChampionshipRound[]) => void;
  /** Optional sink for user-facing feedback (e.g. toasts). */
  onToast?: (message: string, variant: 'success' | 'error') => void;
}

export type CloudSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

const LAST_SYNCED_AT_KEY = 'vpg_last_synced_at';

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

    // Deteccao de conflito: e o momento em que se conhece o estado de controle
    // da nuvem. Os eventos locais pendentes cuja sessao esta controlada por
    // outra pessoa sao carimbados para o upload segurar ate alguem decidir.
    // A chave e o id LOCAL da sessao, nao o cloudId.
    //
    // `mapDbToSession` devolve `id: db.local_id || db.id` e `cloudId: db.id`, e
    // `PointEvent.sessionId` referencia o id LOCAL. Indexar por cloudId fazia o
    // lookup falhar em toda sessao criada no app — que sao todas, porque toda
    // sessao criada aqui grava `local_id`. O conflito nunca era detectado, e o
    // teste unitario de `detectSessionConflicts` passava porque usa chaves
    // consistentes dos dois lados.
    const cloudSessionControl: Record<string, SessionControlRow> = {};
    for (const session of normalized.sessions) {
      cloudSessionControl[session.id] = {
        controlled_by_user_id: session.controlledByUserId ?? null,
        control_claimed_at: session.controlClaimedAt ?? null,
        control_device_id: session.controlDeviceId ?? null,
      };
    }

    // Conta so o que JA ESTA na nuvem, que e o placar da outra pessoa. Contar o
    // payload inteiro somaria os meus eventos junto e a tela de conflito mostraria
    // o total onde deveria mostrar o dela. `cloudId` presente e o que distingue:
    // evento baixado tem, evento meu ainda nao enviado nao tem.
    const cloudEventCounts: Record<string, number> = {};
    for (const ev of normalized.pointEvents) {
      if (!ev.cloudId) continue;
      cloudEventCounts[ev.sessionId] = (cloudEventCounts[ev.sessionId] ?? 0) + 1;
    }

    // Sem nome, a tela cai em "Outra pessoa" — perdendo justamente o que motivou
    // a posse ser por usuario e nao por aparelho: poder dizer com quem falar.
    const holderNames: Record<string, string> = {};
    for (const player of deps.players) {
      if (player.userId) holderNames[player.userId] = player.apelido || player.nome;
    }

    const conflicts = detectSessionConflicts({
      currentUserId: deps.userId,
      localPointEvents: deps.pointEvents,
      cloudSessionControl,
      cloudEventCounts,
      holderNames,
    });

    const resolvedPointEvents =
      conflicts.length > 0
        ? markConflictedEvents(normalized.pointEvents, conflicts)
        : normalized.pointEvents;

    deps.setCommunities(normalized.communities);
    deps.setPlayers(normalized.players);
    deps.setRules(normalized.rules);
    deps.setTemplates(normalized.templates);
    deps.setSessions(normalized.sessions);
    deps.setTeams(normalized.teams);
    deps.setGames(normalized.games);
    deps.setPointEvents(resolvedPointEvents);
    deps.setGameReports(normalized.gameReports);
    deps.setSessionReports(normalized.sessionReports);
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
    options: { writes: boolean } = { writes: true },
  ) => {
    if (!deps.userId) throw new Error('Usuário não autenticado.');
    // Enquanto o cache local for de outra conta, qualquer operacao que ESCREVE
    // enviaria os dados da conta anterior para esta. So o download passa — e e
    // ele que limpa o local e desfaz a divergencia.
    if (options.writes && !validateCacheOwner(deps.userId, getLocalCacheOwnerId())) {
      deps.onToast?.(
        'O acervo local ainda é de outra conta. Baixe da nuvem antes de enviar.',
        'error',
      );
      return;
    }
    if (isInflight(deps.userId)) {
      deps.onToast?.('Uma sincronização já está em andamento.', 'error');
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
      deps.onToast?.(`${label} falhou: ${message}`, 'error');
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
    run('Download da nuvem', () => downloadCloudDataQuery({ userId: deps.userId ?? undefined }), {
      writes: false,
    });

  const sync = () =>
    run('Sincronização', (payload, userId, onIssue) =>
      syncCloudDataCommand({ payload, userId, onIssue }),
    );

  // O evento `online` do browser chega ANTES da rede estar utilizavel de verdade.
  // Sem esta espera, a primeira tentativa quase sempre falha de novo.
  const DEBOUNCE_RECONEXAO_MS = 2000;
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
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

  /**
   * Resolve um conflito de placar mantendo o placar local: os eventos da sessao
   * seguem pendentes e poderao subir no proximo upload.
   */
  const resolveConflictKeepingMineAction = (sessionId: string) => {
    const now = new Date().toISOString();
    const next = resolveConflictKeepingMine({
      pointEvents: deps.pointEvents,
      sessionId,
      now,
    });
    deps.setPointEvents(next);
  };

  /**
   * Resolve um conflito de placar assumindo a versao da outra pessoa: os eventos
   * locais da sessao viram soft-delete e nunca mais sobem.
   */
  const resolveConflictKeepingTheirsAction = (sessionId: string) => {
    const now = new Date().toISOString();
    const next = resolveConflictKeepingTheirs({
      pointEvents: deps.pointEvents,
      sessionId,
      now,
    });
    deps.setPointEvents(next);
  };

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
    resolveConflictKeepingMine: resolveConflictKeepingMineAction,
    resolveConflictKeepingTheirs: resolveConflictKeepingTheirsAction,
    connectivity: connectivity.state,
  };
}
