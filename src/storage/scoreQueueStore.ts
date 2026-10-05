import type { ScoreQueueState } from '@app/scoreQueue';

const PREFIX = 'volley.placar.';

export function loadScoreQueue(userId: string): ScoreQueueState | null {
  try {
    const raw = localStorage.getItem(PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScoreQueueState;
    if (parsed?.userId !== userId || !Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveScoreQueue(state: ScoreQueueState): void {
  try {
    localStorage.setItem(PREFIX + state.userId, JSON.stringify(state));
  } catch {
    return;
  }
}

export function clearScoreQueue(userId: string): void {
  try {
    localStorage.removeItem(PREFIX + userId);
  } catch {
    return;
  }
}
