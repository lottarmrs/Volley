import React, { useState } from 'react';
import { Link } from 'react-router';
import { Mail, Lock, User, AtSign, LogIn, UserPlus, AlertCircle, Chrome } from 'lucide-react';

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/;

export interface AuthFormProps {
  mode: 'signin' | 'signup';
  loading: boolean;
  onSignIn(email: string, password: string): Promise<void>;
  onSignUp(email: string, password: string, name: string, username: string): Promise<void>;
  onGoogle(): Promise<void>;
  onForgotPassword(): void;
}

export function AuthForm({
  mode,
  loading,
  onSignIn,
  onSignUp,
  onGoogle,
  onForgotPassword,
}: AuthFormProps) {
  const isSignUp = mode === 'signup';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
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
        const normalizedUsername = username.trim().toLowerCase();
        if (!USERNAME_PATTERN.test(normalizedUsername)) {
          setError('Username invalido. Use de 3 a 30 letras minusculas, numeros, _ ou -.');
          return;
        }
        await onSignUp(email, password, name.trim(), normalizedUsername);
        setSuccess('Conta criada com sucesso! Verifique seu e-mail ou tente fazer o login.');
        setName('');
        setUsername('');
        setPassword('');
      } else {
        await onSignIn(email, password);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocorreu um erro ao processar a autenticação.');
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setSuccess(null);
    try {
      await onGoogle();
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
          <div className="alert alert-error alert-soft text-xs flex items-start gap-2" role="alert">
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
              <label className="label text-xs font-bold uppercase tracking-wider" htmlFor="auth-name">
                <span className="label-text">Nome de exibicao</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
                <input
                  id="auth-name"
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

          {isSignUp && (
            <div className="form-control">
              <label
                className="label text-xs font-bold uppercase tracking-wider"
                htmlFor="auth-username"
              >
                <span className="label-text">Username</span>
              </label>
              <div className="relative">
                <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
                <input
                  id="auth-username"
                  type="text"
                  placeholder="seu-username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input input-bordered pl-10 w-full"
                  disabled={loading}
                  required
                />
              </div>
            </div>
          )}

          <div className="form-control">
            <label className="label text-xs font-bold uppercase tracking-wider" htmlFor="auth-email">
              <span className="label-text">E-mail</span>
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
              <input
                id="auth-email"
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
            <label
              className="label text-xs font-bold uppercase tracking-wider"
              htmlFor="auth-password"
            >
              <span className="label-text">Senha</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-50" />
              <input
                id="auth-password"
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

          {!isSignUp && (
            <div className="text-right -mt-2">
              <button
                type="button"
                className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
                onClick={onForgotPassword}
                disabled={loading}
              >
                Esqueci minha senha
              </button>
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-block uppercase tracking-wider text-xs font-bold mt-2"
            disabled={loading}
          >
            {loading ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : isSignUp ? (
              <>
                <UserPlus className="w-4 h-4" /> Criar conta
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" /> Entrar
              </>
            )}
          </button>
        </form>

        <div className="divider text-[10px] opacity-50 uppercase tracking-widest">Ou</div>

        <button
          type="button"
          className="btn btn-outline btn-block uppercase tracking-wider text-xs font-bold gap-2"
          onClick={handleGoogle}
          disabled={loading}
        >
          <Chrome className="w-4 h-4" /> Continuar com Google
        </button>

        <div className="text-center">
          <Link
            to={isSignUp ? '/entrar' : '/cadastro'}
            className="btn btn-ghost btn-sm text-xs font-semibold text-primary"
          >
            {isSignUp ? 'Já possui uma conta? Faça login' : 'Não tem conta? Cadastre-se grátis'}
          </Link>
        </div>
      </div>
    </div>
  );
}
