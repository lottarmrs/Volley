import { FormEvent, useState } from 'react';
import {
  Cloud,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserPlus,
  KeyRound,
  Copy,
  Check,
  X,
  LogOut,
  Clock,
  Volleyball,
} from 'lucide-react';
import { AuthRole, Community, CommunityMember, CommunityMemberRole, Player } from '../../types';
import { useCommunityMembers } from '../../hooks/useCommunityMembers';
import {
  buildCommunityMembersViewModel,
  COMMUNITY_ROLE_LABELS,
  COMMUNITY_ROLE_POWERS,
} from '../../application/communityMembersViewModel';

interface CommunityMembersPanelProps {
  community: Community;
  currentUserId: string | null;
  isSupabaseConfigured: boolean;
  globalRole?: AuthRole | null;
  /** Atletas desta comunidade, para casar membro↔ficha via player.userId. */
  players?: Player[];
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

export function CommunityMembersPanel({
  community,
  currentUserId,
  isSupabaseConfigured,
  globalRole = null,
  players = [],
}: CommunityMembersPanelProps) {
  const enabled = isSupabaseConfigured && !!community.cloudId;
  const {
    members,
    loading,
    error,
    reload,
    invite,
    changeRole,
    remove,
    approveRequest,
    rejectRequest,
    generateJoinCode,
    disableJoinCode,
    leave,
  } = useCommunityMembers({
    communityCloudId: community.cloudId,
    communityLocalId: community.id,
    currentUserId,
    globalRole,
    enabled,
  });

  const vm = buildCommunityMembersViewModel({
    community,
    members,
    players,
    currentUserId,
    isSupabaseConfigured,
    globalRole,
  });
  const activeMembers = vm.activeMembers;
  const pendingRequests = vm.pendingRequests;
  const canManage = vm.canManage;
  const canApprove = vm.canApprove;
  const canLeave = vm.canLeave;

  const [inviteEmail, setInviteEmail] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [joinCode, setJoinCode] = useState<string | null>(community.joinCode ?? null);
  const [copied, setCopied] = useState(false);
  const [confirmacao, setConfirmacao] = useState<{
    titulo: string;
    descricao: string;
    rotuloAcao: string;
    acao: () => void | Promise<void>;
  } | null>(null);
  /** Nenhuma ação bem-sucedida deste painel confirmava nada. */
  const [sucesso, setSucesso] = useState<string | null>(null);

  if (vm.state === 'cloud_disabled' || vm.state === 'community_not_synced') {
    return (
      <div className="bg-surface p-6 rounded-xl border border-border text-center space-y-2">
        <Cloud className="w-8 h-8 mx-auto text-text-muted" />
        <p className="text-sm text-text-muted">{vm.blockedMessage}</p>
      </div>
    );
  }

  const runAction = async (action: () => Promise<unknown>, fallbackMessage: string) => {
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
    // Sem papel: entra como 'member' (default do use case) e o cargo se define no card.
    const ok = await runAction(() => invite(email), 'Não foi possível adicionar.');
    if (ok) {
      setInviteEmail('');
    }
  };

  const gerarCodigo = () =>
    runAction(async () => {
      const code = await generateJoinCode();
      setJoinCode(code);
      setSucesso('Código novo gerado. O anterior deixou de funcionar.');
    }, 'Não foi possível gerar o código.');

  // Gerar um código novo invalida o antigo em silêncio: quem já recebeu o
  // anterior no grupo para de conseguir entrar e ninguém é avisado.
  const handleGenerateCode = () => {
    if (!joinCode) return gerarCodigo();
    setConfirmacao({
      titulo: 'Gerar um código novo?',
      descricao:
        'O código atual para de funcionar na hora. Quem já recebeu o antigo no grupo e ainda não entrou vai precisar do novo.',
      rotuloAcao: 'Gerar novo código',
      acao: gerarCodigo,
    });
  };

  const handleDisableCode = () =>
    runAction(async () => {
      await disableJoinCode();
      setJoinCode(null);
    }, 'Não foi possível desativar o código.');

  const handleCopy = async () => {
    if (!joinCode) return;
    try {
      await navigator.clipboard.writeText(joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard pode estar indisponível; o código segue visível */
    }
  };

  // Papel é governança: quem vira admin passa a aprovar membro e editar regras,
  // e a RPC não tem desfazer. Era a única mutação sensível do painel sem
  // confirmação — remover membro já tinha.
  const handleRoleChange = (member: CommunityMember, role: CommunityMemberRole) => {
    const nome = member.name || member.email || 'este membro';
    setConfirmacao({
      titulo: `Tornar ${nome} ${COMMUNITY_ROLE_LABELS[role]}?`,
      descricao: COMMUNITY_ROLE_POWERS[role],
      rotuloAcao: 'Confirmar papel',
      acao: async () => {
        await runAction(() => changeRole(member.id, role), 'Não foi possível alterar o papel.');
        setSucesso(`${nome} agora é ${COMMUNITY_ROLE_LABELS[role]}.`);
      },
    });
  };

  const handleRemove = (member: CommunityMember) => {
    const label = member.name || member.email || 'este membro';
    if (!window.confirm(`Remover ${label} da comunidade?`)) return;
    return runAction(() => remove(member.id), 'Não foi possível remover o membro.');
  };

  const handleLeave = () => {
    if (!window.confirm('Tem certeza que deseja sair desta comunidade?')) return;
    return runAction(() => leave(), 'Não foi possível sair da comunidade.');
  };

  const sortedMembers = activeMembers;

  return (
    <div className="space-y-5">
      {confirmacao && (
        <div className="modal modal-open" role="dialog" aria-labelledby="confirmar-membro-titulo">
          <div className="modal-box max-w-md space-y-5">
            <div className="space-y-2">
              <h3
                id="confirmar-membro-titulo"
                className="text-lg font-black uppercase tracking-tight"
              >
                {confirmacao.titulo}
              </h3>
              <p className="text-sm leading-relaxed text-base-content/70">
                {confirmacao.descricao}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row-reverse">
              <button
                type="button"
                onClick={() => {
                  const acao = confirmacao.acao;
                  setConfirmacao(null);
                  void acao();
                }}
                className="btn btn-primary min-h-[48px] flex-1 px-6 font-black uppercase tracking-wider"
              >
                {confirmacao.rotuloAcao}
              </button>
              <button
                type="button"
                onClick={() => setConfirmacao(null)}
                className="btn btn-ghost min-h-[48px] flex-1 px-6 font-bold uppercase tracking-wider"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {sucesso && (
        <div role="status" className="alert alert-success alert-soft text-sm">
          <span>{sucesso}</span>
          <button
            type="button"
            onClick={() => setSucesso(null)}
            aria-label="Dispensar confirmação"
            className="btn btn-ghost btn-xs btn-square"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-text-muted uppercase">Área de membros</span>
        <button
          type="button"
          onClick={() => reload()}
          className="btn btn-ghost btn-sm btn-square"
          aria-label="Recarregar"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {(error || actionError) && (
        <div className="alert alert-error text-sm" role="alert">
          <ShieldAlert className="w-4 h-4" />
          <span>{actionError || error}</span>
        </div>
      )}

      {/* ── Código de convite (dono/admin) ─────────────────────────────────── */}
      {canManage && (
        <div className="bg-surface p-4 rounded-xl border border-border space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4" /> Código de convite
          </p>
          <p className="text-xs text-text-muted">
            Compartilhe o código com quem você quer na comunidade. Quem entrar com ele fica{' '}
            <strong>pendente</strong> até você aprovar abaixo.
          </p>
          {joinCode ? (
            <div className="flex flex-wrap items-center gap-2">
              <code className="px-3 py-2 rounded-lg bg-base-200 border border-base-300 font-mono text-base tracking-widest">
                {joinCode}
              </code>
              <button type="button" onClick={handleCopy} className="btn btn-sm btn-outline">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado' : 'Copiar'}
              </button>
              <button
                type="button"
                onClick={handleGenerateCode}
                className="btn btn-sm btn-ghost"
                disabled={busy}
              >
                Novo código
              </button>
              <button
                type="button"
                onClick={handleDisableCode}
                className="btn btn-sm btn-ghost text-error"
                disabled={busy}
              >
                Desativar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleGenerateCode}
              className="btn btn-primary btn-sm"
              disabled={busy}
            >
              <KeyRound className="w-4 h-4" /> Gerar código de convite
            </button>
          )}
        </div>
      )}

      {/* ── Pedidos pendentes (dono/admin/moderador) ───────────────────────── */}
      {/* canApprove, nao canManage: avaliar pedido e permissao mais ampla e inclui
          moderador, alinhado com a capability approve_members do banco. */}
      {canApprove && pendingRequests.length > 0 && (
        <div className="bg-surface p-4 rounded-xl border border-warning/40 space-y-3">
          <p className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-warning" /> Pedidos para entrar
            <span className="badge badge-warning">{pendingRequests.length}</span>
          </p>
          <ul className="space-y-2">
            {pendingRequests.map((row) => {
              const member = row.member;
              return (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 p-2 rounded-lg bg-base-200 border border-base-300"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {row.displayName || 'Solicitante'}
                    </p>
                    {member.email && member.name && (
                      <p className="text-xs text-text-muted truncate">{member.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        runAction(() => approveRequest(member.id), 'Falha ao aprovar.')
                      }
                      className="btn btn-success btn-sm"
                      disabled={busy}
                    >
                      <Check className="w-4 h-4" /> Aprovar
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runAction(() => rejectRequest(member.id), 'Falha ao rejeitar.')
                      }
                      className="btn btn-ghost btn-sm text-error"
                      disabled={busy}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Convite por e-mail (dono/admin) ────────────────────────────────── */}
      {canManage && (
        <form
          onSubmit={handleInvite}
          className="bg-surface p-4 rounded-xl border border-border space-y-3"
        >
          <p className="text-sm font-semibold flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Adicionar membro
          </p>
          <p className="text-xs text-text-muted">
            Informe o e-mail ou o @username. A pessoa precisa já ter conta (entra direto, sem
            aprovação) e passa a fazer parte como membro — o cargo você ajusta no card dela.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            {/* type="text", nao "email": o campo tambem aceita username, e type="email"
                faria o navegador barrar um username valido antes do submit. */}
            <input
              type="text"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@exemplo.com ou @username"
              aria-label="E-mail ou username"
              className="input input-bordered flex-1"
              disabled={busy}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !inviteEmail.trim()}
            >
              Adicionar
            </button>
          </div>
        </form>
      )}

      {/* ── Diretório de membros ───────────────────────────────────────────── */}
      <div className="space-y-2">
        <p className="text-xs font-bold text-text-muted uppercase px-1">
          Membros {activeMembers.length > 0 && `(${activeMembers.length})`}
        </p>
        {loading && activeMembers.length === 0 ? (
          <p className="text-sm text-text-muted px-1">Carregando…</p>
        ) : activeMembers.length === 0 ? (
          <p className="px-1 text-sm leading-relaxed text-text-muted">
            Membro é quem entra na comunidade com a própria conta e ganha permissão para agir —
            marcar ponto, aprovar entrada, avaliar atleta. Diferente do elenco: atleta é quem joga,
            membro é quem opera. Gere um código de convite acima para chamar alguém.
          </p>
        ) : (
          <ul className="space-y-2">
            {sortedMembers.map((row) => {
              const member = row.member;
              const isSelf = row.isSelf;
              const editable = row.canChangeRole;
              return (
                <li
                  key={member.id}
                  className="bg-surface p-3 rounded-xl border border-border flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-base-300 flex items-center justify-center text-xs font-bold shrink-0">
                      {row.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {row.displayName}
                        {isSelf && <span className="text-text-muted font-normal"> (você)</span>}
                      </p>
                      {member.email && member.name && (
                        <p className="text-xs text-text-muted truncate">{member.email}</p>
                      )}
                      {row.athleteLabel && (
                        <span className="badge badge-sm badge-outline gap-1 mt-1">
                          <Volleyball className="w-3 h-3" />
                          {row.athleteLabel}
                        </span>
                      )}
                    </div>
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
                        {row.assignableRoles.map((role) => (
                          <option key={role} value={role}>
                            {COMMUNITY_ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`badge ${row.roleBadgeClass}`}>{row.roleLabel}</span>
                    )}
                    {row.canRemove && (
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

      {/* ── Minha participação ─────────────────────────────────────────────── */}
      {canLeave && (
        <div className="pt-2">
          <button
            type="button"
            onClick={handleLeave}
            className="btn btn-ghost btn-sm text-error"
            disabled={busy}
          >
            <LogOut className="w-4 h-4" /> Sair da comunidade
          </button>
        </div>
      )}
    </div>
  );
}
