import { supabase } from '../../lib/supabaseClient';
import { AuthRole, UserProfile } from '../../types';

function mapDbToProfile(db: any): UserProfile {
  return {
    id: db.id,
    name: db.name ?? null,
    email: db.email,
    role: db.role,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

/**
 * Administração global de papéis (somente staff). A leitura depende da policy
 * "App staff can read all profiles"; a escrita passa pelo RPC `set_user_role`,
 * que é master-only e protege o último master. A coluna `role` é travada por
 * trigger fora desse RPC, então não há como escalonar via update direto.
 */
export const profilesAdminCloudService = {
  /** Lista todos os perfis (RLS limita a staff). Ordenado por papel e nome. */
  async listProfiles(): Promise<UserProfile[]> {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('role', { ascending: true })
      .order('email', { ascending: true });
    if (error) throw error;
    return (data || []).map(mapDbToProfile);
  },

  /** Altera o papel de um usuário. Lança erro de RLS/validação vindo do RPC. */
  async setRole(targetUserId: string, role: AuthRole): Promise<UserProfile> {
    const { data, error } = await supabase.rpc('set_user_role', {
      target_user_id: targetUserId,
      new_role: role,
    });
    if (error) throw error;
    return mapDbToProfile(data);
  },
};
