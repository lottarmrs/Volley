import { useCallback, useEffect, useState } from 'react';
import { AuthRole, UserProfile } from '../types';
import {
  changeUserRoleCommand,
  listAdminProfilesQuery,
} from '../application/adminProfilesUseCases';

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
    const result = await listAdminProfilesQuery();
    if ('error' in result) {
      setError(result.error.message);
    } else {
      setProfiles(result.value.profiles);
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    reload();
  }, [reload]);

  const changeRole = useCallback(async (userId: string, role: AuthRole) => {
    setSavingId(userId);
    setError(null);
    const result = await changeUserRoleCommand({ userId, role });
    if ('error' in result) {
      setError(result.error.message);
      setSavingId(null);
      return false;
    }

    setProfiles((prev) => prev.map((p) => (p.id === userId ? result.value.profile : p)));
    setSavingId(null);
    return true;
  }, []);

  return { profiles, loading, error, savingId, reload, changeRole };
}
