import { supabase } from '../../lib/supabaseClient';
import type { CareerEvent, CareerTotals } from '@shared/types/career';

type DbRecord = Record<string, any>;

export function mapDbToCareerEvent(db: DbRecord): CareerEvent {
  return {
    id: db.id,
    playerId: db.player_id,
    communityId: db.community_id ?? null,
    sessionId: db.session_id ?? null,
    type: db.type,
    occurredAt: db.occurred_at,
    payload: db.payload ?? {},
    contractVersion: db.contract_version,
  };
}

export function mapDbToCareerTotals(db: DbRecord): CareerTotals {
  return {
    playerId: db.player_id,
    sessionsPlayed: Number(db.sessions_played ?? 0),
    gamesPlayed: Number(db.games_played ?? 0),
    gamesWon: Number(db.games_won ?? 0),
    totalPoints: Number(db.total_points ?? 0),
    totalErrors: Number(db.total_errors ?? 0),
    totalHighlights: Number(db.total_highlights ?? 0),
    lastPlayedAt: db.last_played_at ?? null,
  };
}

export const careerCloudService = {
  /** Detailed ledger. RLS already limits what the reader can see. */
  async fetchEventsByPlayer(playerCloudId: string): Promise<CareerEvent[]> {
    const { data, error } = await supabase
      .from('career_events')
      .select('*')
      .eq('player_id', playerCloudId)
      .order('occurred_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(mapDbToCareerEvent);
  },

  /** Global totals, without community attribution. */
  async fetchTotals(playerCloudId: string): Promise<CareerTotals | null> {
    const { data, error } = await supabase
      .from('career_totals')
      .select('*')
      .eq('player_id', playerCloudId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapDbToCareerTotals(data) : null;
  },
};
