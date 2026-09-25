import type { CommunityEvaluationRosterEntry } from '@shared/types';

export interface EvaluationRosterView {
  self: CommunityEvaluationRosterEntry | null;
  pending: CommunityEvaluationRosterEntry[];
  evaluated: CommunityEvaluationRosterEntry[];
  total: number;
  evaluatedCount: number;
}

export function evaluationDisplayName(entry: CommunityEvaluationRosterEntry): string {
  return entry.nickname?.trim() || entry.name;
}

const byName = (a: CommunityEvaluationRosterEntry, b: CommunityEvaluationRosterEntry) =>
  evaluationDisplayName(a).localeCompare(evaluationDisplayName(b), 'pt-BR', {
    sensitivity: 'base',
  });

export function buildEvaluationRosterView(
  entries: CommunityEvaluationRosterEntry[],
): EvaluationRosterView {
  const others = entries.filter((entry) => !entry.isSelf);
  const pending = others.filter((entry) => !entry.myLastEvaluatedAt).sort(byName);
  const evaluated = others.filter((entry) => !!entry.myLastEvaluatedAt).sort(byName);
  return {
    self: entries.find((entry) => entry.isSelf) ?? null,
    pending,
    evaluated,
    total: others.length,
    evaluatedCount: evaluated.length,
  };
}

export function nextPendingAfter(view: EvaluationRosterView, playerId: string): string | null {
  const candidates = view.pending.filter((entry) => entry.playerId !== playerId);
  if (candidates.length === 0) return null;
  const index = view.pending.findIndex((entry) => entry.playerId === playerId);
  if (index < 0) return candidates[0].playerId;
  const after = view.pending.slice(index + 1).find((entry) => entry.playerId !== playerId);
  return (after ?? candidates[0]).playerId;
}
