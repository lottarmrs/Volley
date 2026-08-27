import type { LegacyExpansionRule } from './legacyExpansionPolicy';

/**
 * XS-W0-01 allowlists.
 *
 * Each entry is a KNOWN legacy site that C6 will retire in a named wave. Baselines were
 * measured against the promoted R11 tree; they are frozen, not discovered at runtime.
 *
 * Adding a path here is an explicit architectural exception and requires the C6
 * traceability block (slice / owner / authority change / removal trigger) in review.
 */
export const legacyExpansionRules: readonly LegacyExpansionRule[] = [
  {
    id: 'AF-FREEZE-001',
    slice: 'XS-W0-01',
    title: 'No new shared-domain dependency on generic sync',
    include: [],
    exclude: [],
    pattern: /from\s+['"][^'"]*\/syncService['"]|\bLocalSyncPayload\b|\bOperationalSyncPayload\b/,
    rationale:
      'ADR-OFF-003 retires generic bidirectional domain sync; GINV-AUTH-001 forbids a second authority. Retired by C6 W13.',
    baseline: {
      'src/application/cloudSyncPayload.ts': 4,
      'src/application/cloudSyncUseCases.test.ts': 2,
      'src/application/cloudSyncUseCases.ts': 11,
      'src/hooks/useCloudSync.spec.tsx': 5,
      'src/hooks/useCloudSync.ts': 5,
      'src/infra/supabase/operationalCloudService.ts': 2,
      'src/infra/supabase/syncService.test.ts': 6,
      'src/infra/supabase/syncService.ts': 14,
    },
  },
  {
    id: 'AF-FREEZE-002',
    slice: 'XS-W0-01',
    title: 'No new dual local/cloud identity in shared domain contracts',
    include: ['src/shared/types/'],
    exclude: [],
    pattern: /^\s*(?:readonly\s+)?(?:cloudId|localId|local_id)\??\s*:/m,
    rationale:
      'ADR-DATA-003 makes final UUID identity canonical; local/cloud dual IDs are legacy. Retired by C6 W14.',
    baseline: {
      'src/shared/types/community.ts': 3,
      'src/shared/types/player.ts': 2,
      'src/shared/types/session.ts': 11,
    },
  },
  {
    id: 'AF-FREEZE-003',
    slice: 'XS-W0-01',
    title: 'No new generic syncStatus/sync_version lifecycle field',
    include: ['src/shared/types/'],
    exclude: [],
    pattern: /^\s*(?:readonly\s+)?(?:syncStatus|sync_status|syncVersion|sync_version)\??\s*:/m,
    rationale:
      'ADR-DATA-003 and GINV-LIFE-001: lifecycle is semantic per aggregate, not a generic sync flag. Retired by C6 W13/W14.',
    baseline: {
      'src/shared/types/community.ts': 3,
      'src/shared/types/player.ts': 2,
      'src/shared/types/session.ts': 11,
    },
  },
  {
    id: 'AF-FREEZE-004',
    slice: 'XS-W0-01',
    title: 'Direct Supabase table/RPC access stays inside the infrastructure boundary',
    include: [],
    exclude: ['src/infra/supabase/'],
    pattern:
      /(?<!Array|Object|Buffer|Number|String|Date|Set|Map|entries)\.\s*from\s*\(\s*['"]|\.\s*rpc\s*\(\s*['"]/,
    rationale:
      'GINV-API-001 / ADR-API-001 / ADR-SEC-002: critical mutations are semantic Commands, never generic CRUD issued from UI or domain layers. Baseline is already clean, so this freezes a TARGET boundary.',
    baseline: {},
  },
  {
    id: 'AF-FREEZE-005',
    slice: 'XS-W0-01',
    title: 'No authorization derived from client-supplied actor role or identity',
    include: [],
    exclude: [],
    pattern:
      /\b(?:actorRole|callerRole|requesterRole|currentUserRole|actorIsAdmin|callerIsAdmin|isAdminFromClient|actorUserId|callerUserId)\b|\bp_(?:actor|caller|current_user|requester)_[a-z_]+\b/,
    rationale:
      'GINV-AUTH-003 / ADR-API-003 / ADR-SEC-001: actor is server-derived. Subject-role parameters such as p_role/new_role stay legal because they name the role being assigned, not the caller. Baseline is clean, so this freezes a TARGET boundary.',
    baseline: {},
  },
  {
    id: 'AF-FREEZE-006',
    slice: 'XS-W0-01',
    title: 'No new updated_at timestamp used as conflict authority',
    include: [],
    exclude: [],
    pattern:
      /(?:timestampMs|Date\.parse|new Date)\s*\([^)]*[Uu]pdatedAt[^)]*\)(?:\s*\.\s*getTime\s*\(\s*\))?\s*[<>]=?/,
    rationale:
      'GINV-API-004 / ADR-API-007 / ADR-OFF-009: stale writers are detected by semantic revision/sequence/epoch, never wall clock. Retired by C6 W13.',
    baseline: {
      // The actual legacy last-write-wins merge. Retired with syncService in W13.
      'src/infra/supabase/syncService.ts': 2,
      // Classified NOT a conflict resolver: selects the most recent evaluation for display
      // aggregation. Pinned so it cannot silently grow into one.
      'src/logic/playerEvaluations.ts': 1,
    },
  },
  {
    id: 'AF-FREEZE-007',
    slice: 'XS-W0-01',
    title: 'No new raw broad-domain localStorage writes',
    include: [],
    exclude: ['src/storage/'],
    pattern: /localStorage\s*\.\s*setItem\s*\(\s*['"]vpg_/,
    rationale:
      'GINV-AUTH-002 / ADR-OFF-006: shared critical state is server-authoritative and localStorage is limited to small preferences. Structured local state moves to IndexedDB in C6 W12.',
    baseline: {
      'src/app/AppRouter.spec.tsx': 7,
      'src/hooks/useCloudSync.spec.tsx': 6,
      'src/hooks/usePlayers.spec.tsx': 1,
      'src/hooks/usePlayers.ts': 4,
      'src/logic/migrations.ts': 1,
    },
  },
  {
    id: 'AF-FREEZE-008',
    slice: 'XS-W0-01',
    title: 'No new Overall coupling inside the Team Formation solver',
    include: [
      'src/logic/balancing.ts',
      'src/logic/balancer.worker.ts',
      'src/logic/balancerMessages.ts',
      'src/logic/balancingConstants.ts',
    ],
    exclude: [],
    pattern: /[Oo]verall/,
    rationale:
      'GINV-BAL-001 / ADR-BAL-001: Overall is display-only and must never influence the solver. The current objective still weights it; XS-W1-01 removes that. This census freezes the coupling so it cannot grow first. Overall stays legal outside these solver modules.',
    baseline: {
      'src/logic/balancing.ts': 69,
      'src/logic/balancingConstants.ts': 1,
    },
  },
];

/**
 * AF-FREEZE-008 structural contracts.
 *
 * The census above catches new literal `overall` references. These frozen key sets catch
 * the rename attack: any newly named aggregate that wants solver influence must surface as
 * an objective weight or a team metric, and both sets are pinned.
 */
export const FROZEN_BALANCE_WEIGHT_KEYS: readonly string[] = [
  'attack',
  'block',
  'consistency',
  'defense',
  'emotionalControl',
  'gender',
  'height',
  'injured',
  'netPresence',
  'overall',
  'reception',
  'repetition',
  'roleCoverage',
  'serve',
  'setting',
  'teamSize',
];

export const FROZEN_TEAM_METRIC_KEYS: readonly string[] = [
  'attack',
  'averageForm',
  'averageHeight',
  'block',
  'consistency',
  'defense',
  'emotionalControl',
  'femaleCount',
  'gameVision',
  'hasDefensiveReference',
  'hasSetter',
  'hasStrongAttacker',
  'injuredCount',
  'maleCount',
  'netPresence',
  'overall',
  'reception',
  'serve',
  'setting',
  'size',
  'speed',
  'stamina',
  'teamIndex',
];

/** AF-FREEZE-007 structural contract: the broad domain localStorage surface cannot grow. */
export const FROZEN_STORAGE_KEYS: readonly string[] = [
  'activeCommunityId',
  'activeSession',
  'bestDivisions',
  'championshipRequests',
  'championshipRounds',
  'championshipTeams',
  'championships',
  'communities',
  'communityPresence',
  'communityRules',
  'dismissedHints',
  'gameReports',
  'games',
  'lastSelectedPlayerIds',
  'lastSessionConfig',
  'players',
  'points',
  'selectedDivisionIndex',
  'sessionDraft',
  'sessionReports',
  'sessions',
  'syncIssueLedger',
  'teams',
  'whatsAppListDrafts',
  'whatsAppListTemplates',
];
