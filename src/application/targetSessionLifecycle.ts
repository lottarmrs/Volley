import type { Session, SessionConfig, SessionType } from '@shared/types';

export type TargetStep = 'freezeRulesScheduleStart' | 'finish' | 'cancel';

const BEFORE_START = new Set(['draft', 'players_selected', 'configured', 'teams_generated']);

export function targetStepFor(prev: Session | undefined, next: Session): TargetStep | null {
  if (!prev) return null;
  if (next.deletedAt && !prev.deletedAt) return 'cancel';
  if (next.status === prev.status) return null;
  if (next.status === 'active' && BEFORE_START.has(prev.status)) {
    return 'freezeRulesScheduleStart';
  }
  if (next.status === 'finished') return 'finish';
  if (next.status === 'cancelled') return 'cancel';
  return null;
}

export function rulesPayloadFor(session: Session): {
  type: SessionType;
  config: SessionConfig | null;
} {
  return {
    type: session.type ?? session.config?.type ?? 'free_play',
    config: session.config ?? null,
  };
}
