import { useCallback, useEffect, useMemo, useState } from 'react';
import { ShieldCheck, UserCog, Inbox, Loader2, Check, X, RefreshCw } from 'lucide-react';
import { AuthRole, Player, PlayerLinkProposal, UserProfile } from '../../types';
import { useProfilesAdmin } from '../../hooks/useProfilesAdmin';
import { playerLinkProposalCloudService } from '../../services/supabase/playerLinkProposalCloudService';

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

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

export const GestaoView = ({ currentUserId, isMaster, players, onToast }: GestaoViewProps) => {
  const { profiles, loading, error, savingId, changeRole } = useProfilesAdmin(true);

  const profileById = useMemo(() => {
    const map = new Map<string, UserProfile>();
    for (const p of profiles) map.set(p.id, p);
    return map;
  }, [profiles]);

  const playerNameByCloudId = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of players) if (p.cloudId) map.set(p.cloudId, p.nome);
    return map;
  }, [players]);

  // ── Aprovações pendentes de vínculo ───────────────────────────────────────
  const [pending, setPending] = useState<PlayerLinkProposal[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadPending = useCallback(async () => {
    setLoadingPending(true);
    setPendingError(null);
    try {
      const all = await playerLinkProposalCloudService.fetchAll();
      setPending(all.filter((p) => p.status === 'pending'));
    } catch (e) {
      setPendingError(messageOf(e, 'Não foi possível carregar as solicitações.'));
    } finally {
      setLoadingPending(false);
    }
  }, []);

  useEffect(() => {
    loadPending();
  }, [loadPending]);

  const handleReview = useCallback(
    async (proposalId: string, action: 'approve' | 'reject') => {
      setActingId(proposalId);
      try {
        if (action === 'approve') await playerLinkProposalCloudService.approve(proposalId);
        else await playerLinkProposalCloudService.reject(proposalId);
        setPending((prev) => prev.filter((p) => p.id !== proposalId));
        onToast?.(action === 'approve' ? 'Vínculo aprovado.' : 'Solicitação rejeitada.', 'success');
      } catch (e) {
        onToast?.(messageOf(e, 'Falha ao processar a solicitação.'), 'error');
      } finally {
        setActingId(null);
      }
    },
    [onToast],
  );

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

      {/* ── Aprovações pendentes ─────────────────────────────────────────── */}
      <div className="card card-border border-border bg-surface-strong/40 p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold uppercase tracking-wider flex items-center gap-2">
            <Inbox className="w-5 h-5 text-accent" /> Solicitações de vínculo
            {pending.length > 0 && <span className="badge badge-accent">{pending.length}</span>}
          </h3>
          <button
            onClick={loadPending}
            disabled={loadingPending}
            className="btn btn-ghost btn-sm rounded-full"
            title="Atualizar"
          >
            {loadingPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </button>
        </div>

        {pendingError && <div className="alert alert-error text-xs mb-3">{pendingError}</div>}

        {!loadingPending && pending.length === 0 && !pendingError && (
          <p className="text-xs text-text-muted">Nenhuma solicitação pendente.</p>
        )}

        <div className="space-y-2">
          {pending.map((proposal) => {
            const athlete = playerNameByCloudId.get(proposal.playerId) ?? 'Atleta';
            const requester = profileById.get(proposal.userId);
            const requesterLabel = requester?.email || requester?.name || proposal.userId;
            const acting = actingId === proposal.id;
            return (
              <div
                key={proposal.id}
                className="flex items-center justify-between gap-3 p-3 rounded-xl bg-base-200 border border-base-300"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{athlete}</p>
                  <p className="text-xs text-text-muted truncate">
                    Solicitado por <strong>{requesterLabel}</strong>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleReview(proposal.id, 'approve')}
                    disabled={acting}
                    className="btn btn-success btn-sm rounded-full"
                  >
                    {acting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Check className="w-4 h-4" />
                    )}
                    Aprovar
                  </button>
                  <button
                    onClick={() => handleReview(proposal.id, 'reject')}
                    disabled={acting}
                    className="btn btn-ghost btn-sm rounded-full text-error"
                  >
                    <X className="w-4 h-4" /> Rejeitar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
