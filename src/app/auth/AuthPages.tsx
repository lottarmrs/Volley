import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { AuthForm } from '../../components/account/AuthForm';
import type { MfaEnrollment } from '@app/authClient';
import { useAuthSession } from './useAuthSession';
import { routeForAuthState } from './authRoutes';
import { CaptchaField } from './CaptchaField';
import { captchaSiteKey } from './captchaEnv';
import { validatePasswordLength } from './passwordPolicy';

function destinationFromLocationState(state: unknown): string {
  const from = (state as { from?: { pathname?: string } } | null)?.from?.pathname;
  return from ?? '/';
}

function TotpEnrollmentForm({
  enrollment,
  code,
  onCodeChange,
  onSubmit,
  error,
}: {
  enrollment: MfaEnrollment;
  code: string;
  onCodeChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  error: string | null;
}) {
  return (
    <form onSubmit={onSubmit}>
      <p>Escaneie o QR code no seu aplicativo autenticador.</p>
      <img src={enrollment.qrCode} alt="QR code para configurar autenticacao em duas etapas" />
      <p>Ou insira o codigo manualmente: {enrollment.secret}</p>
      <label htmlFor="totp-code">Código de 6 dígitos</label>
      <input
        id="totp-code"
        inputMode="numeric"
        maxLength={6}
        value={code}
        onChange={(event) => onCodeChange(event.target.value)}
      />
      {error ? <p role="alert">{error}</p> : null}
      <button type="submit">Ativar</button>
    </form>
  );
}

// Sem este efeito o login "conclui" mas a tela continua no formulario: nada
// reage a sessao que o AuthSessionProvider acabou de resolver.
export function LoginPage({ mode }: { mode: 'signin' | 'signup' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { state, authClient } = useAuthSession();
  useEffect(() => {
    if (state.kind === 'initializing' || state.kind === 'anonymous') return;
    navigate(routeForAuthState(state) ?? destinationFromLocationState(location.state), {
      replace: true,
    });
  }, [state, navigate, location.state]);
  return (
    <AuthForm
      mode={mode}
      loading={false}
      onSignIn={authClient.signIn}
      onSignUp={authClient.signUp}
      onGoogle={authClient.signInWithGoogle}
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
  const { session, authClient } = useAuthSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
  const captchaPending = Boolean(captchaSiteKey()) && !captchaToken;
  const [newPassword, setNewPassword] = useState('');
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updated, setUpdated] = useState(false);

  // Supabase cria uma sessao temporaria de recuperacao quando o usuario
  // chega por aqui via link do e-mail (ver redirectTo em authClient.ts).
  // Presenca de sessao == veio do link; sem sessao == acessou a pagina direto.
  if (session) {
    return (
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setUpdateError(null);
          // Sem esta checagem o GoTrue recusa a senha curta e a mensagem em ingles
          // dele vaza direto para a tela pelo catch abaixo.
          const lengthError = validatePasswordLength(newPassword);
          if (lengthError) {
            setUpdateError(lengthError);
            return;
          }
          try {
            await authClient.updatePassword(newPassword);
            try {
              await authClient.signOutOthers();
            } catch {
              // Nao bloqueia a mensagem de sucesso: a senha ja foi trocada,
              // e invalidar as outras sessoes e um reforco de seguranca, nao
              // um pre-requisito para o usuario seguir em frente.
            }
            setUpdated(true);
          } catch (cause) {
            setUpdateError(
              cause instanceof Error ? cause.message : 'Nao foi possivel atualizar a senha.',
            );
          }
        }}
      >
        <label htmlFor="new-password">Nova senha</label>
        <input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        {updateError ? <p role="alert">{updateError}</p> : null}
        <button type="submit">Salvar nova senha</button>
        {updated ? (
          <>
            <p>Senha atualizada com sucesso.</p>
            <button type="button" onClick={() => navigate('/', { replace: true })}>
              Continuar
            </button>
          </>
        ) : null}
      </form>
    );
  }

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await authClient.requestPasswordRecovery(email, captchaToken);
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
      <CaptchaField onToken={setCaptchaToken} />
      <button type="submit" disabled={captchaPending}>
        Enviar recuperacao
      </button>
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

// Aguarda o AuthSessionProvider reconciliar a sessao, depois segue para a rota
// correspondente ao novo estado. Serve /auth/callback (retorno do OAuth) e
// /auth/loading (destino do AuthGuard enquanto o estado e 'initializing') — sem
// isso, a rota de loading fica presa no spinner depois que a sessao resolve.
export function AuthTransitionPage() {
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
      <h2 className="text-xl font-black uppercase tracking-wider">Não foi possível continuar</h2>
      {message ? <p className="text-xs text-base-content/60 max-w-md">{message}</p> : null}
      <button type="button" className="btn btn-primary btn-sm" onClick={() => void retry()}>
        Tentar novamente
      </button>
    </div>
  );
}

export function MfaSetupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { retry, authClient } = useAuthSession();
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startedRef = useRef(false);

  useEffect(() => {
    // enrollTotp cria um fator no servidor — nao e idempotente. O StrictMode monta o
    // efeito duas vezes em dev, e duas inscricoes concorrentes disputam o mesmo
    // friendly_name vazio: a segunda leva 422 e a tela morre no erro. Por isso a
    // inscricao roda uma vez por instancia da pagina.
    //
    // Sem flag de "cancelado" de proposito: com o guard acima, o cleanup do
    // StrictMode cancelaria justamente a unica inscricao em voo e a tela ficaria
    // presa no spinner para sempre. Escrever estado apos desmontar e inofensivo.
    if (startedRef.current) return;
    startedRef.current = true;
    authClient
      .enrollTotp()
      .then(setEnrollment)
      .catch((cause) => {
        setError(
          cause instanceof Error ? cause.message : 'Nao foi possivel iniciar a configuracao.',
        );
      });
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await authClient.verifyTotp(code, enrollment?.factorId);
      // verifyTotp por si so nao dispara onAuthStateChange no provider (ver
      // AuthSessionProvider.spec.tsx); sem retry() o estado fica preso em
      // mfa_setup_required e o navigate abaixo seria imediatamente revertido
      // pelo AuthGuard.
      await retry();
      navigate(destinationFromLocationState(location.state), { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Codigo invalido.');
    }
  };

  // Sem este ramo o erro de enroll fica invisivel: a tela cai no spinner de
  // AuthLoadingPage e nunca sai dele, porque `error` so era renderizado dentro do
  // formulario, que por sua vez depende de `enrollment`. Com MFA obrigatorio esta
  // pagina e o unico caminho para master/programmer/owner/admin, entao uma falha
  // silenciosa aqui tranca a conta fora do app.
  if (!enrollment && error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
        <h2 className="text-xl font-black uppercase tracking-wider">
          Nao foi possivel iniciar a configuracao
        </h2>
        <p role="alert" className="text-xs text-base-content/60 max-w-md">
          {error}
        </p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            setError(null);
            void authClient
              .enrollTotp()
              .then(setEnrollment)
              .catch((cause) => {
                setError(
                  cause instanceof Error
                    ? cause.message
                    : 'Nao foi possivel iniciar a configuracao.',
                );
              });
          }}
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!enrollment) return <AuthLoadingPage />;

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
      <h2 className="text-xl font-black uppercase tracking-wider">
        Configurar autenticacao em duas etapas
      </h2>
      <TotpEnrollmentForm
        enrollment={enrollment}
        code={code}
        onCodeChange={setCode}
        onSubmit={(event) => void handleSubmit(event)}
        error={error}
      />
    </div>
  );
}

// Se a sessao exige AAL2 e nao houver fator TOTP verificado ainda,
// verifyTotp() rejeita com essa mensagem (ver authClient.ts) e a pagina
// alterna para o fluxo de enrollment em vez de mostrar um erro sem saida.
const NO_VERIFIED_FACTOR_MESSAGE = 'Nenhum fator TOTP verificado.';

export function MfaChallengePage() {
  const { retry, authClient } = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);

  const proceed = async (factorId?: string) => {
    if (factorId) {
      await authClient.verifyTotp(code, factorId);
    } else {
      await authClient.verifyTotp(code);
    }
    await retry();
    navigate(destinationFromLocationState(location.state), { replace: true });
  };

  const handleChallengeSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await proceed();
    } catch (cause) {
      if (cause instanceof Error && cause.message === NO_VERIFIED_FACTOR_MESSAGE) {
        setCode('');
        try {
          setEnrollment(await authClient.enrollTotp());
        } catch (enrollCause) {
          setError(
            enrollCause instanceof Error
              ? enrollCause.message
              : 'Nao foi possivel iniciar a configuracao.',
          );
        }
        return;
      }
      setError(cause instanceof Error ? cause.message : 'Codigo invalido.');
    }
  };

  const handleEnrollSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await proceed(enrollment?.factorId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Codigo invalido.');
    }
  };

  if (enrollment) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
        <h2 className="text-xl font-black uppercase tracking-wider">
          Configurar autenticacao em duas etapas
        </h2>
        <TotpEnrollmentForm
          enrollment={enrollment}
          code={code}
          onCodeChange={setCode}
          onSubmit={(event) => void handleEnrollSubmit(event)}
          error={error}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center px-4">
      <h2 className="text-xl font-black uppercase tracking-wider">Confirme sua identidade</h2>
      <form onSubmit={(event) => void handleChallengeSubmit(event)}>
        <label htmlFor="challenge-code">Código de 6 dígitos</label>
        <input
          id="challenge-code"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit">Confirmar</button>
      </form>
    </div>
  );
}
