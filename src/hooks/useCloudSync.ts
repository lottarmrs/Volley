import { useState } from 'react';
import { syncService, LocalSyncPayload } from '../services/supabase/syncService';
import { normalizeGames, normalizeSessions } from '../logic/migrations';
import { loadFromStorage, saveToStorage } from '../storage/localStorageRepository';
import {
  Community,
  CommunityPresence,
  CommunityRules,
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
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    loadFromStorage<string | null>(LAST_SYNCED_AT_KEY, null),
  );

  const buildPayload = (): LocalSyncPayload => ({
    communities: deps.communities,
    players: deps.players,
    rules: deps.rules,
    templates: deps.templates,
    sessions: deps.sessions,
    teams: deps.teams,
    games: deps.games,
    pointEvents: deps.pointEvents,
    gameReports: deps.gameReports,
    sessionReports: deps.sessionReports,
    presenceRecords: deps.presenceRecords,
    drafts: deps.drafts,
  });

  const applyResult = (result: LocalSyncPayload) => {
    deps.setCommunities(result.communities);
    deps.setPlayers(result.players);
    deps.setRules(result.rules);
    deps.setTemplates(result.templates);
    deps.setSessions(normalizeSessions(result.sessions));
    deps.setTeams(result.teams);
    deps.setGames(normalizeGames(result.games));
    deps.setPointEvents(result.pointEvents);
    deps.setGameReports(result.gameReports);
    deps.setSessionReports(result.sessionReports);
    deps.setPresenceRecords(result.presenceRecords);
    deps.setDrafts(result.drafts);

    const nowStr = new Date().toISOString();
    setLastSyncedAt(nowStr);
    saveToStorage(LAST_SYNCED_AT_KEY, nowStr);
  };

  const run = async (
    label: string,
    operation: (payload: LocalSyncPayload, userId: string) => Promise<LocalSyncPayload>,
  ) => {
    if (!deps.userId) throw new Error('Usuário não autenticado.');
    setSyncLoading(true);
    setStatus('syncing');
    setError(null);
    try {
      const result = await operation(buildPayload(), deps.userId);
      applyResult(result);
      setStatus('success');
      deps.onToast?.(`${label} concluído.`, 'success');
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Falha na sincronização';
      setError(message);
      setStatus('error');
      deps.onToast?.(`${label} falhou: ${message}`, 'error');
      throw e;
    } finally {
      setSyncLoading(false);
    }
  };

  const uploadToCloud = () =>
    run('Envio para a nuvem', (payload, userId) =>
      syncService.uploadLocalDataToCloud(payload, userId),
    );

  const downloadFromCloud = () =>
    run('Download da nuvem', () => syncService.downloadCloudDataToLocal());

  const sync = () =>
    run('Sincronização', (payload, userId) => syncService.syncNow(payload, userId));

  return {
    uploadToCloud,
    downloadFromCloud,
    sync,
    syncLoading,
    lastSyncedAt,
    status,
    error,
  };
}
