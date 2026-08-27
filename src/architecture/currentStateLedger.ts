/**
 * XS-W0-02 — Current-state inventory and authority ledger.
 *
 * This describes the CURRENT (legacy) implementation, not the target architecture. It is
 * TRANSITIONAL evidence: every entry records what exists today so C6 can retire it
 * deliberately rather than by guesswork.
 *
 * Exit gate (C6.01 XS-W0-02): no W13 removal may begin for an entity whose current
 * readers/writers are not inventoried. `currentStateLedger.test.ts` enforces that
 * mechanically against the live source, so a new payload entity or storage key cannot be
 * added without an inventory entry.
 *
 * Field meanings follow the C6.01 inventory categories verbatim.
 */

export type LedgerSource =
  | 'LocalSyncPayload'
  | 'OperationalSyncPayload'
  | 'STORAGE_KEYS'
  | 'CloudServiceOnly';

/** Disposition vocabulary from N2.22 section N4.22.35. */
export type MigrationClass =
  | 'MOVE_TO_INDEXEDDB'
  | 'REMAIN_LOCALSTORAGE'
  | 'RETIRE'
  | 'MIGRATE_TO_TARGET_MODEL'
  | 'IMPORT_AS_HISTORY';

export interface CurrentStateLedgerEntry {
  /** Canonical inventory name used across C6 discussion. */
  readonly entity: string;
  readonly sources: readonly LedgerSource[];
  /** Key inside LocalSyncPayload / OperationalSyncPayload, when the entity is synced. */
  readonly payloadKey?: string;
  /** Key inside STORAGE_KEYS, when the entity persists locally. */
  readonly storageKey?: string;
  readonly cloudTableOrRpc: readonly string[];
  readonly legacyWriters: readonly string[];
  readonly legacyReaders: readonly string[];
  readonly currentAuthority: string;
  readonly currentMerge: string;
  readonly lifecycleFields: readonly string[];
  readonly foreignKeyDelete: string;
  /** Owning N2 document in the target architecture. */
  readonly targetOwner: string;
  /** C6 wave that moves or retires this entity. */
  readonly targetWave: string;
  readonly migrationClass: MigrationClass;
  readonly remainingSurfaces: readonly string[];
  readonly notes?: string;
}

const GENERIC_SYNC_LIFECYCLE = ['createdAt', 'updatedAt', 'cloudId', 'syncStatus', 'deletedAt'];
const GENERIC_LWW =
  'Generic last-write-wins in mergeEntityLists (syncService): newer updatedAt overwrites, tombstone via deletedAt.';
const SYNC_WRITER = 'infra/supabase/syncService.ts';

export const currentStateLedger: readonly CurrentStateLedgerEntry[] = [
  // ── LocalSyncPayload ──────────────────────────────────────────────────────
  {
    entity: 'communities',
    sources: ['LocalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'communities',
    storageKey: 'communities',
    cloudTableOrRpc: [
      'communities',
      'rpc:set_community_visibility',
      'rpc:search_public_communities',
    ],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/communityCloudService.ts',
      'hooks/useCommunities.ts',
    ],
    legacyReaders: [
      'hooks/useCommunities.ts',
      'application/localCommunityUseCases.ts',
      'logic/migrations.ts',
    ],
    currentAuthority:
      'Split: browser writes localStorage and pushes to cloud; neither side is authoritative.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete: 'Parent of nearly everything: 29 child FKs cascade from communities(id).',
    targetOwner: 'N2.03-communities',
    targetWave: 'W2',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/community/CommunitiesView.tsx', 'app/AppShell.tsx'],
    notes:
      'Community delete cascades to sessions, games, point_events, reports, championships and career_events, which conflicts with GINV-ID-005 and ADR-SEC-011 (account/privacy deletion is not sports-history cascade). Flagged for W2/W14.',
  },
  {
    entity: 'players',
    sources: ['LocalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'players',
    storageKey: 'players',
    cloudTableOrRpc: ['players', 'rpc:find_player_by_username'],
    legacyWriters: [SYNC_WRITER, 'infra/supabase/playerCloudService.ts', 'hooks/usePlayers.ts'],
    legacyReaders: [
      'hooks/usePlayers.ts',
      'application/localPlayerUseCases.ts',
      'logic/migrations.ts',
    ],
    currentAuthority: 'Split local/cloud; local edits win on newer updatedAt.',
    currentMerge: `${GENERIC_LWW} Additional semantic-key fallback matching by normalized name.`,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete:
      'players(id) cascades to evaluations, self_evaluations, avatar proposals, claim codes, career_events; restrict from identity claims/aliases.',
    targetOwner: 'N2.02-identity-players',
    targetWave: 'W2',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: [
      'components/player/PlayerEditView.tsx',
      'components/player/PlayerComponents.tsx',
    ],
    notes:
      'Player is the sports identity and must stay distinct from User and Participant (GINV-ID-001).',
  },
  {
    entity: 'community rules',
    sources: ['LocalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'rules',
    storageKey: 'communityRules',
    cloudTableOrRpc: ['community_rules'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/communityRulesCloudService.ts',
      'hooks/useCommunityRules.ts',
    ],
    legacyReaders: ['hooks/useCommunityRules.ts', 'logic/migrations.ts'],
    currentAuthority: 'Split local/cloud.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete: 'community_rules -> communities(id) cascade.',
    targetOwner: 'N2.03-communities',
    targetWave: 'W2',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/community/CommunitiesView.tsx'],
    notes: 'Community defaults must never rewrite existing Session history (GINV-COM-003).',
  },
  {
    entity: 'whatsapp list templates',
    sources: ['LocalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'templates',
    storageKey: 'whatsAppListTemplates',
    cloudTableOrRpc: ['whatsapp_list_templates'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/whatsappTemplateCloudService.ts',
      'hooks/useWhatsAppListTemplates.ts',
    ],
    legacyReaders: ['hooks/useWhatsAppListTemplates.ts', 'logic/migrations.ts'],
    currentAuthority: 'Split local/cloud.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete: 'whatsapp_list_templates -> communities(id) cascade.',
    targetOwner: 'N2.10-notifications',
    targetWave: 'W10',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['logic/whatsappList.ts'],
  },
  {
    entity: 'championships',
    sources: ['LocalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'championships',
    storageKey: 'championships',
    cloudTableOrRpc: ['championships'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/championshipCloudService.ts',
      'hooks/useChampionships.ts',
    ],
    legacyReaders: ['hooks/useChampionships.ts', 'logic/tournament.ts'],
    currentAuthority: 'Split local/cloud.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete: 'championships -> communities(id) cascade.',
    targetOwner: 'N2.08-competitions',
    targetWave: 'W8',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: [
      'components/championship/ChampionshipDetailView.tsx',
      'components/championship/ChampionshipWizardView.tsx',
    ],
    notes: 'Fixture and Match must stay separate in the target (GINV-MATCH-001, GINV-COMP-001).',
  },
  {
    entity: 'championship teams',
    sources: ['LocalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'championshipTeams',
    storageKey: 'championshipTeams',
    cloudTableOrRpc: ['championship_teams'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/championshipCloudService.ts',
      'hooks/useChampionships.ts',
    ],
    legacyReaders: ['hooks/useChampionships.ts', 'logic/tournament.ts'],
    currentAuthority: 'Split local/cloud.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete: 'championship_teams -> championships(id) cascade.',
    targetOwner: 'N2.08-competitions',
    targetWave: 'W8',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/championship/ChampionshipDetailView.tsx'],
  },
  {
    entity: 'championship rounds',
    sources: ['LocalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'championshipRounds',
    storageKey: 'championshipRounds',
    cloudTableOrRpc: ['championship_rounds'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/championshipCloudService.ts',
      'hooks/useChampionships.ts',
    ],
    legacyReaders: ['hooks/useChampionships.ts', 'logic/tournament.ts'],
    currentAuthority: 'Split local/cloud.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete:
      'championship_rounds -> championships(id) cascade, championship_teams(id) cascade, sessions(id) set null.',
    targetOwner: 'N2.08-competitions',
    targetWave: 'W8',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/championship/ChampionshipDetailView.tsx'],
    notes:
      'ChampionshipRound is the current stand-in for Fixture; it is a named W8 legacy surface in C6.06.',
  },

  // ── OperationalSyncPayload ────────────────────────────────────────────────
  {
    entity: 'sessions',
    sources: ['OperationalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'sessions',
    storageKey: 'sessions',
    cloudTableOrRpc: ['sessions', 'rpc:claim_session_ownership', 'rpc:transfer_session_ownership'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/operationalCloudService.ts',
      'hooks/useSessions.ts',
    ],
    legacyReaders: [
      'hooks/useSessions.ts',
      'application/sessionLifecycleUseCases.ts',
      'logic/migrations.ts',
    ],
    currentAuthority:
      'Split local/cloud; ownership claim/transfer exists as RPC but merge is still generic.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete:
      'sessions -> communities(id) cascade; parent of teams/games/point_events/reports (cascade).',
    targetOwner: 'N2.04-sessions',
    targetWave: 'W3',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: [
      'components/session/SessionWizard.tsx',
      'components/live/SessionActiveView.tsx',
      'hooks/useLiveSession.ts',
    ],
    notes:
      'Carries legacy selectedPlayerIds/teamIds ID arrays (AF-TRANS-002, GINV-DATA-003) and Session-level control assumptions that W7 replaces with per-Match control.',
  },
  {
    entity: 'teams',
    sources: ['OperationalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'teams',
    storageKey: 'teams',
    cloudTableOrRpc: ['teams'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/operationalCloudService.ts',
      'hooks/useSessions.ts',
    ],
    legacyReaders: ['hooks/useSessions.ts', 'logic/migrations.ts'],
    currentAuthority: 'Split local/cloud.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete: 'teams -> communities(id) cascade, sessions(id) cascade.',
    targetOwner: 'N2.06-team-formation',
    targetWave: 'W6',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/session/SessionWizard.tsx', 'logic/balancing.ts'],
    notes:
      'Target replaces ad hoc Team lists with TeamDraw bound to a RosterRevision (GINV-BAL-002).',
  },
  {
    entity: 'games',
    sources: ['OperationalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'games',
    storageKey: 'games',
    cloudTableOrRpc: ['games'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/operationalCloudService.ts',
      'hooks/useLiveSession.ts',
    ],
    legacyReaders: ['hooks/useSessions.ts', 'hooks/useLiveSession.ts', 'logic/migrations.ts'],
    currentAuthority: 'Split local/cloud with mutable score on the row.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete: 'games -> communities(id) cascade, sessions(id) cascade.',
    targetOwner: 'N2.07-live-match',
    targetWave: 'W7',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: [
      'components/live/SessionActiveView.tsx',
      'components/live/TeamScoreCard.tsx',
    ],
    notes:
      'Mutable Game score plus LWW is the exact pattern GINV-MATCH-002/003 forbid; target computes score server-side from a per-Match sequence.',
  },
  {
    entity: 'point events',
    sources: ['OperationalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'pointEvents',
    storageKey: 'points',
    cloudTableOrRpc: ['point_events'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/operationalCloudService.ts',
      'hooks/useLiveSession.ts',
    ],
    legacyReaders: ['hooks/useLiveSession.ts', 'logic/reports.ts', 'logic/migrations.ts'],
    currentAuthority: 'Split local/cloud; client-generated ordering.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete: 'point_events -> communities(id) cascade, sessions(id) cascade.',
    targetOwner: 'N2.07-live-match',
    targetWave: 'W7',
    migrationClass: 'IMPORT_AS_HISTORY',
    remainingSurfaces: ['components/live/SessionActiveView.tsx'],
    notes:
      'Closest current analogue of MatchEvent. N2.22 requires a dedicated reconciliation/import path for unsent PointEvents rather than generic merge.',
  },
  {
    entity: 'game reports',
    sources: ['OperationalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'gameReports',
    storageKey: 'gameReports',
    cloudTableOrRpc: ['game_reports'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/operationalCloudService.ts',
      'hooks/useSessions.ts',
    ],
    legacyReaders: ['logic/reports.ts', 'logic/migrations.ts'],
    currentAuthority: 'Split local/cloud.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete: 'game_reports -> communities(id) cascade, sessions(id) cascade.',
    targetOwner: 'N2.09-history-statistics',
    targetWave: 'W9',
    migrationClass: 'IMPORT_AS_HISTORY',
    remainingSurfaces: ['logic/reports.ts'],
    notes:
      'Reports are separate from factual statistics and from subjective evaluations (GINV-STAT-001).',
  },
  {
    entity: 'session reports',
    sources: ['OperationalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'sessionReports',
    storageKey: 'sessionReports',
    cloudTableOrRpc: ['session_reports'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/operationalCloudService.ts',
      'hooks/useSessions.ts',
    ],
    legacyReaders: ['logic/reports.ts', 'logic/migrations.ts'],
    currentAuthority: 'Split local/cloud.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete: 'session_reports -> communities(id) cascade, sessions(id) cascade.',
    targetOwner: 'N2.09-history-statistics',
    targetWave: 'W9',
    migrationClass: 'IMPORT_AS_HISTORY',
    remainingSurfaces: ['logic/reports.ts'],
  },
  {
    entity: 'community presence',
    sources: ['OperationalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'presenceRecords',
    storageKey: 'communityPresence',
    cloudTableOrRpc: ['community_presence'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/operationalCloudService.ts',
      'hooks/useCommunityPresence.ts',
    ],
    legacyReaders: [
      'hooks/useCommunityPresence.ts',
      'logic/communityPresence.ts',
      'logic/migrations.ts',
    ],
    currentAuthority: 'Split local/cloud.',
    currentMerge:
      'Dedicated mergePresenceRecords: unions item lists by player/guest key, then picks the newer updatedAt for the envelope.',
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete: 'community_presence -> communities(id) cascade.',
    targetOwner: 'N2.05-registration',
    targetWave: 'W4',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/community/CommunitiesView.tsx'],
    notes:
      'Current stand-in for Registration. Target Registration is server-authoritative with FIFO by monotonic server sequence (GINV-REG-002/003), so this cannot remain client-merged.',
  },
  {
    entity: 'whatsapp list drafts',
    sources: ['OperationalSyncPayload', 'STORAGE_KEYS'],
    payloadKey: 'drafts',
    storageKey: 'whatsAppListDrafts',
    cloudTableOrRpc: ['whatsapp_list_drafts'],
    legacyWriters: [
      SYNC_WRITER,
      'infra/supabase/operationalCloudService.ts',
      'hooks/useWhatsAppListTemplates.ts',
    ],
    legacyReaders: ['hooks/useWhatsAppListTemplates.ts', 'logic/whatsappList.ts'],
    currentAuthority: 'Split local/cloud.',
    currentMerge: GENERIC_LWW,
    lifecycleFields: GENERIC_SYNC_LIFECYCLE,
    foreignKeyDelete: 'whatsapp_list_drafts -> communities(id) cascade.',
    targetOwner: 'N2.10-notifications',
    targetWave: 'W12',
    migrationClass: 'MOVE_TO_INDEXEDDB',
    remainingSurfaces: ['logic/whatsappList.ts'],
    notes: 'N2.22 classifies structured drafts as IndexedDB candidates.',
  },

  // ── Cloud services outside the sync payloads ──────────────────────────────
  {
    entity: 'community players',
    sources: ['CloudServiceOnly'],
    cloudTableOrRpc: ['community_players'],
    legacyWriters: [SYNC_WRITER, 'infra/supabase/communityPlayerCloudService.ts'],
    legacyReaders: ['application/communityPlayerSearchUseCases.ts', 'hooks/useCommunities.ts'],
    currentAuthority: 'Cloud table, reconciled from the merged local payload during syncNow.',
    currentMerge:
      'Orphan relations deleted during upload only when the payload represents merged state.',
    lifecycleFields: ['created_at', 'updated_at'],
    foreignKeyDelete: 'community_players -> communities(id) cascade, players(id) cascade.',
    targetOwner: 'N2.03-communities',
    targetWave: 'W2',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/community/AthleteUsernameSearch.tsx'],
    notes:
      'CommunityPlayer is the sports relation and must stay independent from CommunityMembership governance (GINV-ID-003). A deprecated role column exists from migration 20260726190000.',
  },
  {
    entity: 'community membership and join state',
    sources: ['CloudServiceOnly'],
    cloudTableOrRpc: [
      'community_members',
      'rpc:set_community_member_role',
      'rpc:remove_community_member',
      'rpc:approve_join_request',
      'rpc:reject_join_request',
      'rpc:request_to_join_community',
      'rpc:generate_join_code',
      'rpc:leave_community',
      'rpc:add_community_member_by_identifier',
    ],
    legacyWriters: ['infra/supabase/membershipCloudService.ts'],
    legacyReaders: [
      'hooks/useCommunityMembers.ts',
      'application/communityMembersViewModel.ts',
      'domain/communityPermissions.ts',
    ],
    currentAuthority:
      'Server-authoritative already: mutations go through SECURITY DEFINER RPCs, never direct table writes.',
    currentMerge: 'None. Not part of the generic sync payload.',
    lifecycleFields: ['status', 'role', 'created_at', 'updated_at'],
    foreignKeyDelete:
      'community_members -> communities(id) cascade, profiles(id) cascade and set null.',
    targetOwner: 'N2.03-communities',
    targetWave: 'W2',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/community/CommunityMembersPanel.tsx'],
    notes:
      'Closest current surface to the target model: already RPC-mediated. JoinRequest is not Membership (GINV-COM-002) and Organizer is operational, not governance (GINV-CAP-001).',
  },
  {
    entity: 'player evaluations',
    sources: ['CloudServiceOnly'],
    cloudTableOrRpc: ['player_evaluations'],
    legacyWriters: [SYNC_WRITER, 'infra/supabase/playerEvaluationCloudService.ts'],
    legacyReaders: ['logic/playerEvaluations.ts', 'logic/rating.ts'],
    currentAuthority: 'Cloud table with RLS restricted to owner/admin roles.',
    currentMerge:
      'Latest evaluation per evaluator selected by updatedAt in logic/playerEvaluations.ts.',
    lifecycleFields: ['created_at', 'updated_at'],
    foreignKeyDelete: 'player_evaluations -> players(id) cascade, communities(id) cascade.',
    targetOwner: 'N2.02-player-skill-profile-ownership',
    targetWave: 'W5',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/player/PlayerEditView.tsx'],
    notes:
      'Feeds the Community then Global skill profile. Aggregation must stay per attribute and missing must never read as zero (GINV-RATING-001/002).',
  },
  {
    entity: 'self evaluations',
    sources: ['CloudServiceOnly'],
    cloudTableOrRpc: ['self_evaluations'],
    legacyWriters: [SYNC_WRITER, 'infra/supabase/selfEvaluationCloudService.ts'],
    legacyReaders: ['logic/playerEvaluations.ts'],
    currentAuthority: 'Cloud table.',
    currentMerge: 'None beyond per-player replacement.',
    lifecycleFields: ['created_at', 'updated_at'],
    foreignKeyDelete: 'self_evaluations -> players(id) cascade.',
    targetOwner: 'N2.02-player-skill-profile-ownership',
    targetWave: 'W5',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/player/PlayerEditView.tsx'],
  },
  {
    entity: 'career events and totals',
    sources: ['CloudServiceOnly'],
    cloudTableOrRpc: ['career_events', 'career_totals'],
    legacyWriters: ['database triggers (20260727110000_career_events_generation.sql)'],
    legacyReaders: ['infra/supabase/careerCloudService.ts', 'hooks/usePlayerCareer.ts'],
    currentAuthority: 'Server-derived by trigger from session/game facts.',
    currentMerge: 'None. Recalculated on claim.',
    lifecycleFields: ['created_at'],
    foreignKeyDelete:
      'career_events -> players(id) cascade, communities(id) cascade, sessions(id) cascade.',
    targetOwner: 'N2.09-history-statistics',
    targetWave: 'W9',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/player/FutCardModal.tsx'],
    notes:
      'Already a derived projection, but must declare an explicit rebuild contract to qualify as rebuildable (GINV-REL-003). Legacy rating/overall fields must not be imported into factual statistics.',
  },
  {
    entity: 'player avatars and proposals',
    sources: ['CloudServiceOnly'],
    cloudTableOrRpc: [
      'player_avatar_proposals',
      'rpc:propose_player_avatar',
      'rpc:approve_player_avatar',
      'rpc:reject_player_avatar',
    ],
    legacyWriters: ['infra/supabase/avatarStorageService.ts'],
    legacyReaders: ['components/player/PlayerEditView.tsx'],
    currentAuthority: 'Server-authoritative through approval RPCs plus Storage bucket policy.',
    currentMerge: 'None.',
    lifecycleFields: ['status', 'created_at'],
    foreignKeyDelete: 'player_avatar_proposals -> players(id) cascade.',
    targetOwner: 'N2.11-media',
    targetWave: 'W11',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/player/FutCard.tsx'],
    notes:
      'Target requires MediaAsset identity rather than a URL, and raw upload stays private/untrusted until server processing reaches READY (GINV-MEDIA-001/002).',
  },

  // ── STORAGE_KEYS with no cloud counterpart ────────────────────────────────
  {
    entity: 'active session pointer',
    sources: ['STORAGE_KEYS'],
    storageKey: 'activeSession',
    cloudTableOrRpc: [],
    legacyWriters: ['hooks/useSessions.ts'],
    legacyReaders: ['hooks/useSessions.ts', 'logic/migrations.ts'],
    currentAuthority: 'Local device only.',
    currentMerge: 'None.',
    lifecycleFields: [],
    foreignKeyDelete: 'n/a',
    targetOwner: 'N2.04-sessions',
    targetWave: 'W12',
    migrationClass: 'MOVE_TO_INDEXEDDB',
    remainingSurfaces: ['app/AppShell.tsx'],
  },
  {
    entity: 'session draft',
    sources: ['STORAGE_KEYS'],
    storageKey: 'sessionDraft',
    cloudTableOrRpc: [],
    legacyWriters: ['logic/sessionDraft.ts'],
    legacyReaders: ['logic/sessionDraft.ts', 'logic/migrations.ts'],
    currentAuthority: 'Local device only.',
    currentMerge: 'None.',
    lifecycleFields: [],
    foreignKeyDelete: 'n/a',
    targetOwner: 'N2.04-sessions',
    targetWave: 'W12',
    migrationClass: 'MOVE_TO_INDEXEDDB',
    remainingSurfaces: ['hooks/useSessionWizard.ts'],
    notes: 'N2.22 classifies structured drafts as IndexedDB candidates.',
  },
  {
    entity: 'best divisions cache',
    sources: ['STORAGE_KEYS'],
    storageKey: 'bestDivisions',
    cloudTableOrRpc: [],
    legacyWriters: [],
    legacyReaders: ['logic/migrations.ts'],
    currentAuthority: 'Local device only; no live writer remains.',
    currentMerge: 'None.',
    lifecycleFields: [],
    foreignKeyDelete: 'n/a',
    targetOwner: 'N2.06-team-formation',
    targetWave: 'W14',
    migrationClass: 'RETIRE',
    remainingSurfaces: [],
    notes:
      'Read only by the migration importer; no production writer. N2.22 lists legacy best-division mirrors as RETIRE. Removal candidate with zero live readers.',
  },
  {
    entity: 'selected division index',
    sources: ['STORAGE_KEYS'],
    storageKey: 'selectedDivisionIndex',
    cloudTableOrRpc: [],
    legacyWriters: [],
    legacyReaders: [],
    currentAuthority: 'None. Key is declared but unreferenced.',
    currentMerge: 'None.',
    lifecycleFields: [],
    foreignKeyDelete: 'n/a',
    targetOwner: 'N2.06-team-formation',
    targetWave: 'W14',
    migrationClass: 'RETIRE',
    remainingSurfaces: [],
    notes:
      'Dead key: no reader or writer anywhere in src, including the migration importer. Only the clearLocalDomainCache sweep touches it. Strongest W14 removal candidate.',
  },
  {
    entity: 'last selected player ids',
    sources: ['STORAGE_KEYS'],
    storageKey: 'lastSelectedPlayerIds',
    cloudTableOrRpc: [],
    legacyWriters: ['app/AppShell.tsx', 'hooks/useSessionWizard.ts'],
    legacyReaders: ['hooks/useSessionWizard.ts', 'logic/migrations.ts'],
    currentAuthority: 'Local device only.',
    currentMerge: 'None.',
    lifecycleFields: [],
    foreignKeyDelete: 'n/a',
    targetOwner: 'N2.04-sessions',
    targetWave: 'W12',
    migrationClass: 'MOVE_TO_INDEXEDDB',
    remainingSurfaces: ['components/session/SessionWizard.tsx'],
    notes:
      'An ID array used as convenience state; must not become canonical roster authority (GINV-DATA-003).',
  },
  {
    entity: 'last session config',
    sources: ['STORAGE_KEYS'],
    storageKey: 'lastSessionConfig',
    cloudTableOrRpc: [],
    legacyWriters: ['app/AppShell.tsx'],
    legacyReaders: ['logic/migrations.ts'],
    currentAuthority: 'Local device only.',
    currentMerge: 'None.',
    lifecycleFields: [],
    foreignKeyDelete: 'n/a',
    targetOwner: 'N2.04-sessions',
    targetWave: 'W12',
    migrationClass: 'MOVE_TO_INDEXEDDB',
    remainingSurfaces: ['components/session/SessionWizard.tsx'],
  },
  {
    entity: 'championship requests',
    sources: ['STORAGE_KEYS'],
    storageKey: 'championshipRequests',
    cloudTableOrRpc: [],
    legacyWriters: ['hooks/useChampionships.ts'],
    legacyReaders: ['hooks/useChampionships.ts'],
    currentAuthority: 'Local device only; never synced.',
    currentMerge: 'None.',
    lifecycleFields: [],
    foreignKeyDelete: 'n/a',
    targetOwner: 'N2.08-competitions',
    targetWave: 'W8',
    migrationClass: 'MIGRATE_TO_TARGET_MODEL',
    remainingSurfaces: ['components/championship/ChampionshipDetailView.tsx'],
    notes:
      'Governance-adjacent state held only on one device. Governance is online-authoritative in the target (ADR-OFF-004), so this cannot stay local.',
  },
  {
    entity: 'sync issue ledger',
    sources: ['STORAGE_KEYS'],
    storageKey: 'syncIssueLedger',
    cloudTableOrRpc: [],
    legacyWriters: ['logic/syncIssueLedger.ts'],
    legacyReaders: ['logic/syncIssueLedger.ts'],
    currentAuthority: 'Local device only.',
    currentMerge: 'None.',
    lifecycleFields: [],
    foreignKeyDelete: 'n/a',
    targetOwner: 'N2.22-migration-strangler',
    targetWave: 'W13',
    migrationClass: 'RETIRE',
    remainingSurfaces: ['app/AppShell.tsx'],
    notes: 'Diagnostic surface for the generic sync it reports on; retires with syncService.',
  },
  {
    entity: 'active community id',
    sources: ['STORAGE_KEYS'],
    storageKey: 'activeCommunityId',
    cloudTableOrRpc: [],
    legacyWriters: ['app/AppShell.tsx'],
    legacyReaders: ['app/AppShell.tsx'],
    currentAuthority: 'Local device only; UI selection.',
    currentMerge: 'None.',
    lifecycleFields: [],
    foreignKeyDelete: 'n/a',
    targetOwner: 'N2.03-communities',
    targetWave: 'W12',
    migrationClass: 'REMAIN_LOCALSTORAGE',
    remainingSurfaces: ['app/AppShell.tsx'],
    notes:
      'A selection pointer, not authority. GINV-AUTH-003 means it can never be treated as proof of access to that community.',
  },
  {
    entity: 'dismissed hints',
    sources: ['STORAGE_KEYS'],
    storageKey: 'dismissedHints',
    cloudTableOrRpc: [],
    legacyWriters: ['components/live/HighlightFab.tsx'],
    legacyReaders: ['components/live/HighlightFab.tsx'],
    currentAuthority: 'Local device only; UI preference.',
    currentMerge: 'None.',
    lifecycleFields: [],
    foreignKeyDelete: 'n/a',
    targetOwner: 'N2.01-product-experience',
    targetWave: 'W12',
    migrationClass: 'REMAIN_LOCALSTORAGE',
    remainingSurfaces: ['components/live/HighlightFab.tsx'],
    notes: 'N2.22 names dismissed hints explicitly as legitimate small localStorage.',
  },
];
