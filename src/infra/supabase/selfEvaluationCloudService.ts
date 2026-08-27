import { supabase } from '../../lib/supabaseClient';
import { Attributes } from '../../types';

export interface SelfEvaluation {
  attributes: Attributes;
  updatedAt: string;
}

type DbRecord = Record<string, any>;

export function mapDbToSelfEvaluation(db: DbRecord | null): SelfEvaluation | null {
  if (!db) return null;
  return {
    attributes: db.attributes || {},
    updatedAt: db.updated_at,
  };
}

export function mapSelfEvaluationToDb(playerId: string, attributes: Attributes) {
  return {
    player_id: playerId,
    attributes,
    updated_at: new Date().toISOString(),
  };
}

export const selfEvaluationCloudService = {
  async fetch(playerId: string): Promise<SelfEvaluation | null> {
    const { data, error } = await supabase
      .from('self_evaluations')
      .select('attributes, updated_at')
      .eq('player_id', playerId)
      .maybeSingle();

    if (error) throw error;
    return mapDbToSelfEvaluation(data);
  },

  async upsert(playerId: string, attributes: Attributes): Promise<void> {
    const { error } = await supabase
      .from('self_evaluations')
      .upsert(mapSelfEvaluationToDb(playerId, attributes), { onConflict: 'player_id' });

    if (error) throw error;
  },
};
