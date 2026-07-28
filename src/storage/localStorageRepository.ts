export const STORAGE_KEYS = {
  players: 'vpg_players',
  sessions: 'vpg_sessions',
  activeSession: 'vpg_active_session',
  teams: 'vpg_teams',
  games: 'vpg_games',
  points: 'vpg_points',
  gameReports: 'vpg_game_reports',
  sessionReports: 'vpg_session_reports',
  bestDivisions: 'vpg_best_divisions',
  selectedDivisionIndex: 'vpg_selected_division_index',
  sessionDraft: 'vpg_session_draft',
  lastSelectedPlayerIds: 'vpg_last_selected_player_ids',
  lastSessionConfig: 'vpg_last_session_config',
  communities: 'vpg_communities',
  communityPresence: 'vpg_community_presence',
  whatsAppListTemplates: 'vpg_whatsapp_list_templates',
  whatsAppListDrafts: 'vpg_whatsapp_list_drafts',
  communityRules: 'vpg_community_rules',
  championships: 'vpg_championships',
  championshipTeams: 'vpg_championship_teams',
  championshipRounds: 'vpg_championship_rounds',
  syncIssueLedger: 'vpg_sync_issue_ledger',
};

export const LOCAL_CACHE_OWNER_KEY = 'vpg_cache_owner_id';

export const STORAGE_METADATA_KEYS = [
  LOCAL_CACHE_OWNER_KEY,
  'vpg_last_synced_at',
  'vpg_uuid_migration_completed',
  'vpg_players_schema_version',
  'vpg_selected_division_index',
  'vpg_sync_issue_ledger',
];

export function getLocalCacheOwnerId(): string | null {
  try {
    return localStorage.getItem(LOCAL_CACHE_OWNER_KEY);
  } catch (err) {
    console.error(`Error loading ${LOCAL_CACHE_OWNER_KEY} from storage:`, err);
    return null;
  }
}

export function markLocalCacheOwner(userId: string | null | undefined) {
  try {
    if (userId) {
      localStorage.setItem(LOCAL_CACHE_OWNER_KEY, userId);
    } else {
      localStorage.removeItem(LOCAL_CACHE_OWNER_KEY);
    }
  } catch (err) {
    console.error(`Error saving ${LOCAL_CACHE_OWNER_KEY} to storage:`, err);
  }
}

export function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (err) {
    console.error(`Error loading ${key} from storage:`, err);
    return fallback;
  }
}

export function saveToStorage<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Error saving ${key} to storage:`, err);
  }
}

export function removeFromStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch (err) {
    console.error(`Error removing ${key} from storage:`, err);
  }
}

export function resolveCacheKey(userId: string, communityId: string, entityKind: string): string {
  return `vpg_cache_${userId}_${communityId}_${entityKind}`;
}

export function validateCacheOwner(currentUserId: string, cacheOwnerId: string | null): boolean {
  if (!cacheOwnerId) return true;
  return cacheOwnerId === currentUserId;
}
