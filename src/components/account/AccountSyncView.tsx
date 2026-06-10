import React, { useState } from 'react';
import { UserProfile } from '../../types';
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
} from 'lucide-react';
import { AuthForm } from './AuthForm';

interface AccountSyncViewProps {
  user: any;
  profile: UserProfile | null;
  loading: boolean;
  isSupabaseConfigured: boolean;
  onSignIn: (email: string, password: string) => Promise<any>;
  onSignUp: (email: string, password: string, name?: string) => Promise<any>;
  onSignOut: () => Promise<void>;

  // Sync actions
  onUpload: () => Promise<void>;
  onDownload: () => Promise<void>;
  onSync: () => Promise<void>;
  lastSyncedAt: string | null;
  syncLoading: boolean;
}

export function AccountSyncView({
  user,
  profile,
  loading,
  isSupabaseConfigured,
  onSignIn,
  onSignUp,
  onSignOut,
  onUpload,
  onDownload,
  onSync,
  lastSyncedAt,
  syncLoading,
}: AccountSyncViewProps) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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

  const roleLabel = profile?.role === 'admin' ? 'Administrador Geral' : 'Organizador';

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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => handleAction('Enviar dados para nuvem', onUpload)}
                disabled={actionLoading || syncLoading}
                className="btn btn-outline hover:btn-primary justify-start gap-3 p-4 h-auto text-left uppercase text-xs tracking-wider"
              >
                <CloudUpload className="w-5 h-5 text-primary" />
                <div>
                  <div className="font-bold">Enviar para a Nuvem</div>
                  <div className="text-[9px] opacity-60 lowercase font-normal mt-0.5">
                    Envia dados locais (sobrescreve a nuvem)
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleAction('Baixar dados da nuvem', onDownload)}
                disabled={actionLoading || syncLoading}
                className="btn btn-outline hover:btn-secondary justify-start gap-3 p-4 h-auto text-left uppercase text-xs tracking-wider"
              >
                <CloudDownload className="w-5 h-5 text-secondary" />
                <div>
                  <div className="font-bold">Baixar da Nuvem</div>
                  <div className="text-[9px] opacity-60 lowercase font-normal mt-0.5">
                    Substitui os dados locais pelos da nuvem
                  </div>
                </div>
              </button>
            </div>

            <button
              onClick={() => handleAction('Sincronizar agora', onSync)}
              disabled={actionLoading || syncLoading}
              className="btn btn-primary btn-block uppercase tracking-wider text-xs font-bold py-4 h-auto"
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
          </div>
        </div>
      </div>
    </div>
  );
}
