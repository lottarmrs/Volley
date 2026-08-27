export type ArchitectureFitnessLifecycle = 'TARGET' | 'TRANSITIONAL' | 'LEGACY';

export interface ArchitectureFitnessRecord {
  id: string;
  owner: string;
  lifecycle: ArchitectureFitnessLifecycle;
  protects: string;
  removalOrReplacementTrigger: string;
  /** C6 slice that introduced the rule, when it came from the execution program. */
  slice?: string;
}

export const architectureFitnessManifest: readonly ArchitectureFitnessRecord[] = [
  {
    id: 'AF-TARGET-001',
    owner: 'Architecture Governance / Application',
    lifecycle: 'TARGET',
    protects: 'TypeScript aliases resolve through the intended architecture boundaries.',
    removalOrReplacementTrigger:
      'Replace only if the canonical module-boundary strategy itself changes through architecture review.',
  },
  {
    id: 'AF-TARGET-002',
    owner: 'Architecture Governance / UI',
    lifecycle: 'TARGET',
    protects: 'Shared UI primitives live under src/ui rather than regrowing the deprecated components/common path.',
    removalOrReplacementTrigger:
      'Replace only if the canonical UI module boundary changes through architecture review.',
  },
  {
    id: 'AF-TARGET-003',
    owner: 'Architecture Governance / Infrastructure',
    lifecycle: 'TARGET',
    protects: 'Supabase/provider adapters remain under the infrastructure boundary.',
    removalOrReplacementTrigger:
      'Replace only if provider integration ownership/layering changes through architecture review.',
  },
  {
    id: 'AF-TARGET-004',
    owner: 'Architecture Governance / Domain owners',
    lifecycle: 'TARGET',
    protects: 'Shared domain contracts remain in explicit domain-oriented shared modules rather than UI/IO modules.',
    removalOrReplacementTrigger:
      'Replace if domain contracts move to a new canonical package/module model with equivalent dependency protection.',
  },
  {
    id: 'AF-TRANS-001',
    owner: 'Migration W13 / Architecture Governance',
    lifecycle: 'TRANSITIONAL',
    protects: 'Current generic sync remains discoverable while C6 W13 removes its consumers deliberately.',
    removalOrReplacementTrigger:
      'Delete this fitness record and its transitional assertion when W13 proves zero target reads/writes through syncService and W14 contracts the artifact.',
  },
  {
    id: 'AF-TRANS-002',
    owner: 'Session W3/W14 / Architecture Governance',
    lifecycle: 'TRANSITIONAL',
    protects: 'Legacy Session selectedPlayerIds/teamIds remain explicitly classified until RosterRevision/TeamDraw compatibility is cut over.',
    removalOrReplacementTrigger:
      'Delete this fitness record and its transitional assertion once W3/W6 target contracts own all supported reads/writes and W14 removes the legacy fields.',
  },
  {
    id: 'AF-FREEZE-001',
    slice: 'XS-W0-01',
    owner: 'Migration W13 / Offline + Data',
    lifecycle: 'TRANSITIONAL',
    protects:
      'New shared-domain code cannot take a dependency on generic sync (syncService, LocalSyncPayload, OperationalSyncPayload).',
    removalOrReplacementTrigger:
      'Lower the AF-FREEZE-001 baseline as W13 removes each consumer; delete the rule when W14 contracts syncService.',
  },
  {
    id: 'AF-FREEZE-002',
    slice: 'XS-W0-01',
    owner: 'Data / Migration W14',
    lifecycle: 'TRANSITIONAL',
    protects:
      'New target entities cannot introduce a local/cloud dual identity pair; ADR-DATA-003 makes final UUID identity canonical.',
    removalOrReplacementTrigger:
      'Lower the AF-FREEZE-002 baseline per entity as W14 removes legacy identity columns; delete the rule when no shared contract declares a dual ID.',
  },
  {
    id: 'AF-FREEZE-003',
    slice: 'XS-W0-01',
    owner: 'Data / Migration W13-W14',
    lifecycle: 'TRANSITIONAL',
    protects:
      'New target entities cannot introduce a generic syncStatus/sync_version lifecycle field instead of semantic per-aggregate lifecycle.',
    removalOrReplacementTrigger:
      'Lower the AF-FREEZE-003 baseline as each aggregate gains semantic lifecycle; delete the rule when generic sync state is gone.',
  },
  {
    id: 'AF-FREEZE-004',
    slice: 'XS-W0-01',
    owner: 'Application + Security',
    lifecycle: 'TARGET',
    protects:
      'Direct Supabase table/RPC access stays inside src/infra/supabase so critical mutations remain semantic Commands rather than generic browser CRUD.',
    removalOrReplacementTrigger:
      'Replace only if the canonical provider-adapter boundary itself changes through architecture review. The empty allowlist must stay empty.',
  },
  {
    id: 'AF-FREEZE-005',
    slice: 'XS-W0-01',
    owner: 'Security / Application',
    lifecycle: 'TARGET',
    protects:
      'No command or RPC payload carries client-supplied actor role/identity as authority evidence; actor stays server-derived.',
    removalOrReplacementTrigger:
      'Replace only if server-side actor resolution changes through architecture review. The empty allowlist must stay empty.',
  },
  {
    id: 'AF-FREEZE-006',
    slice: 'XS-W0-01',
    owner: 'Application + Data / Migration W13',
    lifecycle: 'TRANSITIONAL',
    protects:
      'updated_at cannot be reintroduced as a conflict resolver; optimistic concurrency uses semantic revision/sequence/epoch. Censuses conversion of an update timestamp to a comparable number, which is the precondition for LWW and cannot be evaded by assigning to a variable before comparing.',
    removalOrReplacementTrigger:
      'Drop the syncService and operationalCloudService entries when W13 removes the generic merge; the evaluation entries when W5 lands hierarchical aggregation; the drafts entry when W12 moves drafts to IndexedDB; the migrations entry when W14 retires the legacy importer.',
  },
  {
    id: 'AF-FREEZE-007',
    slice: 'XS-W0-01',
    owner: 'Offline / Migration W12',
    lifecycle: 'TRANSITIONAL',
    protects:
      'The broad domain localStorage surface cannot grow: STORAGE_KEYS is frozen and new raw vpg_ writes are blocked. Small preference keys remain allowed.',
    removalOrReplacementTrigger:
      'Shrink FROZEN_STORAGE_KEYS and the AF-FREEZE-007 baseline as W12 moves structured local state to IndexedDB; delete the rule when no domain collection persists in localStorage.',
  },
  {
    id: 'AF-FREEZE-008',
    slice: 'XS-W0-01',
    owner: 'Team Formation',
    lifecycle: 'TRANSITIONAL',
    protects:
      'Overall influence on the Team Formation solver cannot grow. Pins the solver census plus the BalanceWeights/TeamMetrics key sets so a renamed aggregate cannot reach the objective. Overall stays legal as a display value elsewhere.',
    removalOrReplacementTrigger:
      'XS-W1-01 removes Overall from solver influence. At that point drop overall from FROZEN_BALANCE_WEIGHT_KEYS/FROZEN_TEAM_METRIC_KEYS, lower the census to zero, and replace this record with the GINV-BAL-001 target property test.',
  },
] as const;

export function getArchitectureFitness(id: string): ArchitectureFitnessRecord {
  const record = architectureFitnessManifest.find((item) => item.id === id);
  if (!record) throw new Error(`Unknown architecture fitness function: ${id}`);
  return record;
}
