import { Community, FreePlayConfig, Game, Session, TournamentConfig } from '../types';
import { generateUUID } from './uuid';
import { STORAGE_KEYS, loadFromStorage, saveToStorage } from '../storage/localStorageRepository';

const DEFAULT_TOURNAMENT_CONFIG: TournamentConfig = {
  type: 'tournament',
  format: 'round_robin',
  teamCount: 3,
  useGroupStage: false,
  roundTrip: false,
  maxPoints: 15,
  tieBreakMethod: 'direct_3',
  victoryRule: 'direct_3',
  hasFinal: false,
  hasThirdPlaceMatch: false,
  classificationPoints: { win: 3, loss: 0, walkoverWin: 3, walkoverLoss: 0 },
  standingsRules: [
    'classificationPoints',
    'wins',
    'pointDifference',
    'pointsFor',
    'headToHead',
    'pointsAgainst',
  ],
  rotationType: '6x0',
};

const DEFAULT_FREE_PLAY_CONFIG: FreePlayConfig = {
  type: 'free_play',
  teamCount: 3,
  maxPoints: 15,
  tieBreakMethod: 'win_by_2',
  rotationSystem: 'winner_stays',
  initialCourtTeams: ['', ''],
  initialQueue: [],
  queuePolicy: 'fifo',
  rotationType: '6x0',
};

export function normalizeTournamentConfig(config: any): TournamentConfig {
  return {
    ...DEFAULT_TOURNAMENT_CONFIG,
    ...config,
    type: 'tournament',
    format: config?.format || (config?.roundTrip ? 'double_round_robin' : 'round_robin'),
    victoryRule:
      config?.victoryRule || config?.tieBreakMethod || DEFAULT_TOURNAMENT_CONFIG.tieBreakMethod,
    tieBreakMethod:
      config?.tieBreakMethod || config?.victoryRule || DEFAULT_TOURNAMENT_CONFIG.tieBreakMethod,
    classificationPoints: {
      ...DEFAULT_TOURNAMENT_CONFIG.classificationPoints,
      ...(config?.classificationPoints || {}),
    },
    standingsRules: config?.standingsRules?.length
      ? config.standingsRules
      : DEFAULT_TOURNAMENT_CONFIG.standingsRules,
    rotationType: config?.rotationType ?? '6x0', // sessões antigas viram 6x0
  };
}

export function normalizeFreePlayConfig(config: any): FreePlayConfig {
  return {
    ...DEFAULT_FREE_PLAY_CONFIG,
    ...config,
    type: 'free_play',
    initialCourtTeams: config?.initialCourtTeams ?? DEFAULT_FREE_PLAY_CONFIG.initialCourtTeams,
    initialQueue: config?.initialQueue ?? DEFAULT_FREE_PLAY_CONFIG.initialQueue,
    rotationType: config?.rotationType ?? '6x0', // sessões antigas viram 6x0
  };
}

export function normalizeSession(session: any): Session {
  if (!session) return session;
  const isTournament =
    session.type === 'championship' ||
    session.type === 'tournament' ||
    session.config?.type === 'championship' ||
    session.config?.type === 'tournament';

  if (!isTournament) {
    const isFreePlay = session.type === 'free_play' || session.config?.type === 'free_play';
    return {
      ...session,
      communityId: session.communityId ?? null,
      config:
        isFreePlay && session.config ? normalizeFreePlayConfig(session.config) : session.config,
    };
  }

  return {
    ...session,
    communityId: session.communityId ?? null,
    type: 'tournament',
    config: normalizeTournamentConfig(session.config),
  };
}

export function normalizeSessions(sessions: any[]): Session[] {
  return Array.isArray(sessions) ? sessions.map(normalizeSession) : [];
}

export function normalizeGame(game: any): Game {
  if (!game) return game;
  return {
    ...game,
    type: game.type === 'championship' ? 'tournament' : game.type,
  };
}

export function normalizeGames(games: any[]): Game[] {
  return Array.isArray(games) ? games.map(normalizeGame) : [];
}

export function normalizeSessionDraft(draft: any) {
  if (!draft?.session) return draft;
  return {
    ...draft,
    session: normalizeSession(draft.session),
  };
}

export function normalizeCommunity(community: any): Community {
  const now = new Date().toISOString();
  return {
    ...community,
    id: community?.id || `community-${Date.now()}`,
    name: community?.name || 'Comunidade',
    description: community?.description || '',
    defaultLocation: community?.defaultLocation || '',
    defaultDay: community?.defaultDay || '',
    defaultStartTime: community?.defaultStartTime || '',
    defaultEndTime: community?.defaultEndTime || '',
    defaultFormat: community?.defaultFormat || 'free_play',
    color: community?.color || 'primary',
    icon: community?.icon || 'volleyball',
    archived: Boolean(community?.archived),
    createdAt: community?.createdAt || now,
    updatedAt: community?.updatedAt || now,
  };
}

export function normalizeCommunities(communities: any[]): Community[] {
  return Array.isArray(communities) ? communities.map(normalizeCommunity) : [];
}

export function sanitizeImportedBackup(val: any): any {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) {
    return val.map(sanitizeImportedBackup);
  }
  if (typeof val === 'object') {
    const cleaned = { ...val };
    if ('cloudId' in cleaned) {
      delete cleaned.cloudId;
    }
    if ('syncStatus' in cleaned) {
      cleaned.syncStatus = 'pending';
    }
    if ('lastSyncedAt' in cleaned) {
      delete cleaned.lastSyncedAt;
    }
    for (const key in cleaned) {
      cleaned[key] = sanitizeImportedBackup(cleaned[key]);
    }
    return cleaned;
  }
  return val;
}

export function migrateLocalDbToUuids() {
  const isMigrated = localStorage.getItem('vpg_uuid_migration_completed') === 'true';
  if (isMigrated) return;

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const idMap: Record<string, string> = {};

  function register(oldId: string | undefined, cloudId: string | undefined) {
    if (!oldId) return;
    if (idMap[oldId]) return;
    if (cloudId && UUID_REGEX.test(cloudId)) {
      idMap[oldId] = cloudId;
    } else if (UUID_REGEX.test(oldId)) {
      idMap[oldId] = oldId;
    } else {
      idMap[oldId] = generateUUID();
    }
  }

  // Load arrays
  const players = loadFromStorage<any[]>(STORAGE_KEYS.players, []);
  const communities = loadFromStorage<any[]>(STORAGE_KEYS.communities, []);
  const sessions = loadFromStorage<any[]>(STORAGE_KEYS.sessions, []);
  const activeSession = loadFromStorage<any | null>(STORAGE_KEYS.activeSession, null);
  const sessionDraft = loadFromStorage<any | null>(STORAGE_KEYS.sessionDraft, null);
  const teams = loadFromStorage<any[]>(STORAGE_KEYS.teams, []);
  const games = loadFromStorage<any[]>(STORAGE_KEYS.games, []);
  const points = loadFromStorage<any[]>(STORAGE_KEYS.points, []);
  const gameReports = loadFromStorage<any[]>(STORAGE_KEYS.gameReports, []);
  const sessionReports = loadFromStorage<any[]>(STORAGE_KEYS.sessionReports, []);
  const communityPresences = loadFromStorage<any[]>(STORAGE_KEYS.communityPresence, []);
  const whatsAppTemplates = loadFromStorage<any[]>(STORAGE_KEYS.whatsAppListTemplates, []);
  const whatsAppDrafts = loadFromStorage<any[]>(STORAGE_KEYS.whatsAppListDrafts, []);
  const playerLinkProposals = loadFromStorage<any[]>(STORAGE_KEYS.playerLinkProposals, []);
  const lastSelectedPlayerIds = loadFromStorage<string[]>(STORAGE_KEYS.lastSelectedPlayerIds, []);
  const bestDivisions = loadFromStorage<any[]>(STORAGE_KEYS.bestDivisions, []);
  const communityRules = loadFromStorage<any[]>(STORAGE_KEYS.communityRules, []);
  const lastSessionConfig = loadFromStorage<any | null>(STORAGE_KEYS.lastSessionConfig, null);

  // 1. Populate mapping dictionary
  players.forEach(p => register(p.id, p.cloudId));
  communities.forEach(c => register(c.id, c.cloudId));
  sessions.forEach(s => register(s.id, s.cloudId));
  if (activeSession) register(activeSession.id, activeSession.cloudId);
  if (sessionDraft?.session) register(sessionDraft.session.id, sessionDraft.session.cloudId);
  teams.forEach(t => register(t.id, t.cloudId));
  games.forEach(g => register(g.id, g.cloudId));
  points.forEach(pt => register(pt.id, pt.cloudId));
  gameReports.forEach(r => register(r.id, r.cloudId));
  sessionReports.forEach(sr => register(sr.id, sr.cloudId));
  whatsAppTemplates.forEach(t => register(t.id, undefined));
  whatsAppDrafts.forEach(d => register(d.id, undefined));
  playerLinkProposals.forEach(p => register(p.id, undefined));

  // Helper map functions
  function getMapped(oldId: string | undefined | null): string {
    if (!oldId) return '';
    return idMap[oldId] || oldId;
  }
  function getMappedOrNull(oldId: string | undefined | null): string | null {
    if (!oldId) return null;
    return idMap[oldId] || oldId;
  }

  // 2. Perform the replacements
  
  // Players
  const migratedPlayers = players.map(p => ({
    ...p,
    id: getMapped(p.id),
    communityIds: Array.isArray(p.communityIds) ? p.communityIds.map(getMapped) : p.communityIds,
  }));

  // Communities
  const migratedCommunities = communities.map(c => ({
    ...c,
    id: getMapped(c.id),
  }));

  // Helper to map session config
  function mapSessionConfig(config: any) {
    if (!config) return config;
    const mappedConfig = { ...config };
    if (mappedConfig.groups && Array.isArray(mappedConfig.groups)) {
      mappedConfig.groups = mappedConfig.groups.map((group: any) => ({
        ...group,
        id: getMapped(group.id),
        teamIds: Array.isArray(group.teamIds) ? group.teamIds.map(getMapped) : group.teamIds,
      }));
    }
    if (mappedConfig.playerPositions && typeof mappedConfig.playerPositions === 'object') {
      const mappedPositions: Record<string, string> = {};
      for (const [pId, pos] of Object.entries(mappedConfig.playerPositions)) {
        mappedPositions[getMapped(pId)] = pos as string;
      }
      mappedConfig.playerPositions = mappedPositions;
    }
    if (mappedConfig.initialCourtTeams && Array.isArray(mappedConfig.initialCourtTeams)) {
      mappedConfig.initialCourtTeams = mappedConfig.initialCourtTeams.map(getMapped);
    }
    if (mappedConfig.initialQueue && Array.isArray(mappedConfig.initialQueue)) {
      mappedConfig.initialQueue = mappedConfig.initialQueue.map(getMapped);
    }
    if (mappedConfig.balanceConstraints) {
      const bc = { ...mappedConfig.balanceConstraints };
      if (bc.lockedPlayerIdxs && typeof bc.lockedPlayerIdxs === 'object') {
        const mappedLocked: Record<string, number> = {};
        for (const [pId, idx] of Object.entries(bc.lockedPlayerIdxs)) {
          mappedLocked[getMapped(pId)] = idx as number;
        }
        bc.lockedPlayerIdxs = mappedLocked;
      }
      if (bc.pairsTogether && Array.isArray(bc.pairsTogether)) {
        bc.pairsTogether = bc.pairsTogether.map((pair: any) => 
          Array.isArray(pair) ? pair.map(getMapped) : pair
        );
      }
      if (bc.pairsSeparated && Array.isArray(bc.pairsSeparated)) {
        bc.pairsSeparated = bc.pairsSeparated.map((pair: any) => 
          Array.isArray(pair) ? pair.map(getMapped) : pair
        );
      }
      mappedConfig.balanceConstraints = bc;
    }
    return mappedConfig;
  }

  function mapSession(s: any) {
    if (!s) return s;
    return {
      ...s,
      id: getMapped(s.id),
      communityId: getMappedOrNull(s.communityId),
      selectedPlayerIds: Array.isArray(s.selectedPlayerIds) ? s.selectedPlayerIds.map(getMapped) : s.selectedPlayerIds,
      teamIds: Array.isArray(s.teamIds) ? s.teamIds.map(getMapped) : s.teamIds,
      config: mapSessionConfig(s.config),
    };
  }

  // Sessions & activeSession & sessionDraft
  const migratedSessions = sessions.map(mapSession);
  const migratedActiveSession = mapSession(activeSession);

  function mapTeam(t: any) {
    if (!t) return t;
    return {
      ...t,
      id: getMapped(t.id),
      sessionId: getMapped(t.sessionId),
      playerIds: Array.isArray(t.playerIds) ? t.playerIds.map(getMapped) : t.playerIds,
    };
  }

  function mapDivision(div: any) {
    if (!div) return div;
    return {
      ...div,
      teams: Array.isArray(div.teams) ? div.teams.map(mapTeam) : div.teams,
    };
  }

  const migratedTeams = teams.map(mapTeam);
  const migratedBestDivisions = bestDivisions.map(mapDivision);

  let migratedSessionDraft = null;
  if (sessionDraft) {
    migratedSessionDraft = {
      ...sessionDraft,
      session: mapSession(sessionDraft.session),
      bestDivisions: Array.isArray(sessionDraft.bestDivisions) ? sessionDraft.bestDivisions.map(mapDivision) : sessionDraft.bestDivisions,
    };
  }

  // Games
  const migratedGames = games.map(g => {
    const meta = g.metadata ? { ...g.metadata } : g.metadata;
    if (meta) {
      if (meta.originalTeamAId) meta.originalTeamAId = getMappedOrNull(meta.originalTeamAId);
      if (meta.originalTeamBId) meta.originalTeamBId = getMappedOrNull(meta.originalTeamBId);
    }
    return {
      ...g,
      id: getMapped(g.id),
      sessionId: getMapped(g.sessionId),
      teamAId: getMapped(g.teamAId),
      teamBId: getMapped(g.teamBId),
      winnerTeamId: getMappedOrNull(g.winnerTeamId),
      loserTeamId: getMappedOrNull(g.loserTeamId),
      pointIds: Array.isArray(g.pointIds) ? g.pointIds.map(getMapped) : g.pointIds,
      metadata: meta,
    };
  });

  // Points
  const migratedPoints = points.map(pt => ({
    ...pt,
    id: getMapped(pt.id),
    sessionId: getMapped(pt.sessionId),
    gameId: getMapped(pt.gameId),
    scoringTeamId: getMapped(pt.scoringTeamId),
    concedingTeamId: getMapped(pt.concedingTeamId),
    playerId: getMappedOrNull(pt.playerId),
    assistPlayerId: getMappedOrNull(pt.assistPlayerId),
    playerTeamId: getMappedOrNull(pt.playerTeamId),
  }));

  // Game Reports
  function mapGameReport(r: any) {
    if (!r) return r;
    return {
      ...r,
      id: getMapped(r.id),
      sessionId: getMapped(r.sessionId),
      gameId: getMapped(r.gameId),
      teamA: r.teamA ? {
        ...r.teamA,
        id: getMapped(r.teamA.id),
        playerIds: Array.isArray(r.teamA.playerIds) ? r.teamA.playerIds.map(getMapped) : r.teamA.playerIds,
      } : r.teamA,
      teamB: r.teamB ? {
        ...r.teamB,
        id: getMapped(r.teamB.id),
        playerIds: Array.isArray(r.teamB.playerIds) ? r.teamB.playerIds.map(getMapped) : r.teamB.playerIds,
      } : r.teamB,
      winnerTeamId: getMapped(r.winnerTeamId),
      loserTeamId: getMapped(r.loserTeamId),
      playerStats: Array.isArray(r.playerStats) ? r.playerStats.map((stat: any) => ({
        ...stat,
        playerId: getMapped(stat.playerId),
        teamId: getMapped(stat.teamId),
      })) : r.playerStats,
    };
  }

  const migratedGameReports = gameReports.map(mapGameReport);

  // Session Reports
  const migratedSessionReports = sessionReports.map(sr => ({
    ...sr,
    id: getMapped(sr.id),
    sessionId: getMapped(sr.sessionId),
    teamStandings: Array.isArray(sr.teamStandings) ? sr.teamStandings.map((standing: any) => ({
      ...standing,
      teamId: getMapped(standing.teamId),
    })) : sr.teamStandings,
    playerRanking: Array.isArray(sr.playerRanking) ? sr.playerRanking.map((rank: any) => ({
      ...rank,
      playerId: getMapped(rank.playerId),
    })) : sr.playerRanking,
    games: Array.isArray(sr.games) ? sr.games.map(mapGameReport) : sr.games,
  }));

  // Community Presence
  const migratedCommunityPresences = communityPresences.map(cp => ({
    ...cp,
    communityId: getMapped(cp.communityId),
    items: Array.isArray(cp.items) ? cp.items.map((item: any) => ({
      ...item,
      playerId: getMappedOrNull(item.playerId),
    })) : cp.items,
  }));

  // WhatsApp list templates & drafts
  const migratedWhatsAppTemplates = whatsAppTemplates.map(t => ({
    ...t,
    id: getMapped(t.id),
    communityId: getMapped(t.communityId),
  }));

  const migratedWhatsAppDrafts = whatsAppDrafts.map(d => ({
    ...d,
    id: getMapped(d.id),
    communityId: getMapped(d.communityId),
    setters: Array.isArray(d.setters) ? d.setters.map(getMapped) : d.setters,
    main: Array.isArray(d.main) ? d.main.map(getMapped) : d.main,
    reserves: Array.isArray(d.reserves) ? d.reserves.map(getMapped) : d.reserves,
  }));

  // Player link proposals
  const migratedPlayerLinkProposals = playerLinkProposals.map(p => ({
    ...p,
    id: getMapped(p.id),
    playerId: getMapped(p.playerId),
  }));

  // Last Selected Player IDs
  const migratedLastSelectedPlayerIds = lastSelectedPlayerIds.map(getMapped);

  // Community rules list
  const migratedCommunityRules = communityRules.map(cr => ({
    ...cr,
    communityId: getMapped(cr.communityId),
  }));

  // Save back to localStorage
  saveToStorage(STORAGE_KEYS.players, migratedPlayers);
  saveToStorage(STORAGE_KEYS.communities, migratedCommunities);
  saveToStorage(STORAGE_KEYS.sessions, migratedSessions);
  if (activeSession) {
    saveToStorage(STORAGE_KEYS.activeSession, migratedActiveSession);
  }
  if (sessionDraft) {
    saveToStorage(STORAGE_KEYS.sessionDraft, migratedSessionDraft);
  }
  saveToStorage(STORAGE_KEYS.teams, migratedTeams);
  saveToStorage(STORAGE_KEYS.games, migratedGames);
  saveToStorage(STORAGE_KEYS.points, migratedPoints);
  saveToStorage(STORAGE_KEYS.gameReports, migratedGameReports);
  saveToStorage(STORAGE_KEYS.sessionReports, migratedSessionReports);
  saveToStorage(STORAGE_KEYS.communityPresence, migratedCommunityPresences);
  saveToStorage(STORAGE_KEYS.whatsAppListTemplates, migratedWhatsAppTemplates);
  saveToStorage(STORAGE_KEYS.whatsAppListDrafts, migratedWhatsAppDrafts);
  saveToStorage(STORAGE_KEYS.playerLinkProposals, migratedPlayerLinkProposals);
  saveToStorage(STORAGE_KEYS.lastSelectedPlayerIds, migratedLastSelectedPlayerIds);
  saveToStorage(STORAGE_KEYS.bestDivisions, migratedBestDivisions);
  saveToStorage(STORAGE_KEYS.communityRules, migratedCommunityRules);
  if (lastSessionConfig) {
    saveToStorage(STORAGE_KEYS.lastSessionConfig, mapSessionConfig(lastSessionConfig));
  }

  localStorage.setItem('vpg_uuid_migration_completed', 'true');
  console.log('UUID Migration successfully completed.');
}
