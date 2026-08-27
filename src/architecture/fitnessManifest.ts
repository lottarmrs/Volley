export type ArchitectureFitnessLifecycle = 'TARGET' | 'TRANSITIONAL' | 'LEGACY';

export interface ArchitectureFitnessRecord {
  id: string;
  owner: string;
  lifecycle: ArchitectureFitnessLifecycle;
  protects: string;
  removalOrReplacementTrigger: string;
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
] as const;

export function getArchitectureFitness(id: string): ArchitectureFitnessRecord {
  const record = architectureFitnessManifest.find((item) => item.id === id);
  if (!record) throw new Error(`Unknown architecture fitness function: ${id}`);
  return record;
}
