import React, { useState } from 'react';
import { Mail, Lock, User, LogIn, UserPlus, AlertCircle } from 'lucide-react';

interface AuthFormProps {
  onSignIn: (email: string, password: string) => Promise<any>;
  onSignUp: (email: string, password: string, name?: string) => Promise<any>;
  loading: boolean;
}

export function AuthForm({ onSignIn, onSignUp, loading }: AuthFormProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!email.trim() || !password.trim()) {
      setError('Por favor, preencha todos os campos.');
      return;
    }

    if (password.length < 6) {
      setError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    try {
      if (isSignUp) {
        await onSignUp(email, password, name.trim() || undefined);
        setSuccess('Conta criada com sucesso! Verifique seu e-mail ou tente fazer o login.');
        setName('');
        setPassword('');
      } else {
        await onSignIn(email, password);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro ao processar a autenticação.');
    }
  };

  return (
    <div className="card card-border bg-base-200 w-full max-w-md mx-auto shadow-xl">
      <div className="card-body gap-4">
        <div className="text-center">
          <h2 className="card-title justify-center text-xl uppercase font-black tracking-wider text-base-content">
            {isSignUp ? 'Criar Nova Conta' : 'Entrar no Sistema'}
          </h2>
          <p className="text-xs text-base-content/60 mt-1">
            {isSignUp 
              ? 'Cadastre-se para sincronizar seus dados na nuvem.' 
              : 'Faça login para acessar seus dados sincronizados.'}
          </p>
        </div>

        {error && (
          <div className="alert alert-error alert-soft text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="alert alert-success alert-soft text-xs flex items-start gap-2">
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div className="form-control">
              <label className="label text-xs font-bold uppercase tracking-wider">
                <span className="label-text">Nome de Exibição</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
                <input
                  type="text"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input input-bordered pl-10 w-full"
                  disabled={loading}
                />
              </div>
            </div>
          )}

          <div className="form-control">
            <label className="label text-xs font-bold uppercase tracking-wider">
              <span className="label-text">E-mail</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
              <input
                type="email"
                placeholder="exemplo@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input input-bordered pl-10 w-full"
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="form-control">
            <label className="label text-xs font-bold uppercase tracking-wider">
              <span className="label-text">Senha</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input input-bordered pl-10 w-full"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                disabled={loading}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block uppercase tracking-wider text-xs font-bold mt-2"
            disabled={loading}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : isSignUp ? (
              <>
                <UserPlus className="w-4 h-4" /> Criar Conta
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" /> Entrar
              </>
            )}
          </button>
        </form>

        <div className="divider text-[10px] opacity-50 uppercase tracking-widest">Ou</div>

        <div className="text-center">
          <button
            type="button"
            className="btn btn-ghost btn-sm text-xs font-semibold text-primary"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
              setSuccess(null);
            }}
            disabled={loading}
          >
            {isSignUp 
              ? 'Já possui uma conta? Faça login' 
              : 'Não tem conta? Cadastre-se grátis'}
          </button>
        </div>
      </div>
    </div>
  );
}
