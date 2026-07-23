import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AuthForm } from '../../components/account/AuthForm';
import { supabaseAuthClient } from '@infra/supabase/authClient';
import { useAuthSession } from './AuthSessionProvider';
import { routeForAuthState } from './AuthGuard';

export function LoginPage({ mode }: { mode: 'signin' | 'signup' }) {
  const navigate = useNavigate();
  return (
    <AuthForm
      mode={mode}
      loading={false}
      onSignIn={supabaseAuthClient.signIn}
      onSignUp={supabaseAuthClient.signUp}
      onGoogle={supabaseAuthClient.signInWithGoogle}
      onForgotPassword={() => navigate('/recuperar-senha')}
    />
  );
}

export function UsernameOnboardingPage() {
  const { completeUsername } = useAuthSession();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        try {
          await completeUsername(username);
          const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
          navigate(from ?? '/', { replace: true });
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Nao foi possivel salvar o username.');
        }
      }}
    >
      <label htmlFor="username">Username</label>
      <input id="username" value={username} onChange={(event) => setUsername(event.target.value)} />
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit">Continuar</button>
    </form>
  );
}

export function PasswordRecoveryPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await supabaseAuthClient.requestPasswordRecovery(email);
        setSent(true);
      }}
    >
      <label htmlFor="recovery-email">E-mail</label>
      <input
        id="recovery-email"
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button type="submit">Enviar recuperacao</button>
      {sent ? <p>Confira seu e-mail.</p> : null}
    </form>
  );
}

export function AuthLoadingPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <span className="loading loading-spinner loading-lg text-primary"></span>
      <p className="text-xs font-bold uppercase tracking-wider text-base-content/60">
        Carregando Sessão...
      </p>
    </div>
  );
}

// Aguarda o provider OAuth concluir e o AuthSessionProvider reconciliar a
// sessao, depois segue para a rota correspondente ao novo estado.
export function AuthCallbackPage() {
  const { state } = useAuthSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (state.kind === 'initializing') return;
    navigate(routeForAuthState(state) ?? '/', { replace: true });
  }, [state, navigate]);
  return <AuthLoadingPage />;
}

export function EmailVerificationPage() {
  const { signOut } = useAuthSession();
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
      <h2 className="text-xl font-black uppercase tracking-wider">Confirme seu e-mail</h2>
      <p className="text-xs text-base-content/60 max-w-md">
        Enviamos um link de confirmacao para o seu e-mail. Clique no link para continuar.
      </p>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
        Sair da conta
      </button>
    </div>
  );
}

export function RecoverableSessionPage() {
  const { state, retry } = useAuthSession();
  const message = state.kind === 'recoverable_error' ? state.message : null;
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
      <h2 className="text-xl font-black uppercase tracking-wider">Nao foi possivel continuar</h2>
      {message ? <p className="text-xs text-base-content/60 max-w-md">{message}</p> : null}
      <button type="button" className="btn btn-primary btn-sm" onClick={() => void retry()}>
        Tentar novamente
      </button>
    </div>
  );
}

// Para manter a arvore compilavel antes da Task 7 (que implementa o fluxo
// TOTP real), MFA setup/challenge apenas reaproveitam a tela de espera.
export function MfaSetupPage() {
  return <AuthLoadingPage />;
}

export function MfaChallengePage() {
  return <AuthLoadingPage />;
}
