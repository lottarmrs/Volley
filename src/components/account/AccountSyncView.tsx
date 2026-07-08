import React, { useEffect, useMemo, useState } from 'react';
import { UserProfile, Player, PlayerLinkProposal } from '../../types';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  LogOut,
  User,
  Shield,
  Calendar,
  CheckCircle,
  AlertCircle,
  UserCheck,
  Loader2,
  Users,
  Wrench,
} from 'lucide-react';
import { AuthForm } from './AuthForm';
import { fetchAccountPlayerLinkQuery } from '../../application/playerLinkUseCases';
import { buildAccountPlayerLinkViewModel } from '../../application/playerLinkViewModel';
import type { RecoverableSyncActions, SyncIssueSummary } from '../../logic/syncIssueLedger';

interface AccountSyncViewProps {
  user: any;
  profile: UserProfile | null;
  loading: boolean;
  isSupabaseConfigured: boolean;
  onSignIn: (email: string, password: string) => Promise<any>;
  onSignUp: (email: string, password: string, name?: string) => Promise<any>;
  onSignOut: () => Promise<void>;

  // Sync actions
  onSync: () => Promise<void>;
  onRepairDuplicates: () => Promise<void>;
  lastSyncedAt: string | null;
  syncLoading: boolean;

  players: Player[];
  linkProposals: PlayerLinkProposal[];
  onProposeLink: (playerId: string) => Promise<void> | void;
  onCancelLink: (proposalId: string) => Promise<void> | void;
  recoverableSyncActions?: RecoverableSyncActions;
  syncIssueSummary?: SyncIssueSummary;
  onRetryPrimarySyncAction?: () => Promise<void> | void;
}

export function AccountSyncView({
  user,
  profile,
  loading,
  isSupabaseConfigured,
  onSignIn,
  onSignUp,
  onSignOut,
  onSync,
  onRepairDuplicates,
  lastSyncedAt,
  syncLoading,
  players = [],
  linkProposals = [],
  onProposeLink,
  onCancelLink,
  recoverableSyncActions,
  syncIssueSummary,
  onRetryPrimarySyncAction,
}: AccountSyncViewProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cloudLinkedPlayer, setCloudLinkedPlayer] = useState<Player | null>(null);
  const [cloudPendingProposal, setCloudPendingProposal] = useState<PlayerLinkProposal | null>(null);
  const [checkingLinkedPlayer, setCheckingLinkedPlayer] = useState(false);
  const [linkedPlayerCheckFailed, setLinkedPlayerCheckFailed] = useState(false);

  // Encontra atleta vinculado
  const localLinkedPlayer = useMemo(() => {
    if (!user) return null;
    return players.find((p) => p.userId === user.id) ?? null;
  }, [players, user]);

  useEffect(() => {
    if (!user || !isSupabaseConfigured || localLinkedPlayer) {
      setCloudLinkedPlayer(null);
      setCloudPendingProposal(null);
      setCheckingLinkedPlayer(false);
      setLinkedPlayerCheckFailed(false);
      return;
    }

    let cancelled = false;
    setCheckingLinkedPlayer(true);
    setLinkedPlayerCheckFailed(false);

    fetchAccountPlayerLinkQuery(user.id)
      .then((result) => {
        if (cancelled) return;

        if (result.ok) {
          setCloudLinkedPlayer(result.value.linkedPlayer);
          setCloudPendingProposal(result.value.pendingProposal);
          setLinkedPlayerCheckFailed(!!result.issues?.length);
          if (result.issues?.length) {
            console.warn('[account] Falha recuperavel ao verificar vinculo:', result.issues[0]);
          }
          return;
        }

        setCloudLinkedPlayer(null);
        setCloudPendingProposal(null);
        setLinkedPlayerCheckFailed(true);
      })
      .finally(() => {
        if (!cancelled) setCheckingLinkedPlayer(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isSupabaseConfigured, localLinkedPlayer, user]);

  const playerLinkVm = buildAccountPlayerLinkViewModel({
    user,
    isSupabaseConfigured,
    syncLoading,
    checkingLinkedPlayer,
    linkedPlayerCheckFailed,
    players,
    linkProposals,
    cloudLinkedPlayer,
    cloudPendingProposal,
  });
  const linkedPlayer = playerLinkVm.linkedPlayer;

  const pendingProposal = playerLinkVm.pendingProposal;

  const pendingPlayer = playerLinkVm.pendingPlayer;

  // Filtra atletas disponíveis para se vincular (sem userId e que não sejam convidados)
  const availablePlayers = playerLinkVm.availablePlayers;
  const pendingSyncIssueRecovery =
    recoverableSyncActions?.primaryAction &&
    recoverableSyncActions.primaryActionLabel &&
    syncIssueSummary?.openCount &&
    onRetryPrimarySyncAction
      ? {
          actionLabel: recoverableSyncActions.primaryActionLabel,
          onRetry: onRetryPrimarySyncAction,
          openCount: syncIssueSummary.openCount,
          totalOpenOccurrences: syncIssueSummary.totalOpenOccurrences,
        }
      : null;

  const handleAction = async (name: string, fn: () => Promise<void>) => {
    setError(null);
    setSuccess(null);
    setActionLoading(true);
    try {
      await fn();
      setSuccess(`Operação "${name}" concluída com sucesso!`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || `Erro ao realizar a operação: ${name}`);
    } finally {
      setActionLoading(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="card card-border border-warning/20 bg-warning/5 max-w-xl mx-auto p-6 rounded-2xl">
        <div className="card-body gap-4 text-center items-center">
          <AlertCircle className="w-12 h-12 text-warning animate-bounce" />
          <h2 className="card-title text-warning uppercase font-black tracking-wider">
            Nuvem Não Configurada
          </h2>
          <p className="text-xs text-base-content/70 max-w-md">
            As variáveis de ambiente do Supabase não foram encontradas no arquivo <code>.env</code>.
            O aplicativo está funcionando no modo <strong>100% local</strong>.
          </p>
          <p className="text-xs text-base-content/50 italic border-t border-base-300 pt-4 w-full">
            Para ativar o backup em nuvem, configure <code>VITE_SUPABASE_URL</code> e{' '}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> no seu arquivo <code>.env</code>.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="text-xs font-bold uppercase tracking-wider text-base-content/60">
          Carregando Sessão...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <div className="text-center max-w-md mx-auto">
          <Cloud className="w-12 h-12 text-primary mx-auto opacity-70 mb-2" />
          <h2 className="text-2xl font-black uppercase tracking-tight">Sincronização em Nuvem</h2>
          <p className="text-xs text-base-content/60 mt-1">
            Faça backup dos seus atletas, comunidades e regras diretamente na nuvem para nunca
            perder o progresso.
          </p>
        </div>
        <AuthForm onSignIn={onSignIn} onSignUp={onSignUp} loading={loading} />
      </div>
    );
  }

  const roleLabel =
    profile?.role === 'master'
      ? 'Master (Dono do App)'
      : profile?.role === 'programmer'
        ? 'Programador / Suporte'
        : 'Usuário';

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20">
      {/* Account Info Header */}
      <div className="card card-border bg-base-200 shadow-xl rounded-2xl">
        <div className="card-body gap-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-base-300 pb-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-black uppercase text-sm">
                {profile?.name?.slice(0, 2).toUpperCase() || 'AD'}
              </div>
              <div>
                <h3 className="font-black text-lg text-base-content uppercase tracking-tight">
                  {profile?.name || user.email.split('@')[0]}
                </h3>
                <p className="text-[10px] text-base-content/60 font-mono">{user.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="badge badge-accent badge-soft uppercase text-[9px] font-black tracking-wider flex items-center gap-1.5 py-3 px-3">
                <Shield className="w-3.5 h-3.5" />
                {roleLabel}
              </span>
              <button
                onClick={() => handleAction('Sair da Conta', onSignOut)}
                disabled={actionLoading}
                className="btn btn-ghost btn-square btn-sm text-error"
                title="Sair da Conta"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sync Stats */}
          <div className="stats bg-base-100 shadow-sm border border-base-300 w-full">
            <div className="stat">
              <div className="stat-title text-[10px] font-bold uppercase tracking-wider text-base-content/50">
                Último Backup
              </div>
              <div className="stat-value text-base mt-1 text-base-content font-black">
                {lastSyncedAt
                  ? new Date(lastSyncedAt).toLocaleString('pt-BR')
                  : 'Nunca sincronizado'}
              </div>
              <div className="stat-desc text-[9px] font-medium text-base-content/40 flex items-center gap-1 mt-1">
                <Calendar className="w-3 h-3" />
                Estratégia: Última modificação vence (LWW)
              </div>
            </div>
          </div>

          {/* Alerts */}
          {error && (
            <div className="alert alert-error alert-soft text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="alert alert-success alert-soft text-xs flex items-start gap-2">
              <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* Backup & Sync Controls */}
          <div className="space-y-4 pt-2">
            <h4 className="text-xs font-black uppercase tracking-widest text-base-content/50">
              Operações de Sincronização
            </h4>

            {pendingSyncIssueRecovery ? (
              <div className="bg-warning/10 border border-warning/25 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-base-content">
                      Falhas de nuvem pendentes
                    </p>
                    <p className="text-[10px] text-base-content/60 mt-1 font-medium">
                      {pendingSyncIssueRecovery.openCount} item(ns),{' '}
                      {pendingSyncIssueRecovery.totalOpenOccurrences} ocorrencia(s)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    handleAction(pendingSyncIssueRecovery.actionLabel, async () => {
                      await pendingSyncIssueRecovery.onRetry();
                    })
                  }
                  disabled={actionLoading || syncLoading}
                  className="btn btn-warning btn-sm uppercase text-[10px] font-black tracking-wider shrink-0"
                >
                  {actionLoading || syncLoading ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {pendingSyncIssueRecovery.actionLabel}
                </button>
              </div>
            ) : null}

            <button
              onClick={() => handleAction('Sincronizar agora', onSync)}
              disabled={actionLoading || syncLoading}
              className="btn btn-primary btn-block justify-center gap-3 p-4 h-auto uppercase text-xs tracking-wider font-bold"
            >
              {actionLoading || syncLoading ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span> Processando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin-slow" /> Sincronizar Agora (Mesclar
                  Dados)
                </>
              )}
            </button>

            <button
              onClick={() => handleAction('Sanear duplicatas antigas', onRepairDuplicates)}
              disabled={actionLoading || syncLoading}
              className="btn btn-outline btn-block justify-center gap-3 p-4 h-auto uppercase text-xs tracking-wider font-bold"
            >
              {actionLoading || syncLoading ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span> Processando...
                </>
              ) : (
                <>
                  <Wrench className="w-4 h-4" /> Sanear Duplicatas Antigas
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Vínculo com Perfil de Atleta */}
      <div className="card card-border bg-base-200 shadow-xl rounded-2xl">
        <div className="card-body gap-4">
          <div className="flex items-center gap-3 border-b border-base-300 pb-3">
            <Users className="w-5 h-5 text-accent" />
            <h3 className="font-black text-sm text-base-content uppercase tracking-wider">
              Vínculo com Perfil de Atleta
            </h3>
          </div>

          {playerLinkVm.state === 'checking' ? (
            <div className="bg-base-100 border border-base-300 p-4 rounded-xl flex items-center gap-3">
              <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />
              <div>
                <p className="text-xs font-bold text-base-content uppercase">
                  Verificando vinculo de atleta
                </p>
                <p className="text-[10px] text-base-content/55 mt-0.5">
                  Buscando o estado da nuvem antes de oferecer uma nova solicitacao.
                </p>
              </div>
            </div>
          ) : linkedPlayer ? (
            <div className="bg-success/10 border border-success/20 p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success/25 border border-success/35 flex items-center justify-center font-bold text-success text-xs">
                  {linkedPlayer.nome.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-xs font-bold text-base-content flex items-center gap-1.5">
                    {linkedPlayer.apelido || linkedPlayer.nome}
                    <span className="badge badge-success badge-xs font-bold uppercase tracking-wider gap-0.5">
                      <UserCheck className="w-2.5 h-2.5" /> Vinculado
                    </span>
                  </p>
                  <p className="text-[9px] text-base-content/50 uppercase font-mono mt-0.5">
                    {linkedPlayer.posicaoPrincipal} • {linkedPlayer.genero}
                  </p>
                </div>
              </div>
            </div>
          ) : pendingProposal ? (
            <div className="bg-warning/10 border border-warning/20 p-4 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-warning/25 border border-warning/35 flex items-center justify-center font-bold text-warning text-xs">
                  {pendingPlayer?.nome.slice(0, 2).toUpperCase() || '??'}
                </div>
                <div>
                  <p className="text-xs font-bold text-base-content flex items-center gap-1.5">
                    {pendingPlayer?.apelido || pendingPlayer?.nome || 'Jogador Desconhecido'}
                    <span className="badge badge-warning badge-xs font-bold uppercase tracking-wider">
                      Pendente
                    </span>
                  </p>
                  <p className="text-[9px] text-base-content/65 mt-0.5">
                    Aguardando aprovação do administrador da comunidade.
                  </p>
                </div>
              </div>
              <div>
                <button
                  type="button"
                  onClick={async () => {
                    setCancelling(true);
                    try {
                      if (onCancelLink) await onCancelLink(pendingProposal.id);
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setCancelling(false);
                    }
                  }}
                  disabled={cancelling}
                  className="btn btn-ghost hover:bg-error/15 hover:text-error btn-xs font-bold uppercase"
                >
                  {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Cancelar'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {playerLinkVm.state === 'check_failed' && (
                <div className="alert alert-warning alert-soft text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Nao foi possivel verificar o vinculo ou uma solicitacao pendente na nuvem agora.
                    Sincronize antes de solicitar um novo vinculo.
                  </span>
                </div>
              )}

              <p className="text-xs text-base-content/75 leading-relaxed">
                Você não possui um perfil de jogador vinculado a esta conta de usuário. Selecione a
                sua ficha abaixo para solicitar o vínculo com a sua conta.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <select
                  value={selectedPlayerId}
                  onChange={(e) => setSelectedPlayerId(e.target.value)}
                  className="select select-bordered select-sm flex-1 font-bold text-xs uppercase"
                  disabled={claiming || !playerLinkVm.canRequestLink}
                >
                  <option value="">-- Selecione sua Ficha de Atleta --</option>
                  {availablePlayers.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.apelido || player.nome} ({player.posicaoPrincipal} • {player.genero})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={async () => {
                    if (!selectedPlayerId) return;
                    setClaiming(true);
                    try {
                      if (onProposeLink) await onProposeLink(selectedPlayerId);
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setClaiming(false);
                    }
                  }}
                  disabled={!selectedPlayerId || claiming || !playerLinkVm.canRequestLink}
                  className="btn btn-primary btn-sm font-bold uppercase"
                >
                  {claiming ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Solicitar Vínculo'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
