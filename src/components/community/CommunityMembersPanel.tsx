import { FormEvent, useState } from 'react';
import { Cloud, RefreshCw, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import { Community, CommunityMember, CommunityMemberRole } from '../../types';
import { useCommunityMembers } from '../../hooks/useCommunityMembers';

interface CommunityMembersPanelProps {
  community: Community;
  currentUserId: string | null;
  isSupabaseConfigured: boolean;
}

const ROLE_LABELS: Record<CommunityMemberRole, string> = {
  owner: 'Dono',
  admin: 'Administrador',
  organizer: 'Organizador',
};

const ROLE_BADGE: Record<CommunityMemberRole, string> = {
  owner: 'badge-primary',
  admin: 'badge-accent badge-soft',
  organizer: 'badge-outline',
};

// Roles an owner/admin may assign. 'owner' is reserved for the community creator
// and is managed by server-side triggers, not the invite UI.
const ASSIGNABLE_ROLES: CommunityMemberRole[] = ['admin', 'organizer'];

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

export function CommunityMembersPanel({
  community,
  currentUserId,
  isSupabaseConfigured,
}: CommunityMembersPanelProps) {
  const enabled = isSupabaseConfigured && !!community.cloudId;
  const { members, loading, error, canManage, reload, invite, changeRole, remove } =
    useCommunityMembers({
      communityCloudId: community.cloudId,
      communityLocalId: community.id,
      currentUserId,
      enabled,
    });

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<CommunityMemberRole>('organizer');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isSupabaseConfigured) {
    return (
      <div className="bg-surface p-6 rounded-xl border border-border text-center space-y-2">
        <Cloud className="w-8 h-8 mx-auto text-text-muted" />
        <p className="text-sm text-text-muted">
          Conecte uma conta na nuvem para gerenciar membros desta comunidade.
        </p>
      </div>
    );
  }

  if (!community.cloudId) {
    return (
      <div className="bg-surface p-6 rounded-xl border border-border text-center space-y-2">
        <Cloud className="w-8 h-8 mx-auto text-text-muted" />
        <p className="text-sm text-text-muted">
          Sincronize esta comunidade com a nuvem (aba <strong>Nuvem &amp; Conta</strong>) antes de
          convidar membros.
        </p>
      </div>
    );
  }

  const runAction = async (action: () => Promise<void>, fallbackMessage: string) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      return true;
    } catch (e) {
      setActionError(messageOf(e, fallbackMessage));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    const email = inviteEmail.trim();
    if (!email) return;
    const ok = await runAction(
      () => invite(email, inviteRole),
      'Não foi possível convidar este membro.',
    );
    if (ok) {
      setInviteEmail('');
      setInviteRole('organizer');
    }
  };

  const handleRoleChange = (member: CommunityMember, role: CommunityMemberRole) =>
    runAction(() => changeRole(member.id, role), 'Não foi possível alterar o papel.');

  const handleRemove = (member: CommunityMember) => {
    const label = member.name || member.email || 'este membro';
    if (!window.confirm(`Remover ${label} da comunidade?`)) return;
    return runAction(() => remove(member.id), 'Não foi possível remover o membro.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-muted uppercase">Membros da comunidade</span>
        <button
          type="button"
          onClick={() => reload()}
          className="btn btn-ghost btn-sm btn-square"
          aria-label="Recarregar membros"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {canManage && (
        <form
          onSubmit={handleInvite}
          className="bg-surface p-4 rounded-xl border border-border space-y-3"
        >
          <p className="text-sm font-semibold flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Convidar organizador
          </p>
          <p className="text-xs text-text-muted">
            O convidado precisa já ter uma conta cadastrada com este e-mail.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="input input-bordered flex-1"
              disabled={busy}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as CommunityMemberRole)}
              className="select select-bordered"
              disabled={busy}
            >
              {ASSIGNABLE_ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !inviteEmail.trim()}
            >
              Convidar
            </button>
          </div>
        </form>
      )}

      {(error || actionError) && (
        <div className="alert alert-error text-sm" role="alert">
          <ShieldAlert className="w-4 h-4" />
          <span>{actionError || error}</span>
        </div>
      )}

      {loading && members.length === 0 ? (
        <p className="text-sm text-text-muted px-1">Carregando membros…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-text-muted px-1">Nenhum membro encontrado.</p>
      ) : (
        <ul className="space-y-2">
          {members.map((member) => {
            const isSelf = member.userId === currentUserId;
            const isOwner = member.role === 'owner';
            const editable = canManage && !isSelf && !isOwner;
            return (
              <li
                key={member.id}
                className="bg-surface p-3 rounded-xl border border-border flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {member.name || member.email || 'Membro'}
                    {isSelf && <span className="text-text-muted font-normal"> (você)</span>}
                  </p>
                  {member.email && member.name && (
                    <p className="text-xs text-text-muted truncate">{member.email}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {editable ? (
                    <select
                      value={member.role}
                      onChange={(e) =>
                        handleRoleChange(member, e.target.value as CommunityMemberRole)
                      }
                      className="select select-bordered select-sm"
                      disabled={busy}
                      aria-label="Papel do membro"
                    >
                      {ASSIGNABLE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className={`badge ${ROLE_BADGE[member.role]}`}>
                      {ROLE_LABELS[member.role]}
                    </span>
                  )}
                  {editable && (
                    <button
                      type="button"
                      onClick={() => handleRemove(member)}
                      className="btn btn-ghost btn-sm btn-square text-error"
                      aria-label="Remover membro"
                      disabled={busy}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
