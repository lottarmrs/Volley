import { useCallback, useMemo } from 'react';
import { ShieldCheck, UserCog, Loader2 } from 'lucide-react';
import { AuthRole, Player, UserProfile } from '../../types';
import { useProfilesAdmin } from '../../hooks/useProfilesAdmin';

interface GestaoViewProps {
  currentUserId: string | null;
  /** Apenas master pode alterar papéis; programmer enxerga em modo leitura. */
  isMaster: boolean;
  /** Elenco local, para resolver nomes de atletas a partir do cloudId. */
  players: Player[];
  onToast?: (message: string, variant: 'success' | 'error') => void;
}

const ROLE_LABEL: Record<AuthRole, string> = {
  master: 'Master',
  programmer: 'Programador',
  user: 'Usuário',
};

const ROLE_BADGE: Record<AuthRole, string> = {
  master: 'badge-error',
  programmer: 'badge-warning',
  user: 'badge-ghost',
};

export const GestaoView = ({ currentUserId, isMaster, onToast }: GestaoViewProps) => {
  const { profiles, loading, error, savingId, changeRole } = useProfilesAdmin(true);

  const profileById = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const p of profiles) map.set(p.id, p);
    return map;
  }, [profiles]);

  const handleChangeRole = useCallback(
    async (userId: string, role: AuthRole) => {
      const ok = await changeRole(userId, role);
      onToast?.(
        ok ? 'Papel atualizado.' : 'Não foi possível alterar o papel.',
        ok ? 'success' : 'error',
      );
    },
    [changeRole, onToast],
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-primary" /> Gestão
        </h2>
        <p className="text-xs text-text-muted mt-1">
          Administração global do aplicativo. Visível apenas para a equipe (master e programador).
        </p>
      </div>

      {/* ── Usuários & papéis ────────────────────────────────────────────── */}
      <div className="card card-border border-border bg-surface-strong/40 p-6 rounded-2xl">
        <h3 className="text-base font-bold uppercase tracking-wider flex items-center gap-2 mb-4">
          <UserCog className="w-5 h-5 text-primary" /> Usuários & papéis
        </h3>

        {!isMaster && (
          <div className="alert alert-info text-xs mb-3">
            Modo leitura: apenas um <strong>master</strong> pode alterar papéis.
          </div>
        )}
        {error && <div className="alert alert-error text-xs mb-3">{error}</div>}

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando usuários…
          </div>
        ) : (
          <div className="space-y-2">
            {profiles.map((profile) => {
              const isSelf = profile.id === currentUserId;
              const saving = savingId === profile.id;
              return (
                <div
                  key={profile.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-base-200 border border-base-300"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {profile.name || profile.email}
                      {isSelf && <span className="text-xs text-text-muted"> (você)</span>}
                    </p>
                    <p className="text-xs text-text-muted truncate">{profile.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isMaster ? (
                      <select
                        className="select select-sm select-bordered rounded-full text-xs"
                        value={profile.role}
                        disabled={saving}
                        onChange={(e) => handleChangeRole(profile.id, e.target.value as AuthRole)}
                      >
                        <option value="master">Master</option>
                        <option value="programmer">Programador</option>
                        <option value="user">Usuário</option>
                      </select>
                    ) : (
                      <span className={`badge ${ROLE_BADGE[profile.role]}`}>
                        {ROLE_LABEL[profile.role]}
                      </span>
                    )}
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
