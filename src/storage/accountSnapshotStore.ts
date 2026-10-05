import type { AccountSnapshot } from '@app/accountUseCases';

const PREFIX = 'volley.conta.';

export function loadAccountSnapshot(userId: string): AccountSnapshot | null {
  try {
    const raw = localStorage.getItem(PREFIX + userId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AccountSnapshot;
    if (parsed?.profile?.id !== userId || typeof parsed.state !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveAccountSnapshot(userId: string, snapshot: AccountSnapshot): void {
  try {
    localStorage.setItem(PREFIX + userId, JSON.stringify(snapshot));
  } catch {
    return;
  }
}

export function clearAccountSnapshot(userId: string): void {
  try {
    localStorage.removeItem(PREFIX + userId);
  } catch {
    return;
  }
}
