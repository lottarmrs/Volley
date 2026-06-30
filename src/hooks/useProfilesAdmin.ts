import { useCallback, useEffect, useState } from 'react';
import { AuthRole, UserProfile } from '../types';
import { profilesAdminCloudService } from '../services/supabase/profilesAdminCloudService';

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

/**
 * Estado React para o painel de "Usuários & papéis" (Gestão). Só carrega quando
 * habilitado (staff logado). A mutação re-busca para refletir o servidor (e as
 * proteções de RLS / último-master do RPC).
 */
export function useProfilesAdmin(enabled: boolean) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!enabled) {
      setProfiles([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setProfiles(await profilesAdminCloudService.listProfiles());
    } catch (e) {
      setError(messageOf(e, 'Não foi possível carregar os usuários.'));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  const changeRole = useCallback(async (userId: string, role: AuthRole) => {
    setSavingId(userId);
    setError(null);
    try {
      const updated = await profilesAdminCloudService.setRole(userId, role);
      setProfiles((prev) => prev.map((p) => (p.id === userId ? updated : p)));
      return true;
    } catch (e) {
      setError(messageOf(e, 'Não foi possível alterar o papel.'));
      return false;
    } finally {
      setSavingId(null);
    }
  }, []);

  return { profiles, loading, error, savingId, reload, changeRole };
}
