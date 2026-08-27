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
    // Censuses the PRECONDITION for timestamp-LWW -- converting an update timestamp into a
    // comparable number -- rather than the shape of the comparison itself. Matching the
    // comparison is trivially evaded by assigning to a variable first, which is exactly how
    // the primary merge in mergeEntityLists escaped the original rule. Pure display
    // formatting (toLocaleDateString, toISOString) does not convert to a number and stays
    // legal.
    pattern:
      /\b(?:timestampMs|getSyncTimestamp)\s*\(|\bgetUpdatedAt\s*\(|Date\.parse\s*\([^)]*(?:[Uu]pdatedAt|updated_at|atualizadoEm)[^)]*\)|new Date\s*\([^)]*(?:[Uu]pdatedAt|updated_at|atualizadoEm)[^)]*\)\s*\.\s*getTime\s*\(\s*\)/,
    rationale:
      'GINV-API-004 / ADR-API-007 / ADR-OFF-009: stale writers are detected by semantic revision/sequence/epoch, never wall clock. Every allowlisted site below is a real timestamp-ordering decision that a named wave retires.',
    baseline: {
      // Newest-wins selection: sorts by updatedAt descending and takes the first draft.
      // Retired when drafts move to structured local storage in W12.
      'src/application/localWhatsAppListUseCases.ts': 2,
      // The generic last-write-wins merge machinery: timestampMs/getSyncTimestamp helpers
      // plus every comparison site in mergeEntityLists. Retired with syncService in W13.
      'src/infra/supabase/syncService.ts': 22,
      // LWW dedup of operational rows by updated_at before upsert. Retired in W13.
      'src/infra/supabase/operationalCloudService.ts': 3,
      // LWW dedup of evaluations per evaluator. Replaced by the hierarchical attribute
      // aggregation in W5.
      'src/infra/supabase/playerEvaluationCloudService.ts': 3,
      // Timestamp-ordered dedup inside the legacy import path. Retired in W14.
      'src/logic/migrations.ts': 5,
      // Latest-evaluation selection for display aggregation. Classified NOT a conflict
      // resolver, but pinned so it cannot silently become one. Revisited in W5.
      'src/logic/playerEvaluations.ts': 2,
      // Tests asserting current legacy behaviour; they retire with their subjects.
      'src/infra/supabase/mappers.test.ts': 1,
      'src/infra/supabase/selfEvaluationCloudService.test.ts': 1,
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

/**
 * AF-FREEZE-008 dependency contract.
 *
 * The census sees literal `overall` text and the key sets see new objective inputs, but
 * neither can see a NEW, neutrally named module that computes a composite rating and is
 * imported into the solver. Freezing the solver's whole import surface closes that route:
 * any new binding reaching Team Formation is an explicit, reviewed decision.
 *
 * The two Overall entry points are `./calculations:calculateGeneralOverall` and
 * `./calculations:calculatePositionOverall`. XS-W1-01 removes both, which will fail this
 * contract and force a deliberate update rather than a silent one.
 */
export const FROZEN_SOLVER_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  'src/logic/balancing.ts': [
    '../types:AthleteVector',
    '../types:Attributes',
    '../types:BalanceConstraints',
    '../types:BalanceDiagnostics',
    '../types:BalanceQuality',
    '../types:BalanceWeights',
    '../types:Division',
    '../types:FreePlayConfig',
    '../types:Player',
    '../types:Position',
    '../types:RoleComposition',
    '../types:RotationType',
    '../types:Team',
    '../types:TeamMetrics',
    '../types:TeamSolution',
    '../types:TeamStrengthSnapshot',
    '../types:TournamentConfig',
    './balancingConstants:OVERALL_SCALE',
    './balancingConstants:PENALTIES',
    './balancingConstants:QUALITY',
    './balancingConstants:THRESHOLDS',
    './calculations:calculateGenderDistribution',
    './calculations:calculateGeneralOverall',
    './calculations:calculatePositionOverall',
    './calculations:calculateTeamSizes',
    './partnershipHistory:PartnershipMatrix',
    './uuid:generateUUID',
  ],
  'src/logic/balancer.worker.ts': [
    './balancerMessages:BalanceRequest',
    './balancerMessages:BalanceResponse',
    './balancing:balanceTeams',
  ],
  'src/logic/balancerMessages.ts': [
    '../types:Division',
    '../types:FreePlayConfig',
    '../types:Player',
    '../types:TournamentConfig',
    './partnershipHistory:PartnershipMatrix',
  ],
  'src/logic/balancingConstants.ts': [],
};

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
