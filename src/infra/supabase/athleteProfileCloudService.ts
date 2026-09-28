import type { AthleteProfileDraft } from '@domain/athleteProfile';
import type { AccountReadiness } from '@app/accountUseCases';
import { isSupabaseConfigured, supabase as client } from '../../lib/supabaseClient';

export const athleteProfileCloudService = {
  async update(draft: AthleteProfileDraft): Promise<AccountReadiness> {
    if (!isSupabaseConfigured)
      throw Object.assign(new Error('Cloud unavailable'), { code: 'CLOUD_UNAVAILABLE' });
    const { data, error } = await client.rpc('update_my_athlete_profile', {
      p_gender: draft.genero,
      p_primary_position: draft.posicaoPrincipal,
      p_height_cm: draft.alturaCm,
      p_dominant_hand: draft.maoDominante,
      p_nickname: draft.apelido,
      p_secondary_positions: draft.posicoesSecundarias,
      p_injured: draft.lesionado ?? null,
      p_physical_limitation:
        draft.limitacaoFisica === undefined ? null : (draft.limitacaoFisica ?? ''),
    });
    if (error) throw error;
    return String(data) as AccountReadiness;
  },
};
