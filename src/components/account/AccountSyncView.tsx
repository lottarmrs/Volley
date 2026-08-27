import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import {
  RefreshCw,
  LogOut,
  Shield,
  Calendar,
  CheckCircle,
  AlertCircle,
  Wrench,
  History,
  Command,
} from 'lucide-react';
import { buildCloudHealthViewModel } from '../../application/cloudHealthViewModel';
import type { ScreenContract } from '@app/screens/screenContract';
import type { AccountSyncViewModel } from '@app/screens/accountSyncView/accountSyncViewModel';
import type { AccountSyncViewIntent } from '@app/screens/accountSyncView/accountSyncViewIntents';
import { SyncConflictSection } from './SyncConflictSection';

export function AccountSyncView({
  contract,
}: {
  contract: ScreenContract<AccountSyncViewModel, AccountSyncViewIntent>;
}) {
  const { model, dispatch } = contract;
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Atalho de Teclado (Ctrl+S ou Cmd+S) para acionar Sincronização rápida
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!actionLoading && !model.syncLoading) {
          void handleAction('Sincronizar agora', () => dispatch({ kind: 'sync' }));
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actionLoading, model.syncLoading, dispatch]);

  const pendingSyncIssueRecovery =
    model.recoverableSyncActions?.primaryAction &&
    model.recoverableSyncActions.primaryActionLabel &&
    model.syncIssueSummary?.openCount
      ? {
          actionLabel: model.recoverableSyncActions.primaryActionLabel,
          openCount: model.syncIssueSummary.openCount,
          totalOpenOccurrences: model.syncIssueSummary.totalOpenOccurrences,
        }
      : null;
  const recentOpenSyncIssues = model.syncIssueSummary?.latestOpen ?? [];
  const resolvedSyncIssueCount = model.syncIssueSummary?.resolvedCount ?? 0;
  const cloudHealth = buildCloudHealthViewModel({
    isSupabaseConfigured: model.isSupabaseConfigured,
    hasUser: !!model.user,
    lastSyncedAt: model.lastSyncedAt,
    openIssueCount: model.syncIssueSummary?.openCount ?? 0,
    totalOpenOccurrences: model.syncIssueSummary?.totalOpenOccurrences ?? 0,
  });
  const cloudHealthTone =
    cloudHealth.level === 'operational'
      ? 'border-success/25 bg-success/10 text-success'
      : cloudHealth.level === 'attention'
        ? 'border-warning/25 bg-warning/10 text-warning'
        : 'border-error/25 bg-error/10 text-error';

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

  if (!model.isSupabaseConfigured) {
    return (
      <div className="card card-border border-warning/20 bg-warning/5 max-w-xl mx-auto p-6 rounded-2xl">
        <div className="card-body gap-4 text-center items-center">
          <AlertCircle className="w-12 h-12 text-warning animate-pulse" />
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

  if (model.loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <span className="loading loading-spinner loading-lg text-primary"></span>
        <p className="text-xs font-bold uppercase tracking-wider text-base-content/60">
          Carregando Sessão...
        </p>
      </div>
    );
  }

  const roleLabel =
    model.profile?.role === 'master'
      ? 'Master (Dono do App)'
      : model.profile?.role === 'programmer'
        ? 'Programador / Suporte'
        : 'Usuário';

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-20 px-4 sm:px-0">
      {/* Perfil & Informações da Conta */}
      <div className="card card-border bg-base-200 shadow-xl rounded-2xl overflow-hidden">
        <div className="card-body gap-5 p-5 sm:p-6">
          {/* Cabeçalho do Perfil & Ações de Segurança */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-base-300/80 pb-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center text-primary font-black uppercase text-base shrink-0 shadow-inner">
                {model.profile?.name?.slice(0, 2).toUpperCase() || 'AD'}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-black text-lg text-base-content uppercase tracking-tight">
                    {model.profile?.name || model.user.email.split('@')[0]}
                  </h3>
                  <span className="badge badge-accent badge-soft uppercase text-[10px] font-extrabold tracking-wider flex items-center gap-1 py-2 px-2.5">
                    <Shield className="w-3 h-3" />
                    {roleLabel}
                  </span>
                </div>
                <p className="text-xs text-base-content/60 font-mono break-all">
                  {model.user.email}
                </p>
              </div>
            </div>

            {/* Ações de Segurança / Conta */}
            <div className="flex items-center gap-2 flex-wrap pt-2 md:pt-0 border-t md:border-t-0 border-base-300/50">
              <button
                type="button"
                className="btn btn-outline btn-xs sm:btn-sm text-[11px] font-bold min-h-[44px] sm:min-h-0"
                onClick={() =>
                  handleAction('Vincular Google', () => dispatch({ kind: 'linkGoogleIdentity' }))
                }
                disabled={actionLoading}
              >
                Vincular Google
              </button>
              <Link
                to="/configurar-mfa"
                className="btn btn-outline btn-xs sm:btn-sm text-[11px] font-bold min-h-[44px] sm:min-h-0"
              >
                Autenticação em Duas Etapas (MFA)
              </Link>
              <button
                onClick={() => handleAction('Sair da Conta', () => dispatch({ kind: 'signOut' }))}
                disabled={actionLoading}
                className="btn btn-ghost btn-square btn-xs sm:btn-sm text-error min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
                title="Sair da Conta"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Cartão de Estatística de Backup */}
          <div className="stats bg-base-100/80 shadow-sm border border-base-300/70 w-full rounded-xl">
            <div className="stat p-4">
              <div className="stat-title text-[10px] font-bold uppercase tracking-wider text-base-content/50">
                Último Backup na Nuvem
              </div>
              <div className="stat-value text-base mt-1 text-base-content font-mono font-bold">
                {model.lastSyncedAt
                  ? new Date(model.lastSyncedAt).toLocaleString('pt-BR')
                  : 'Nunca sincronizado'}
              </div>
              <div className="stat-desc text-[10px] font-medium text-base-content/50 flex items-center gap-1.5 mt-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                Estratégia: Última modificação vence (LWW)
              </div>
            </div>
          </div>

          {/* Diagnóstico da Nuvem */}
          <div className={`border rounded-xl p-4 transition-all ${cloudHealthTone}`}>
            <div className="flex items-start gap-3">
              {cloudHealth.level === 'operational' ? (
                <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 animate-pulse" />
              )}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest opacity-70">
                  Diagnóstico da Nuvem
                </p>
                <p className="text-sm font-black uppercase tracking-tight mt-1">
                  {cloudHealth.title}
                </p>
                <p className="text-[11px] font-medium opacity-80 mt-0.5">{cloudHealth.detail}</p>
              </div>
            </div>
          </div>

          {/* Alertas */}
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

          {/* Ação Principal: Sincronizar Agora */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-widest text-base-content/60">
                Sincronização Principal
              </h4>
            </div>

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
                      {pendingSyncIssueRecovery.totalOpenOccurrences} ocorrência(s)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() =>
                    handleAction(pendingSyncIssueRecovery.actionLabel, () =>
                      dispatch({ kind: 'retryPrimarySyncAction' }),
                    )
                  }
                  disabled={actionLoading || model.syncLoading}
                  className="btn btn-warning btn-sm uppercase text-[10px] font-black tracking-wider shrink-0 min-h-[44px] sm:min-h-0"
                >
                  {actionLoading || model.syncLoading ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5" />
                  )}
                  {pendingSyncIssueRecovery.actionLabel}
                </button>
              </div>
            ) : null}

            <button
              onClick={() => handleAction('Sincronizar agora', () => dispatch({ kind: 'sync' }))}
              disabled={actionLoading || model.syncLoading}
              className="btn btn-primary btn-block justify-center gap-3 p-4 h-auto min-h-[52px] uppercase text-xs tracking-wider font-extrabold shadow-md hover:shadow-lg transition-all"
            >
              {actionLoading || model.syncLoading ? (
                <>
                  <span className="loading loading-spinner loading-xs"></span> Processando...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Sincronizar Agora (Mesclar Dados)</span>
                  <kbd className="kbd kbd-xs bg-primary-content/20 text-primary-content border-none font-mono hidden sm:inline-flex ml-1">
                    Ctrl+S
                  </kbd>
                </>
              )}
            </button>

            <SyncConflictSection
              conflicts={model.syncConflicts ?? []}
              onKeepMine={(sessionId) => {
                void dispatch({ kind: 'keepMineConflict', sessionId });
              }}
              onKeepTheirs={(sessionId) => {
                void dispatch({ kind: 'keepTheirsConflict', sessionId });
              }}
            />

            {/* Manutenção & Ferramentas Avançadas */}
            <details className="group border border-base-300/70 rounded-xl bg-base-100/50 overflow-hidden">
              <summary className="flex items-center justify-between p-4 cursor-pointer select-none font-bold text-xs uppercase tracking-wider text-base-content/70 hover:bg-base-200/50 transition-colors">
                <span className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-primary" /> Ferramentas Avançadas e Manutenção
                </span>
                <span className="text-[10px] text-base-content/40 group-open:rotate-180 transition-transform">
                  ▼
                </span>
              </summary>

              <div className="p-4 pt-2 space-y-4 border-t border-base-300/50">
                <button
                  onClick={() =>
                    handleAction('Sanear duplicatas antigas', () =>
                      dispatch({ kind: 'repairDuplicates' }),
                    )
                  }
                  disabled={actionLoading || model.syncLoading}
                  className="btn btn-outline btn-block justify-center gap-3 p-3 h-auto min-h-[44px] uppercase text-xs tracking-wider font-bold"
                >
                  {actionLoading || model.syncLoading ? (
                    <>
                      <span className="loading loading-spinner loading-xs"></span> Processando...
                    </>
                  ) : (
                    <>
                      <Wrench className="w-4 h-4" /> Limpar e Mesclar Duplicatas
                    </>
                  )}
                </button>

                {recentOpenSyncIssues.length ? (
                  <div className="bg-base-200/50 border border-base-300/70 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-base-content/50" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-base-content/60">
                        Histórico Recente de Falhas
                      </p>
                    </div>
                    <div className="space-y-2">
                      {recentOpenSyncIssues.map((issue) => (
                        <div
                          key={issue.id}
                          className="border border-base-300/70 rounded-lg p-3 bg-base-100/80"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <p className="text-xs font-black text-base-content">
                              {issue.operation}
                            </p>
                            <span className="badge badge-warning badge-soft text-[9px] font-black uppercase">
                              {issue.count} tentativa(s)
                            </span>
                          </div>
                          <p className="text-[10px] font-bold text-base-content/60 mt-1">
                            {issue.context}
                          </p>
                          <p className="text-[10px] text-base-content/55 mt-1 break-words font-mono">
                            {issue.message}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {resolvedSyncIssueCount > 0 ? (
                  <div className="bg-base-200/40 border border-base-300/70 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <p className="text-[10px] font-bold text-base-content/60">
                      {resolvedSyncIssueCount} falha(s) resolvida(s) no histórico local
                    </p>
                    <button
                      onClick={() =>
                        handleAction('Limpar falhas resolvidas', () =>
                          dispatch({ kind: 'clearResolvedSyncIssues' }),
                        )
                      }
                      disabled={actionLoading || model.syncLoading}
                      className="btn btn-ghost btn-xs uppercase text-[10px] font-black tracking-wider min-h-[36px]"
                    >
                      Limpar resolvidas
                    </button>
                  </div>
                ) : null}
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
