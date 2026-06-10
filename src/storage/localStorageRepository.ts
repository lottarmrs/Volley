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
};

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
