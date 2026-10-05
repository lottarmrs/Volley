import { detectQueueConflict } from './scoreQueue';
import type {
  LiveScoreState,
  ScoreQueueConflict,
  ScoreQueueEntry,
  ScoreQueueState,
} from './scoreQueue';
import { isNetworkError } from './onlineErrors';

export type DrainResult =
  | { kind: 'done' }
  | { kind: 'conflict'; conflict: ScoreQueueConflict }
  | { kind: 'stopped'; network: boolean; error: unknown };

export async function drainScoreQueue(input: {
  state: ScoreQueueState;
  force: boolean;
  sessionCloudId: string;
  fetchLive: (sessionCloudId: string) => Promise<LiveScoreState>;
  send: (entry: ScoreQueueEntry) => Promise<void>;
  onProgress: (state: ScoreQueueState | null) => void;
}): Promise<DrainResult> {
  let state = input.state;
  if (!input.force) {
    try {
      const live = await input.fetchLive(input.sessionCloudId);
      const conflict = detectQueueConflict({ state, live });
      if (conflict) return { kind: 'conflict', conflict };
    } catch (error) {
      return { kind: 'stopped', network: isNetworkError(error), error };
    }
  }
  while (state.entries.length > 0) {
    const [entry, ...rest] = state.entries;
    try {
      await input.send(entry);
    } catch (error) {
      return { kind: 'stopped', network: isNetworkError(error), error };
    }
    state = {
      ...state,
      knownPointIds: [...state.knownPointIds, ...entry.upserts.pointEvents.map((p) => p.id)],
      entries: rest,
    };
    input.onProgress(rest.length > 0 ? state : null);
  }
  return { kind: 'done' };
}
