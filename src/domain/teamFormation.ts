import type { BalanceCandidate, TeamFormationRequest } from '@shared/types';

export const FORMATION_REFUSAL_CODES = [
  'EMPTY_ROSTER',
  'INVALID_TEAM_COUNT',
  'NOT_ENOUGH_PARTICIPANTS',
  'CONTRADICTORY_PAIR',
  'LOCKED_TEAM_OUT_OF_RANGE',
  'UNKNOWN_PARTICIPANT_IN_CONSTRAINTS',
] as const;

export type FormationRefusalCode = (typeof FORMATION_REFUSAL_CODES)[number];

export interface FormationRefusal {
  readonly code: FormationRefusalCode;
  readonly message: string;
}

export interface PartnershipSummary {
  readonly count: number;
  readonly hash: string;
}

// FNV-1a. Nao e hash criptografico: serve para comparar duas execucoes da mesma
// entrada, e SubtleCrypto obrigaria a porta inteira a virar assincrona por nada.
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function canonicalizeRequest(request: TeamFormationRequest): unknown {
  return {
    contractVersion: request.contractVersion,
    algorithmVersion: request.algorithmVersion,
    teamCount: request.teamCount,
    seed: request.seed,
    budget: { seeds: request.budget.seeds, maxIterations: request.budget.maxIterations },
    objective: request.objective,
    hardConstraints: request.hardConstraints,
    provenance: request.provenance,
    participants: request.participants.map((participant) => ({ ...participant })),
  };
}

export function canonicalizeCandidates(candidates: readonly BalanceCandidate[]): unknown {
  return candidates.map((candidate) => ({
    solution: candidate.solution,
    score: candidate.score,
    diagnostics: candidate.diagnostics,
    algorithm: candidate.algorithm,
    seed: candidate.seed,
    iterations: candidate.iterations,
  }));
}

export function summarizePartnershipMatrix(matrix: unknown): PartnershipSummary | null {
  if (!matrix || typeof matrix !== 'object' || Array.isArray(matrix)) return null;
  const serialized = JSON.stringify(matrix);
  return { count: Object.keys(matrix as Record<string, unknown>).length, hash: fnv1a(serialized) };
}

export function fingerprintFormation(
  request: TeamFormationRequest,
  candidates: readonly BalanceCandidate[],
  partnership: PartnershipSummary | null,
): string {
  return fnv1a(
    JSON.stringify({
      request: canonicalizeRequest(request),
      result: canonicalizeCandidates(candidates),
      partnership,
    }),
  );
}

export function precheckFormation(request: TeamFormationRequest): FormationRefusal | null {
  if (request.teamCount < 1) {
    return { code: 'INVALID_TEAM_COUNT', message: 'Informe pelo menos um time.' };
  }
  if (request.participants.length === 0) {
    return { code: 'EMPTY_ROSTER', message: 'Nenhum atleta selecionado para formar times.' };
  }
  if (request.participants.length < request.teamCount) {
    return {
      code: 'NOT_ENOUGH_PARTICIPANTS',
      message: 'Há menos atletas do que times.',
    };
  }

  const known = new Set(request.participants.map((participant) => participant.participantId));
  const constraints = request.hardConstraints ?? {};

  const together = constraints.pairsTogether ?? [];
  const separated = constraints.pairsSeparated ?? [];
  const pairKey = (pair: readonly [string, string]) => [...pair].sort().join(' ');
  const separatedKeys = new Set(separated.map(pairKey));
  for (const pair of together) {
    if (separatedKeys.has(pairKey(pair))) {
      return {
        code: 'CONTRADICTORY_PAIR',
        message: 'A mesma dupla foi marcada para jogar junta e separada.',
      };
    }
  }

  for (const pair of [...together, ...separated]) {
    for (const id of pair) {
      if (!known.has(id)) {
        return {
          code: 'UNKNOWN_PARTICIPANT_IN_CONSTRAINTS',
          message: 'Uma restrição aponta para um atleta fora da lista.',
        };
      }
    }
  }

  for (const [id, teamIndex] of Object.entries(constraints.lockedPlayerIdxs ?? {})) {
    if (!known.has(id)) {
      return {
        code: 'UNKNOWN_PARTICIPANT_IN_CONSTRAINTS',
        message: 'Uma restrição aponta para um atleta fora da lista.',
      };
    }
    if (teamIndex < 0 || teamIndex >= request.teamCount) {
      return {
        code: 'LOCKED_TEAM_OUT_OF_RANGE',
        message: 'Um atleta foi fixado em um time que não existe.',
      };
    }
  }

  return null;
}
