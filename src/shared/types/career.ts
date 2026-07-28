/** Contract version for career events. Bumps when the MEANING of an event or the
 *  shape of its payload changes — not when the VUT formula changes, since that is
 *  recomputed on the fly and needs no migration. */
export const CAREER_CONTRACT_VERSION = 1;

export interface CareerEventPayload {
  games_played?: number;
  games_won?: number;
  points?: number;
  errors?: number;
  highlights?: number;
}

export interface CareerEvent {
  id: string;
  playerId: string;
  communityId: string | null;
  sessionId: string | null;
  type: 'session_played' | 'milestone';
  occurredAt: string;
  payload: CareerEventPayload & { slug?: string };
  contractVersion: number;
}

export interface CareerTotals {
  playerId: string;
  sessionsPlayed: number;
  gamesPlayed: number;
  gamesWon: number;
  totalPoints: number;
  totalErrors: number;
  totalHighlights: number;
  lastPlayedAt: string | null;
}
